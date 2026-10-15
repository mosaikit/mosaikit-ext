# SPDX-FileCopyrightText: 2026 Massimo Antonini
# SPDX-License-Identifier: MPL-2.0
"""Releases one extension from a tag ext-<name>/vX.Y.Z (EXT-103, ADR-0001).

Each extension of the repository is published on its own, as io.github.mosaikit.ext:ext-<name>
with its own version: the package zip in Maven Central (the channel of the Maven artifacts of
Mosaikit, ADR-0025) and attached to a GitHub release of the tag. The release workflow only calls
these commands; the decisions are here, where the tests can reach them.

    python tools/release.py check ext-catalog/v0.2.0          # refuses a tag the extension does not match
    python tools/release.py notes ext-catalog/v0.2.0          # the CHANGELOG section of that version
    python tools/release.py pom ext-catalog OUT.pom           # the POM to publish, with its required extensions
    python tools/release.py bundle ext-catalog/v0.2.0 OUT.zip [--sign]   # the Central Portal bundle
    python tools/release.py publish OUT.zip NAME              # upload to Central and wait (CENTRAL_USERNAME/PASSWORD)
    python tools/release.py closure ext-catalog-connection-postgres      # what a product installs with it

What a product gets. The published POM declares, as dependencies of type zip, the extensions that the
manifest `requires` (MK-132), with their range of versions in the syntax of Maven; the ones the
manifest lists as `optional` are left out. So a product that declares one extension by coordinates
and version resolves that zip and the zips of the extensions it requires, transitively, and nothing
else. `closure` computes the same set from the manifests of the repository.

Needs PyYAML (`pip install pyyaml`) to read the manifests.
"""
from __future__ import annotations

import argparse
import base64
import hashlib
import io
import json
import os
import re
import subprocess
import sys
import tempfile
import time
import urllib.parse
import urllib.request
import uuid
import zipfile
from dataclasses import dataclass, field
from xml.dom import minidom
from xml.etree import ElementTree

import yaml

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
GROUP = "io.github.mosaikit.ext"
ID_PREFIX = "io.github.mosaikit.ext."
POM_NS = "http://maven.apache.org/POM/4.0.0"
SEMVER = r"(?:0|[1-9]\d*)\.(?:0|[1-9]\d*)\.(?:0|[1-9]\d*)(?:-[0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*)?"
TAG = re.compile(rf"^(?:refs/tags/)?(ext-[a-z][a-z0-9]*(?:-[a-z][a-z0-9]*)*)/v({SEMVER})$")
CENTRAL = "https://central.sonatype.com/api/v1/publisher"


class ReleaseError(Exception):
    """A release that must not go on; the message says why."""


# --------------------------------------------------------------------------------------------------
# Versions and ranges, as the kernel reads them in manifests (VersionRange of kernel-api)
# --------------------------------------------------------------------------------------------------

@dataclass(frozen=True, order=False)
class Version:
    major: int
    minor: int
    patch: int
    pre: tuple[str, ...] = ()

    @staticmethod
    def parse(text: str) -> "Version":
        match = re.fullmatch(r"(\d+)\.(\d+)\.(\d+)(?:-([0-9A-Za-z.-]+))?(?:\+[0-9A-Za-z.-]+)?", text.strip())
        if not match:
            raise ReleaseError(f"{text!r} is not a semantic version")
        pre = tuple(match.group(4).split(".")) if match.group(4) else ()
        return Version(int(match.group(1)), int(match.group(2)), int(match.group(3)), pre)

    def key(self) -> tuple:
        # Semantic Versioning 2.0.0, 11: a pre-release is lower than its normal version; numeric
        # identifiers are lower than alphanumeric ones.
        pre = tuple((0, int(p), "") if p.isdigit() else (1, 0, p) for p in self.pre)
        return (self.major, self.minor, self.patch, 0 if self.pre else 1, pre)

    def core(self) -> tuple[int, int, int]:
        return (self.major, self.minor, self.patch)

    def __str__(self) -> str:
        return f"{self.major}.{self.minor}.{self.patch}" + (f"-{'.'.join(self.pre)}" if self.pre else "")


