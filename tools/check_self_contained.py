# SPDX-FileCopyrightText: 2026 Massimo Antonini
# SPDX-License-Identifier: MPL-2.0
"""Checks that every extension folder is self-contained (EXT-102, ADR-0001).

Each ext-* folder at the root of the repository must be movable to a repository of its own with
`git filter-repo --subdirectory-filter ext-<name>` and build there without changes. So a file of an
extension never refers to a file outside its folder; another extension, or Mosaikit, is used only
through a published package (Maven coordinates, an npm package, a URL). The check fails on:

- a relative path that leaves the folder: `../`, in any text file (imports, links, tsconfig
  `extends`, `<relativePath>`, `<module>`, `file:` dependencies, scripts);
- a link of a Markdown file to the root of the repository (`](/docs/...)`);
- an npm dependency on a workspace (`workspace:`), or on a path (`file:`, `link:`, `portal:`)
  outside the folder;
- a POM whose `<parent>` has no `<relativePath/>`: Maven would look for it in ../pom.xml;
- a symbolic link whose target is outside the folder;
- a folder without its README, or, once it has a build (pom.xml), without its manifest, changelog,
  requirements or tests.

    python tools/check_self_contained.py              # every ext-* folder of the repository
    python tools/check_self_contained.py ext-catalog  # only these folders, or any extension directory
"""
from __future__ import annotations

import argparse
import io
import json
import os
import re
import sys
from dataclasses import dataclass

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
# What the build, npm and the bench write: never part of the sources of the extension.
SKIPPED = {"node_modules", "target", "lib", "dist", ".mosaikit-bench", "test-results", "playwright-report", ".git"}
# What an extension with a build holds besides its README (ADR-0001: build, sources, tests, changelog,
# README and requirements).
WITH_BUILD = ("manifest.yaml", "CHANGELOG.md", "docs/requirements", "tests")
# A relative path that starts with `..`, alone or followed by a separator, at the start of a token: not
# in the middle of a URL or of a word.
PARENT_PATH = re.compile(r"""(?:^|(?<=[\s'"`(=<>\[{,:]))((?:\./)*\.\.(?:[\\/][^\s'"`()<>\[\]{},;|]*)?)(?=$|[\s'"`)<>\]},;|])""")
ROOT_LINK = re.compile(r"\]\((/[^)\s]*)\)")
PATH_PROTOCOL = re.compile(r"^(file|link|portal):(.*)$")
DEPENDENCIES = ("dependencies", "devDependencies", "peerDependencies", "optionalDependencies")


@dataclass(frozen=True)
class Problem:
    path: str
    line: int
    message: str

    def __str__(self) -> str:
        return f"{self.path}:{self.line}: {self.message}" if self.line else f"{self.path}: {self.message}"


def inside(folder: str, path: str) -> bool:
    folder = os.path.normcase(os.path.realpath(folder))
    path = os.path.normcase(os.path.realpath(path))
    return path == folder or path.startswith(folder + os.sep)


def files_of(folder: str):
    """Every file and symbolic link of the folder, without what builds write."""
    for base, dirs, files in os.walk(folder):
        links = [d for d in dirs if os.path.islink(os.path.join(base, d))]
        dirs[:] = sorted(d for d in dirs if d not in SKIPPED and d not in links)
        for name in sorted(files + links):
            yield os.path.join(base, name)


def text_of(path: str) -> str | None:
    try:
        with open(path, "rb") as f:
            data = f.read()
    except OSError:
        return None
    if b"\0" in data:
        return None
    try:
        return data.decode("utf-8")
    except UnicodeDecodeError:
        return None


def check_text(folder: str, path: str, text: str, shown: str) -> list[Problem]:
    problems = []
    base = os.path.dirname(path)
    name = os.path.basename(path)
    for number, line in enumerate(text.splitlines(), 1):
        for match in PARENT_PATH.finditer(line):
            target = match.group(1).replace("\\", "/")
            if not inside(folder, os.path.join(base, target)):
                problems.append(Problem(shown, number, f"refers to {target}, outside the folder"))
        if name.lower().endswith(".md"):
            for match in ROOT_LINK.finditer(line):
                problems.append(Problem(shown, number, f"links {match.group(1)} at the root of the repository"))
    if name == "package.json":
        problems += check_package(folder, path, text, shown)
    if name == "pom.xml":
        problems += check_pom(text, shown)
    return problems


def check_package(folder: str, path: str, text: str, shown: str) -> list[Problem]:
    try:
        package = json.loads(text)
    except ValueError as e:
        return [Problem(shown, 0, f"is not JSON: {e}")]
    problems = []
    if "workspaces" in package:
        problems.append(Problem(shown, 0, "declares workspaces: an extension is a package of its own"))
    for group in DEPENDENCIES:
        for dependency, spec in (package.get(group) or {}).items():
            spec = str(spec)
            if spec.startswith("workspace:"):
                problems.append(Problem(shown, 0, f"{dependency} comes from a workspace, not from a published package"))
                continue
            match = PATH_PROTOCOL.match(spec)
            if match and not inside(folder, os.path.join(os.path.dirname(path), match.group(2))):
                problems.append(Problem(shown, 0, f"{dependency} comes from {spec}, outside the folder"))
    return problems


def check_pom(text: str, shown: str) -> list[Problem]:
    parent = re.search(r"<parent>(.*?)</parent>", text, re.S)
    # A relativePath that leaves the folder is found as a ../ path; here only the missing one.
    if parent and "<relativePath" not in parent.group(1):
        line = text[: parent.start()].count("\n") + 1
        return [Problem(shown, line, "the parent has no <relativePath/>: Maven looks for it in ../pom.xml")]
    return []


def check_extension(folder: str, shown_as: str | None = None) -> list[Problem]:
    """The problems of one extension folder; paths are shown relative to the folder's parent."""
    folder = os.path.abspath(folder)
    label = shown_as or os.path.basename(folder)
    problems = []

    def shown(path: str) -> str:
        return f"{label}/{os.path.relpath(path, folder).replace(os.sep, '/')}"

    if not os.path.isfile(os.path.join(folder, "README.md")):
        problems.append(Problem(label, 0, "has no README.md"))
    if os.path.isfile(os.path.join(folder, "pom.xml")):
        for needed in WITH_BUILD:
            if not os.path.exists(os.path.join(folder, needed)):
                problems.append(Problem(label, 0, f"has a build but no {needed}"))
    for path in files_of(folder):
        if os.path.islink(path):
            if not inside(folder, path):
                problems.append(Problem(shown(path), 0, f"is a link to {os.readlink(path)}, outside the folder"))
            continue
        text = text_of(path)
        if text is not None:
            problems += check_text(folder, path, text, shown(path))
    return problems


def extensions(root: str) -> list[str]:
    return sorted(
        os.path.join(root, name)
        for name in os.listdir(root)
        if name.startswith("ext-") and os.path.isdir(os.path.join(root, name))
    )


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    parser.add_argument("folders", nargs="*", help="extension folders (default: every ext-* of the repository)")
    args = parser.parse_args(argv)
    folders = [os.path.abspath(f) for f in args.folders] or extensions(ROOT)
    problems = []
    built = 0
    for folder in folders:
        built += os.path.isfile(os.path.join(folder, "pom.xml"))
        problems += check_extension(folder)
    for problem in problems:
        print("error  ", problem)
    print(f"{len(folders)} extensions ({built} with a build), {len(problems)} errors")
    return 1 if problems else 0


if __name__ == "__main__":
    sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding="utf-8", line_buffering=True)
    sys.exit(main())