@dataclass(frozen=True)
class Bound:
    version: Version
    inclusive: bool


@dataclass(frozen=True)
class Interval:
    """Versions between two bounds; None is unbounded. `bounds` are the versions the range names."""
    low: Bound | None
    high: Bound | None
    bounds: tuple[Version, ...] = field(default=())

    def contains(self, version: Version) -> bool:
        if self.low:
            c = _cmp(version, self.low.version)
            if c < 0 or (c == 0 and not self.low.inclusive):
                return False
        if self.high:
            c = _cmp(version, self.high.version)
            if c > 0 or (c == 0 and not self.high.inclusive):
                return False
        # As the kernel: a pre-release matches only a range that names a pre-release of the same version.
        return not version.pre or any(b.pre and b.core() == version.core() for b in self.bounds)

    def empty(self) -> bool:
        if not self.low or not self.high:
            return False
        c = _cmp(self.low.version, self.high.version)
        return c > 0 or (c == 0 and not (self.low.inclusive and self.high.inclusive))

    def maven(self) -> str:
        if self.low and self.high and self.low.inclusive and self.high.inclusive \
                and _cmp(self.low.version, self.high.version) == 0:
            return f"[{self.low.version}]"
        left = ("[" if self.low.inclusive else "(") + str(self.low.version) if self.low else "("
        right = str(self.high.version) + ("]" if self.high.inclusive else ")") if self.high else ")"
        return f"{left},{right}"


def _cmp(a: Version, b: Version) -> int:
    return (a.key() > b.key()) - (a.key() < b.key())


def _partial(text: str, source: str) -> tuple[int, int | None, int | None, tuple[str, ...]]:
    match = re.fullmatch(r"v?(\d+)(?:\.(\d+|[xX*]))?(?:\.(\d+|[xX*]))?(?:-([0-9A-Za-z.-]+))?(?:\+[0-9A-Za-z.-]+)?", text)
    if not match:
        raise ReleaseError(f"{source!r} is not a range of versions")
    major = int(match.group(1))
    minor = int(match.group(2)) if match.group(2) and match.group(2).isdigit() else None
    patch = int(match.group(3)) if minor is not None and match.group(3) and match.group(3).isdigit() else None
    pre = tuple(match.group(4).split(".")) if match.group(4) and patch is not None else ()
    return major, minor, patch, pre


def _comparator(token: str, source: str) -> tuple[Bound | None, Bound | None, Version]:
    operator = re.match(r"(>=|<=|>|<|=|\^|~)?", token).group(1) or ""
    major, minor, patch, pre = _partial(token[len(operator):], source)
    floor = Version(major, minor or 0, patch or 0, pre)
    complete = patch is not None
    after = Version(major + 1, 0, 0) if minor is None else Version(major, minor + 1, 0) if patch is None else floor
    if operator == "^":
        if major > 0 or minor is None:
            ceiling = Version(major + 1, 0, 0)
        elif minor > 0 or patch is None:
            ceiling = Version(0, minor + 1, 0)
        else:
            ceiling = Version(0, 0, patch + 1)
        return Bound(floor, True), Bound(ceiling, False), floor
    if operator == "~":
        ceiling = Version(major + 1, 0, 0) if minor is None else Version(major, minor + 1, 0)
        return Bound(floor, True), Bound(ceiling, False), floor
    if operator == ">=":
        return Bound(floor, True), None, floor
    if operator == ">":
        return (Bound(floor, False) if complete else Bound(after, True)), None, floor
    if operator == "<":
        return None, Bound(floor, False), floor
    if operator == "<=":
        return None, (Bound(floor, True) if complete else Bound(after, False)), floor
    if complete:
        return Bound(floor, True), Bound(floor, True), floor
    return Bound(floor, True), Bound(after, False), floor


def parse_range(text: str) -> list[Interval]:
    """A range of the manifests (`^0.1`, `>=1.4 <2`, `1.2.x || 2`), as intervals: the forms of the kernel."""
    intervals = []
    for alternative in str(text).split("||"):
        alternative = re.sub(r"(>=|<=|>|<|=|\^|~)\s+", r"\1", alternative.strip())
        if alternative in ("", "*", "x", "X"):
            intervals.append(Interval(Bound(Version(0, 0, 0), True), None, ()))
            continue
        low = high = None
        named = []
        for token in alternative.split():
            lower, upper, version = _comparator(token, text)
            named.append(version)
            if lower and (low is None or _cmp(lower.version, low.version) > 0
                          or (_cmp(lower.version, low.version) == 0 and not lower.inclusive)):
                low = lower
            if upper and (high is None or _cmp(upper.version, high.version) < 0
                          or (_cmp(upper.version, high.version) == 0 and not upper.inclusive)):
                high = upper
        interval = Interval(low, high, tuple(named))
        if interval.empty():
            raise ReleaseError(f"{text!r} accepts no version")
        intervals.append(interval)
    return intervals


def maven_range(text: str) -> str:
    """The same range in the syntax of Maven: `^0.1` is `[0.1.0,0.2.0)`, `1.2.3` is `[1.2.3]`."""
    return ",".join(i.maven() for i in parse_range(text))


def satisfies(version: str, text: str) -> bool:
    v = Version.parse(version)
    return any(i.contains(v) for i in parse_range(text))


# --------------------------------------------------------------------------------------------------
# Extensions of the repository
# --------------------------------------------------------------------------------------------------

@dataclass
class Extension:
    folder: str
    name: str                        # ext-catalog
    manifest: dict
    pom: ElementTree.Element | None

    @property
    def id(self) -> str:
        return str(self.manifest.get("id", ""))

    @property
    def version(self) -> str:
        return str(self.manifest.get("version", ""))

    def requires(self) -> dict[str, str]:
        return {str(k): str(v) for k, v in (self.manifest.get("requires") or {}).items()}

    def optional(self) -> dict[str, str]:
        return {str(k): str(v) for k, v in (self.manifest.get("optional") or {}).items()}

    def pom_text(self, *path: str) -> str | None:
        node = self.pom
        for name in path:
            if node is None:
                return None
            node = node.find(f"{{{POM_NS}}}{name}")
        return None if node is None else (node.text or "").strip()


def expected_id(name: str) -> str:
    """ext-catalog-connection is io.github.mosaikit.ext.catalog.connection (README, Naming)."""
    return ID_PREFIX + name[len("ext-"):].replace("-", ".")


def load(folder: str) -> Extension:
    folder = os.path.abspath(folder)
    name = os.path.basename(folder)
    manifest_path = os.path.join(folder, "manifest.yaml")
    if not os.path.isfile(manifest_path):
        raise ReleaseError(f"{name} has no manifest.yaml")
    with open(manifest_path, encoding="utf-8") as f:
        manifest = yaml.safe_load(f) or {}
    pom_path = os.path.join(folder, "pom.xml")
    pom = ElementTree.parse(pom_path).getroot() if os.path.isfile(pom_path) else None
    return Extension(folder, name, manifest, pom)


def extensions(root: str = ROOT) -> dict[str, Extension]:
    """The extensions of the repository that have a manifest, by manifest id."""
    found = {}
    for name in sorted(os.listdir(root)):
        folder = os.path.join(root, name)
        if name.startswith("ext-") and os.path.isfile(os.path.join(folder, "manifest.yaml")):
            extension = load(folder)
            found[extension.id] = extension
    return found


def parse_tag(tag: str) -> tuple[str, str]:
    match = TAG.match(tag.strip())
    if not match:
        raise ReleaseError(f"{tag!r} is not a release tag ext-<name>/vX.Y.Z")
    return match.group(1), match.group(2)


# --------------------------------------------------------------------------------------------------
# check: the tag, the build, the manifest and the changelog agree
# --------------------------------------------------------------------------------------------------

def changelog_section(folder: str, version: str) -> str:
    """The section `## [version]` of the CHANGELOG.md of the folder, without its heading."""
    path = os.path.join(folder, "CHANGELOG.md")
    if not os.path.isfile(path):
        raise ReleaseError(f"{os.path.basename(folder)} has no CHANGELOG.md")
    with open(path, encoding="utf-8") as f:
        lines = f.read().splitlines()
    heading = re.compile(rf"^##\s+\[{re.escape(version)}\](\s|$)")
    section = None
    for line in lines:
        if section is None:
            if heading.match(line):
                section = []
        elif line.startswith("## "):
            break
        else:
            section.append(line)
    if section is None:
        raise ReleaseError(f"{os.path.basename(folder)}/CHANGELOG.md has no section [{version}]")
    # The link definitions of Keep a Changelog ([0.1.0]: https://...) close the file, not the section.
    while section and (not section[-1].strip() or re.match(r"^\[[^\]]+\]:\s", section[-1])):
        section.pop()
    while section and not section[0].strip():
        section.pop(0)
    if not any(line.strip() for line in section):
        raise ReleaseError(f"{os.path.basename(folder)}/CHANGELOG.md has an empty section [{version}]")
    return "\n".join(section) + "\n"


def check(tag: str, root: str = ROOT) -> Extension:
    """Every reason to refuse the tag before anything is published, all at once."""
    name, version = parse_tag(tag)
    folder = os.path.join(root, name)
    if not os.path.isdir(folder):
        raise ReleaseError(f"no extension {name} in the repository")
    if not os.path.isfile(os.path.join(folder, "pom.xml")):
        raise ReleaseError(f"{name} has no build (pom.xml) to release")
    extension = load(folder)
    errors = []
    group = extension.pom_text("groupId")
    artifact = extension.pom_text("artifactId")
    if group != GROUP:
        errors.append(f"{name}/pom.xml has groupId {group}, not {GROUP}")
    if artifact != name:
        errors.append(f"{name}/pom.xml has artifactId {artifact}, not {name}")
    pom_version = extension.pom_text("version")
    if pom_version != version:
        errors.append(f"{name}/pom.xml has version {pom_version}, the tag {version}")
    if extension.version != version:
        errors.append(f"{name}/manifest.yaml has version {extension.version or None}, the tag {version}")
    if extension.id != expected_id(name):
        errors.append(f"{name}/manifest.yaml has id {extension.id or None}, not {expected_id(name)}")
    package_json = os.path.join(folder, "package.json")
    if os.path.isfile(package_json):
        with open(package_json, encoding="utf-8") as f:
            npm_version = json.load(f).get("version")
        if npm_version != version:
            errors.append(f"{name}/package.json has version {npm_version}, the tag {version}")
    parent = extension.pom_text("parent", "version") or ""
    if parent.endswith("-SNAPSHOT"):
        errors.append(f"{name}/pom.xml has the parent {parent}: a released POM whose parent is a snapshot "
                      "does not resolve; release it on a released parent of Mosaikit extensions")
    try:
        changelog_section(folder, version)
    except ReleaseError as e:
        errors.append(str(e))
    errors += requires_problems(extension, extensions(root))
    if errors:
        raise ReleaseError("\n".join(errors))
    return extension


def requires_problems(extension: Extension, known: dict[str, Extension]) -> list[str]:
    """A required extension must be one of this repository, published under the same group, and its
    range valid; optional ones may come from anywhere and are never installed with it."""
    problems = []
    for required, accepted in extension.requires().items():
        if required not in known:
            problems.append(f"{extension.name} requires {required}, which is not an extension of this repository")
        try:
            parse_range(accepted)
        except ReleaseError as e:
            problems.append(f"{extension.name} requires {required} {e}")
    for used, accepted in extension.optional().items():
        try:
            parse_range(accepted)
        except ReleaseError as e:
            problems.append(f"{extension.name} uses {used} {e}")
    return problems


# --------------------------------------------------------------------------------------------------
# closure: what a product gets with an extension
# --------------------------------------------------------------------------------------------------

def closure(names: list[str], root: str = ROOT) -> list[Extension]:
    """The extensions named (folder or manifest id) and those they require, transitively, from the
    manifests of the repository; optional ones are not included. Fails on a required extension that
    is missing or whose version in the repository is outside the accepted range."""
    known = extensions(root)
    by_name = {e.name: e for e in known.values()}
    result: dict[str, Extension] = {}
    errors = []
    pending = []
    for name in names:
        extension = known.get(name) or by_name.get(name)
        if extension is None:
            raise ReleaseError(f"no extension {name} in the repository")
        pending.append(extension)
    while pending:
        extension = pending.pop(0)
        if extension.id in result:
            continue
        result[extension.id] = extension
        for required, accepted in extension.requires().items():
            other = known.get(required)
            if other is None:
                errors.append(f"{extension.name} requires {required}, which is not an extension of this repository")
            elif not satisfies(other.version, accepted):
                errors.append(f"{extension.name} requires {required} {accepted}, the repository has {other.version}")
            else:
                pending.append(other)
    if errors:
        raise ReleaseError("\n".join(errors))
    return list(result.values())


# --------------------------------------------------------------------------------------------------
# What is published: notes, POM, bundle
# --------------------------------------------------------------------------------------------------

def notes(tag: str, root: str = ROOT) -> str:
    """The release notes of a tag: the CHANGELOG section of that version of that extension only, and how
    to get the package."""
    name, version = parse_tag(tag)
    folder = os.path.join(root, name)
    text = changelog_section(folder, version)
    extension = load(folder)
    lines = ["", "## Package", "", f"- Maven: `{GROUP}:{name}:{version}`, type `zip`"]
    for required, accepted in extension.requires().items():
        lines.append(f"- Requires `{required}` `{accepted}`, installed with it")
    for used, accepted in extension.optional().items():
        lines.append(f"- Uses `{used}` `{accepted}` when it is installed")
    return text + "\n".join(lines) + "\n"


def artifact_of(extension_id: str) -> str:
    return "ext-" + extension_id[len(ID_PREFIX):].replace(".", "-")


def published_pom(folder: str) -> str:
    """The POM of the extension as it is published: packaging pom (the package is the zip next to it,
    and Central asks sources and Javadoc of any other packaging), and one dependency of type zip for
    each required extension with its range in the syntax of Maven, so that resolving the extension
    brings those it requires and not the optional ones."""
    extension = load(folder)
    with open(os.path.join(folder, "pom.xml"), encoding="utf-8") as f:
        document = minidom.parseString(f.read())
    project = document.documentElement

    def child(parent, tag):
        return next((n for n in parent.childNodes if n.nodeType == n.ELEMENT_NODE and n.tagName == tag), None)

    def element(tag, text=None):
        node = document.createElement(tag)
        if text is not None:
            node.appendChild(document.createTextNode(text))
        return node

    packaging = child(project, "packaging")
    if packaging is None:
        packaging = element("packaging", "pom")
        version = child(project, "version")
        project.insertBefore(packaging, version.nextSibling if version else project.firstChild)
    else:
        for n in list(packaging.childNodes):
            packaging.removeChild(n)
        packaging.appendChild(document.createTextNode("pom"))
    requires = extension.requires()
    if requires:
        dependencies = child(project, "dependencies")
        if dependencies is None:
            dependencies = element("dependencies")
            project.appendChild(dependencies)
            project.appendChild(document.createTextNode("\n"))
        for required, accepted in requires.items():
            dependency = element("dependency")
            for tag, value in (("groupId", GROUP), ("artifactId", artifact_of(required)),
                               ("version", maven_range(accepted)), ("type", "zip")):
                dependency.appendChild(element(tag, value))
            dependencies.appendChild(dependency)
    text = document.toxml(encoding="UTF-8").decode("utf-8")
    text = re.sub(r"^(<\?xml[^>]*\?>)(?!\n)", r"\1\n", text)
    return text if text.endswith("\n") else text + "\n"


def bundle(tag: str, output: str, sign: bool = False, root: str = ROOT) -> list[str]:
    """The bundle of the Central Portal: the POM and the zip under the path of their coordinates, each
    with its MD5 and SHA-1, and its signature (.asc, by gpg) with `sign`. The package must have been
    built (mvn package): target/ext-<name>-<version>.zip."""
    name, version = parse_tag(tag)
    folder = os.path.join(root, name)
    package = os.path.join(folder, "target", f"{name}-{version}.zip")
    if not os.path.isfile(package):
        raise ReleaseError(f"{os.path.relpath(package, root)} is missing: run mvn package in {name} first")
    with open(package, "rb") as f:
        files = {f"{name}-{version}.pom": published_pom(folder).encode("utf-8"), f"{name}-{version}.zip": f.read()}
    if sign:
        files.update({f"{file}.asc": gpg_sign(data) for file, data in list(files.items())})
    for file, data in list(files.items()):
        if not file.endswith(".asc"):
            files[f"{file}.md5"] = hashlib.md5(data).hexdigest().encode("ascii")
            files[f"{file}.sha1"] = hashlib.sha1(data).hexdigest().encode("ascii")
    base = "/".join(GROUP.split(".") + [name, version])
    with zipfile.ZipFile(output, "w", zipfile.ZIP_DEFLATED) as z:
        for file in sorted(files):
            z.writestr(f"{base}/{file}", files[file])
    return sorted(f"{base}/{file}" for file in files)


def gpg_sign(data: bytes) -> bytes:
    """An armored detached signature, with the key imported in gpg and the passphrase of
    MAVEN_GPG_PASSPHRASE (on standard input, never on the command line), as the release of Mosaikit
    signs its artifacts."""
    with tempfile.TemporaryDirectory(prefix="ext-103-sign-") as scratch:
        path = os.path.join(scratch, "file")
        with open(path, "wb") as f:
            f.write(data)
        command = ["gpg", "--batch", "--yes", "--armor", "--detach-sign", "--output", "-"]
        passphrase = os.environ.get("MAVEN_GPG_PASSPHRASE")
        if passphrase:
            command[1:1] = ["--pinentry-mode", "loopback", "--passphrase-fd", "0"]
        result = subprocess.run(command + [path], input=(passphrase or "").encode("utf-8"), capture_output=True)
    if result.returncode != 0:
        raise ReleaseError("gpg could not sign: " + result.stderr.decode("utf-8", "replace").strip())
    return result.stdout


# --------------------------------------------------------------------------------------------------
# publish: the Central Portal API, as the central-publishing-maven-plugin of Mosaikit uses it
# --------------------------------------------------------------------------------------------------

def publish(bundle_path: str, name: str, username: str, password: str, opener=urllib.request.urlopen,
            wait: float = 1800, every: float = 10, sleep=time.sleep) -> str:
    """Uploads the bundle with automatic publication and waits until Central has published it; fails
    when Central refuses it (the reasons are in the error). Returns the id of the deployment."""
    token = base64.b64encode(f"{username}:{password}".encode("utf-8")).decode("ascii")
    headers = {"Authorization": f"Bearer {token}"}
    boundary = uuid.uuid4().hex
    with open(bundle_path, "rb") as f:
        content = f.read()
    body = (f"--{boundary}\r\nContent-Disposition: form-data; name=\"bundle\"; "
            f"filename=\"{os.path.basename(bundle_path)}\"\r\nContent-Type: application/octet-stream\r\n\r\n"
            ).encode("utf-8") + content + f"\r\n--{boundary}--\r\n".encode("utf-8")
    query = urllib.parse.urlencode({"name": name, "publishingType": "AUTOMATIC"})
    request = urllib.request.Request(f"{CENTRAL}/upload?{query}", data=body, method="POST", headers={
        **headers, "Content-Type": f"multipart/form-data; boundary={boundary}"})
    with opener(request) as response:
        deployment = response.read().decode("utf-8").strip()
    print(f"deployment {deployment} uploaded", file=sys.stderr)
    waited = 0.0
    while True:
        status = urllib.request.Request(f"{CENTRAL}/status?id={urllib.parse.quote(deployment)}", data=b"",
                                        method="POST", headers=headers)
        with opener(status) as response:
            answer = json.loads(response.read().decode("utf-8"))
        state = answer.get("deploymentState")
        print(f"deployment {deployment}: {state}", file=sys.stderr)
        if state == "PUBLISHED":
            return deployment
        if state == "FAILED":
            raise ReleaseError(f"Central refused deployment {deployment}: {json.dumps(answer.get('errors'))}")
        if waited >= wait:
            raise ReleaseError(f"deployment {deployment} still {state} after {int(wait)} s")
        sleep(every)
        waited += every


# --------------------------------------------------------------------------------------------------

def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    parser.add_argument("--root", default=ROOT, help="the repository (default: the one of this script)")
    commands = parser.add_subparsers(dest="command", required=True)
    c = commands.add_parser("check", help="refuse a tag that the extension does not match; prints folder, "
                                          "version, artifact and prerelease as name=value lines")
    c.add_argument("tag")
    c = commands.add_parser("notes", help="the release notes of a tag")
    c.add_argument("tag")
    c = commands.add_parser("pom", help="the POM to publish")
    c.add_argument("folder")
    c.add_argument("output")
    c = commands.add_parser("bundle", help="the bundle for the Central Portal")
    c.add_argument("tag")
    c.add_argument("output")
    c.add_argument("--sign", action="store_true", help="sign every file with gpg")
    c = commands.add_parser("publish", help="upload a bundle to Central and wait until it is published")
    c.add_argument("bundle")
    c.add_argument("name")
    c = commands.add_parser("closure", help="the extensions a product gets with these ones")
    c.add_argument("names", nargs="+")
    args = parser.parse_args(argv)
    try:
        if args.command == "check":
            extension = check(args.tag, args.root)
            _, version = parse_tag(args.tag)
            print(f"folder={extension.name}\nversion={version}\nartifact={GROUP}:{extension.name}:{version}\n"
                  f"prerelease={'true' if '-' in version else 'false'}")
        elif args.command == "notes":
            sys.stdout.write(notes(args.tag, args.root))
        elif args.command == "pom":
            with open(args.output, "w", encoding="utf-8", newline="\n") as f:
                f.write(published_pom(os.path.abspath(args.folder)))
        elif args.command == "bundle":
            for file in bundle(args.tag, args.output, args.sign, args.root):
                print(file)
        elif args.command == "publish":
            username, password = os.environ.get("CENTRAL_USERNAME"), os.environ.get("CENTRAL_PASSWORD")
            if not username or not password:
                raise ReleaseError("CENTRAL_USERNAME and CENTRAL_PASSWORD are not set")
            publish(args.bundle, args.name, username, password)
        elif args.command == "closure":
            for extension in closure(args.names, args.root):
                print(f"{GROUP}:{extension.name}:{extension.version}")
    except ReleaseError as e:
        for line in str(e).splitlines():
            print(f"error  {line}", file=sys.stderr)
        return 1
    return 0


if __name__ == "__main__":
    sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding="utf-8", line_buffering=True)
    sys.exit(main())
