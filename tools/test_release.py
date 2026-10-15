# SPDX-FileCopyrightText: 2026 Massimo Antonini
# SPDX-License-Identifier: MPL-2.0
"""Tests of EXT-103: each extension is published as its own package with its own version.

    python -m unittest discover -s tools -v      # needs PyYAML (pip install pyyaml)

They cover what is decided before anything is published: the tag against the build, the manifest and
the changelog; the release notes; the POM and bundle that Maven Central receives; and the extensions a
product gets with one. The publication itself is shown by the first tag the maintainer pushes.
"""
from __future__ import annotations

import hashlib
import io
import json
import os
import shutil
import sys
import tempfile
import textwrap
import unittest
import zipfile
from xml.etree import ElementTree

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import release  # noqa: E402

NS = {"m": release.POM_NS}

POM = """<?xml version="1.0" encoding="UTF-8"?>
<!-- a comment that stays -->
<project xmlns="http://maven.apache.org/POM/4.0.0">
    <modelVersion>4.0.0</modelVersion>
    <parent>
        <groupId>io.github.mosaikit</groupId>
        <artifactId>mosaikit-extension-parent</artifactId>
        <version>{parent}</version>
        <relativePath/>
    </parent>
    <groupId>{group}</groupId>
    <artifactId>{artifact}</artifactId>
    <version>{version}</version>
    {packaging}
    <name>Example</name>
    {dependencies}
</project>
"""

CHANGELOG = """\
# Changelog of {name}

## [Unreleased]

### Added

- Something not released yet.

## [{version}] - 2026-10-20

### Added

- The first feature of {name}.

### Fixed

- A fix of {name}.

## [0.0.9] - 2026-10-01

- An older entry of {name}.

[{version}]: https://github.com/mosaikit/mosaikit-ext/releases/tag/{name}/v{version}
"""


class Repository:
    """A repository of extensions in a temporary folder."""

    def __init__(self, test: unittest.TestCase) -> None:
        self.root = tempfile.mkdtemp(prefix="ext-103-")
        test.addCleanup(shutil.rmtree, self.root, ignore_errors=True)

    def add(self, name: str, version: str = "0.1.0", *, requires: dict | None = None, optional: dict | None = None,
            pom_version: str | None = None, npm_version: str | None = None, parent: str = "0.1.0",
            artifact: str | None = None, group: str = release.GROUP, ext_id: str | None = None,
            changelog: str | None = None, packaging: str = "<packaging>pom</packaging>",
            dependencies: str = "", build: bool = True) -> str:
        folder = os.path.join(self.root, name)
        os.makedirs(folder, exist_ok=True)
        manifest = {"id": ext_id or release.expected_id(name), "version": version, "name": name, "kind": ["app"]}
        if requires:
            manifest["requires"] = requires
        if optional:
            manifest["optional"] = optional
        self.write(folder, "manifest.yaml", json.dumps(manifest))  # JSON is YAML
        if build:
            self.write(folder, "pom.xml", POM.format(
                parent=parent, group=group, artifact=artifact or name, version=pom_version or version,
                packaging=packaging, dependencies=dependencies))
            self.write(folder, "package.json", json.dumps({"name": name, "version": npm_version or version}))
        self.write(folder, "CHANGELOG.md", CHANGELOG.format(name=name, version=version)
                   if changelog is None else changelog)
        return folder

    @staticmethod
    def write(folder: str, path: str, text: str) -> None:
        with open(os.path.join(folder, path), "w", encoding="utf-8", newline="\n") as f:
            f.write(textwrap.dedent(text))


class TagCheckTest(unittest.TestCase):
    """EXT-103: a tag whose version differs from the version in the extension's build is refused before
    anything is published."""

    def setUp(self) -> None:
        self.repo = Repository(self)

    def refused(self, tag: str, *fragments: str) -> None:
        with self.assertRaises(release.ReleaseError) as caught:
            release.check(tag, self.repo.root)
        for fragment in fragments:
            self.assertIn(fragment, str(caught.exception))

    def test_ext_103_a_tag_that_matches_the_extension_is_accepted(self) -> None:
        """EXT-103: build, manifest, package.json and changelog at the version of the tag."""
        self.repo.add("ext-catalog", "0.2.0")
        self.repo.add("ext-catalog-connection", "0.1.0")
        extension = release.check("ext-catalog/v0.2.0", self.repo.root)
        self.assertEqual((extension.name, extension.version), ("ext-catalog", "0.2.0"))
        self.assertEqual(release.check("refs/tags/ext-catalog-connection/v0.1.0", self.repo.root).name,
                         "ext-catalog-connection")

    def test_ext_103_a_tag_must_name_an_extension_and_a_version(self) -> None:
        """EXT-103: tags are ext-<name>/vX.Y.Z; other tags never release an extension."""
        for tag in ("v0.1.0", "ext-catalog/0.1.0", "ext-catalog/v0.1", "catalog/v0.1.0", "ext-catalog/v01.0.0",
                    "ext-Catalog/v0.1.0", "ext-catalog/v0.1.0/x"):
            with self.subTest(tag=tag), self.assertRaises(release.ReleaseError):
                release.parse_tag(tag)
        self.assertEqual(release.parse_tag("ext-catalog-connection-postgres/v1.2.3-rc.1"),
                         ("ext-catalog-connection-postgres", "1.2.3-rc.1"))

    def test_ext_103_a_version_of_the_build_other_than_the_tag_is_refused(self) -> None:
        """EXT-103: the version of pom.xml is the version of the tag."""
        self.repo.add("ext-catalog", "0.2.0", pom_version="0.1.0")
        self.refused("ext-catalog/v0.2.0", "ext-catalog/pom.xml has version 0.1.0, the tag 0.2.0")

    def test_ext_103_a_version_of_the_manifest_or_package_other_than_the_tag_is_refused(self) -> None:
        """EXT-103: the manifest, which the kernel reads, and package.json carry the same version."""
        self.repo.add("ext-catalog", "0.1.0", pom_version="0.2.0", npm_version="0.1.1",
                      changelog=CHANGELOG.format(name="ext-catalog", version="0.2.0"))
        self.refused("ext-catalog/v0.2.0", "manifest.yaml has version 0.1.0, the tag 0.2.0",
                     "package.json has version 0.1.1, the tag 0.2.0")

    def test_ext_103_a_tag_of_another_extension_never_matches(self) -> None:
        """EXT-103: only the folder of the tag is released, and its coordinates are its own."""
        self.repo.add("ext-catalog", "0.1.0", artifact="ext-catalog-connection")
        self.refused("ext-catalog/v0.1.0", "artifactId ext-catalog-connection, not ext-catalog")
        self.refused("ext-dashboards/v0.1.0", "no extension ext-dashboards")
        self.repo.add("ext-processes", "0.1.0", build=False)
        self.refused("ext-processes/v0.1.0", "has no build")

    def test_ext_103_coordinates_and_id_follow_the_name(self) -> None:
        """EXT-103: io.github.mosaikit.ext:ext-<name>, manifest id io.github.mosaikit.ext.<name>."""
        self.repo.add("ext-catalog", "0.1.0", group="org.example", ext_id="org.example.catalog")
        self.refused("ext-catalog/v0.1.0", "groupId org.example, not io.github.mosaikit.ext",
                     "id org.example.catalog, not io.github.mosaikit.ext.catalog")
        self.assertEqual(release.expected_id("ext-catalog-connection-postgres"),
                         "io.github.mosaikit.ext.catalog.connection.postgres")

    def test_ext_103_a_version_without_changelog_section_is_refused(self) -> None:
        """EXT-103: each extension has its own changelog, with a section for every release."""
        self.repo.add("ext-catalog", "0.2.0", changelog="# Changelog\n\n## [Unreleased]\n\n- Work.\n")
        self.refused("ext-catalog/v0.2.0", "CHANGELOG.md has no section [0.2.0]")
        self.repo.add("ext-catalog", "0.2.0", changelog="# Changelog\n\n## [0.2.0] - 2026-10-20\n\n## [0.1.0]\n\n- Old.\n")
        self.refused("ext-catalog/v0.2.0", "CHANGELOG.md has an empty section [0.2.0]")

    def test_ext_103_a_snapshot_parent_is_refused(self) -> None:
        """EXT-103: a POM released on a snapshot parent would not resolve for the products that use it."""
        self.repo.add("ext-catalog", "0.1.0", parent="0.1.0-SNAPSHOT")
        self.refused("ext-catalog/v0.1.0", "has the parent 0.1.0-SNAPSHOT")

    def test_ext_103_required_extensions_are_extensions_of_the_repository(self) -> None:
        """EXT-103: what an extension requires must be published next to it; optional ones may be anywhere."""
        self.repo.add("ext-catalog-connection", "0.1.0", requires={"io.github.mosaikit.ext.catalog": "^0.1",
                                                                  "org.example.ext.other": "^1"},
                      optional={"org.example.ext.maps": "^2"})
        self.repo.add("ext-catalog", "0.1.0")
        self.refused("ext-catalog-connection/v0.1.0", "requires org.example.ext.other, which is not an extension")
        self.repo.add("ext-catalog-connection", "0.1.0", requires={"io.github.mosaikit.ext.catalog": ">=2 <1"})
        self.refused("ext-catalog-connection/v0.1.0", "accepts no version")
        self.repo.add("ext-catalog-connection", "0.1.0", requires={"io.github.mosaikit.ext.catalog": "^0.1"},
                      optional={"org.example.ext.maps": "^2"})
        release.check("ext-catalog-connection/v0.1.0", self.repo.root)

    def test_ext_103_the_command_prints_what_the_workflow_needs_or_fails(self) -> None:
        """EXT-103: `check` exits 1 with every reason, or prints folder, version and artifact."""
        self.repo.add("ext-catalog", "0.1.0-rc.1")
        out, err = io.StringIO(), io.StringIO()
        streams = sys.stdout, sys.stderr
        sys.stdout, sys.stderr = out, err
        try:
            accepted = release.main(["--root", self.repo.root, "check", "ext-catalog/v0.1.0-rc.1"])
            refused = release.main(["--root", self.repo.root, "check", "ext-catalog/v0.2.0"])
        finally:
            sys.stdout, sys.stderr = streams
        self.assertEqual((accepted, refused), (0, 1))
        self.assertEqual(out.getvalue(), "folder=ext-catalog\nversion=0.1.0-rc.1\n"
                                         "artifact=io.github.mosaikit.ext:ext-catalog:0.1.0-rc.1\nprerelease=true\n")
        self.assertIn("error  ext-catalog/pom.xml has version 0.1.0-rc.1, the tag 0.2.0", err.getvalue())
        self.assertIn("error  ext-catalog/manifest.yaml has version 0.1.0-rc.1, the tag 0.2.0", err.getvalue())


class ReleaseNotesTest(unittest.TestCase):
    """EXT-103: the release notes of a tag contain only that extension's entries for that version."""

    def setUp(self) -> None:
        self.repo = Repository(self)

    def test_ext_103_the_notes_are_the_section_of_the_version(self) -> None:
        """EXT-103: not the unreleased entries, not older versions, not the link definitions."""
        self.repo.add("ext-catalog", "0.1.0")
        text = release.notes("ext-catalog/v0.1.0", self.repo.root)
        self.assertTrue(text.startswith("### Added\n\n- The first feature of ext-catalog."), text)
        self.assertIn("- A fix of ext-catalog.", text)
        for absent in ("Unreleased", "Something not released", "0.0.9", "An older entry", "]: https://"):
            self.assertNotIn(absent, text)
        self.assertIn("`io.github.mosaikit.ext:ext-catalog:0.1.0`, type `zip`", text)

    def test_ext_103_the_notes_never_carry_another_extension(self) -> None:
        """EXT-103: two extensions at the same version keep their notes apart."""
        self.repo.add("ext-catalog", "0.1.0")
        self.repo.add("ext-catalog-connection", "0.1.0", requires={"io.github.mosaikit.ext.catalog": "^0.1"},
                      optional={"org.example.ext.maps": "^2"})
        catalog = release.notes("ext-catalog/v0.1.0", self.repo.root)
        connection = release.notes("ext-catalog-connection/v0.1.0", self.repo.root)
        self.assertNotIn("ext-catalog-connection", catalog)
        self.assertNotIn("feature of ext-catalog.", connection)
        self.assertIn("- Requires `io.github.mosaikit.ext.catalog` `^0.1`, installed with it", connection)
        self.assertIn("- Uses `org.example.ext.maps` `^2` when it is installed", connection)


class RangeTest(unittest.TestCase):
    """EXT-103: the ranges of the manifests (MK-132) become Maven ranges in the published POM."""

    def test_ext_103_ranges_of_the_manifests_in_maven_syntax(self) -> None:
        """EXT-103: the forms that VersionRange of the kernel accepts."""
        for given, expected in {
            "^0.1": "[0.1.0,0.2.0)", "^1.2.3": "[1.2.3,2.0.0)", "^0.0.3": "[0.0.3,0.0.4)", "~1.2": "[1.2.0,1.3.0)",
            "1.2.3": "[1.2.3]", "=1.2.3": "[1.2.3]", "1.x": "[1.0.0,2.0.0)", "1.2": "[1.2.0,1.3.0)",
            ">=1.4 <2": "[1.4.0,2.0.0)", ">= 0.1 < 1": "[0.1.0,1.0.0)", "*": "[0.0.0,)", "": "[0.0.0,)",
            ">1.2": "[1.3.0,)", ">1.2.3": "(1.2.3,)", "<=1.2": "(,1.3.0)", "<=1.2.3": "(,1.2.3]", "<2": "(,2.0.0)",
            "1.2 || ^3": "[1.2.0,1.3.0),[3.0.0,4.0.0)", ">=1.0.0-rc.1 <1.0.0": "[1.0.0-rc.1,1.0.0)",
        }.items():
            with self.subTest(range=given):
                self.assertEqual(release.maven_range(given), expected)

    def test_ext_103_versions_inside_and_outside_a_range(self) -> None:
        """EXT-103: as the kernel decides, pre-releases only when the range names one."""
        self.assertTrue(release.satisfies("0.1.5", "^0.1"))
        self.assertFalse(release.satisfies("0.2.0", "^0.1"))
        self.assertFalse(release.satisfies("2.0.0-rc.1", "^1"))
        self.assertTrue(release.satisfies("1.0.0-rc.2", ">=1.0.0-rc.1 <1.0.0"))
        self.assertTrue(release.satisfies("1.0.0", "1.0.0 || 2"))
        for wrong in ("^a", "1.2.3.4", ">=2 <1"):
            with self.subTest(range=wrong), self.assertRaises(release.ReleaseError):
                release.parse_range(wrong)


class ProductTest(unittest.TestCase):
    """EXT-103: a product declares an extension by package and version and gets only that extension and
    the extensions it requires."""

    def setUp(self) -> None:
        self.repo = Repository(self)
        self.repo.add("ext-catalog", "0.3.0")
        self.repo.add("ext-catalog-connection", "0.2.0", requires={"io.github.mosaikit.ext.catalog": "^0.3"},
                      optional={"io.github.mosaikit.ext.dashboards": "^0.1"})
        self.repo.add("ext-catalog-connection-postgres", "1.0.0",
                      requires={"io.github.mosaikit.ext.catalog.connection": ">=0.2 <1"})
        self.repo.add("ext-dashboards", "0.1.0", optional={"io.github.mosaikit.ext.catalog.connection": "^0.2"})
        self.repo.add("ext-processes", "0.1.0")

    def names(self, *wanted: str) -> list[str]:
        return [e.name for e in release.closure(list(wanted), self.repo.root)]

    def test_ext_103_the_closure_is_the_extension_and_what_it_requires(self) -> None:
        """EXT-103: required extensions transitively; optional ones and the others are left out."""
        self.assertEqual(self.names("ext-catalog-connection-postgres"),
                         ["ext-catalog-connection-postgres", "ext-catalog-connection", "ext-catalog"])
        self.assertEqual(self.names("io.github.mosaikit.ext.dashboards"), ["ext-dashboards"])
        self.assertEqual(self.names("ext-catalog"), ["ext-catalog"])

    def test_ext_103_a_requirement_the_repository_cannot_meet_fails(self) -> None:
        """EXT-103: a required extension that is missing or outside its range is reported."""
        self.repo.add("ext-catalog-connection", "0.2.0", requires={"io.github.mosaikit.ext.catalog": "^0.4",
                                                                  "io.github.mosaikit.ext.missing": "^1"})
        with self.assertRaises(release.ReleaseError) as caught:
            release.closure(["ext-catalog-connection-postgres"], self.repo.root)
        self.assertIn("requires io.github.mosaikit.ext.catalog ^0.4, the repository has 0.3.0", str(caught.exception))
        self.assertIn("requires io.github.mosaikit.ext.missing, which is not", str(caught.exception))

    def test_ext_103_a_cycle_of_requirements_ends(self) -> None:
        """EXT-103: each extension is listed once."""
        self.repo.add("ext-catalog", "0.3.0", requires={"io.github.mosaikit.ext.catalog.connection": "^0.2"})
        self.assertEqual(sorted(self.names("ext-catalog")), ["ext-catalog", "ext-catalog-connection"])

    def dependencies(self, folder: str) -> list[tuple[str, str, str, str]]:
        project = ElementTree.fromstring(release.published_pom(folder).encode("utf-8"))
        self.assertEqual(project.findtext("m:packaging", namespaces=NS), "pom")
        return [tuple(d.findtext(f"m:{t}", namespaces=NS) for t in ("groupId", "artifactId", "version", "type"))
                for d in project.findall("m:dependencies/m:dependency", NS)]

    def test_ext_103_the_published_pom_declares_the_required_extensions(self) -> None:
        """EXT-103: Maven resolves the zip of the extension and of those it requires, not the optional ones."""
        self.assertEqual(self.dependencies(os.path.join(self.repo.root, "ext-catalog-connection")),
                         [("io.github.mosaikit.ext", "ext-catalog", "[0.3.0,0.4.0)", "zip")])
        self.assertEqual(self.dependencies(os.path.join(self.repo.root, "ext-catalog-connection-postgres")),
                         [("io.github.mosaikit.ext", "ext-catalog-connection", "[0.2.0,1.0.0)", "zip")])
        self.assertEqual(self.dependencies(os.path.join(self.repo.root, "ext-dashboards")), [])

    def test_ext_103_the_published_pom_keeps_the_rest_of_the_build(self) -> None:
        """EXT-103: dependencies of the build stay, packaging becomes pom, comments stay."""
        folder = self.repo.add("ext-catalog-connection", "0.2.0", packaging="",
                               requires={"io.github.mosaikit.ext.catalog": "^0.3"}, dependencies="""<dependencies>
        <dependency><groupId>io.github.mosaikit</groupId><artifactId>mosaikit-kernel-api</artifactId><scope>provided</scope></dependency>
    </dependencies>""")
        text = release.published_pom(folder)
        self.assertIn("<!-- a comment that stays -->", text)
        self.assertTrue(text.startswith('<?xml version="1.0" encoding="UTF-8"?>\n'))
        self.assertEqual([d[1] for d in self.dependencies(folder)], ["mosaikit-kernel-api", "ext-catalog"])


class BundleTest(unittest.TestCase):
    """EXT-103: the extension is published only as io.github.mosaikit.ext:ext-<name> with version X.Y.Z."""

    def setUp(self) -> None:
        self.repo = Repository(self)
        self.repo.add("ext-catalog", "0.1.0")
        folder = self.repo.add("ext-catalog-connection", "0.2.0", requires={"io.github.mosaikit.ext.catalog": "^0.1"})
        os.makedirs(os.path.join(folder, "target"))
        with zipfile.ZipFile(os.path.join(folder, "target", "ext-catalog-connection-0.2.0.zip"), "w") as z:
            z.writestr("manifest.yaml", "id: io.github.mosaikit.ext.catalog.connection\n")
        self.output = os.path.join(self.repo.root, "bundle.zip")

    def test_ext_103_the_bundle_holds_only_this_extension_at_this_version(self) -> None:
        """EXT-103: POM and zip under the path of their coordinates, with their checksums."""
        listed = release.bundle("ext-catalog-connection/v0.2.0", self.output, root=self.repo.root)
        base = "io/github/mosaikit/ext/ext-catalog-connection/0.2.0/ext-catalog-connection-0.2.0"
        self.assertEqual(listed, sorted(f"{base}.{ext}{check}" for ext in ("pom", "zip") for check in ("", ".md5", ".sha1")))
        with zipfile.ZipFile(self.output) as z:
            self.assertEqual(sorted(z.namelist()), listed)
            for name in ("pom", "zip"):
                data = z.read(f"{base}.{name}")
                self.assertEqual(z.read(f"{base}.{name}.sha1").decode(), hashlib.sha1(data).hexdigest())
                self.assertEqual(z.read(f"{base}.{name}.md5").decode(), hashlib.md5(data).hexdigest())
            self.assertIn(b"<artifactId>ext-catalog</artifactId>", z.read(f"{base}.pom"))
            self.assertIn(b"<packaging>pom</packaging>", z.read(f"{base}.pom"))

    def test_ext_103_the_bundle_needs_the_built_package(self) -> None:
        """EXT-103: the zip comes from mvn package of the folder, at the version of the tag."""
        with self.assertRaises(release.ReleaseError) as caught:
            release.bundle("ext-catalog/v0.1.0", self.output, root=self.repo.root)
        self.assertIn("ext-catalog-0.1.0.zip is missing", str(caught.exception))


class Response(io.BytesIO):
    def __enter__(self):
        return self

    def __exit__(self, *args):
        return False


class PublishTest(unittest.TestCase):
    """EXT-103: the upload to Central waits until the version is published, and fails when refused."""

    def setUp(self) -> None:
        self.bundle = os.path.join(tempfile.mkdtemp(prefix="ext-103-"), "bundle.zip")
        self.addCleanup(shutil.rmtree, os.path.dirname(self.bundle), ignore_errors=True)
        with open(self.bundle, "wb") as f:
            f.write(b"PK-bundle")
        self.requests = []

    def opener(self, states: list[dict]):
        def open_(request):
            self.requests.append(request)
            if request.full_url.split("?")[0].endswith("/upload"):
                return Response(b"deployment-1")
            return Response(json.dumps(states.pop(0)).encode())
        return open_

    def test_ext_103_upload_and_wait_until_published(self) -> None:
        """EXT-103: automatic publication, credentials as a bearer token, polling until PUBLISHED."""
        stderr, sys.stderr = sys.stderr, io.StringIO()
        try:
            deployment = release.publish(self.bundle, "ext-catalog 0.1.0", "user", "secret", opener=self.opener(
                [{"deploymentState": "VALIDATING"}, {"deploymentState": "PUBLISHING"}, {"deploymentState": "PUBLISHED"}]),
                sleep=lambda s: None)
        finally:
            sys.stderr = stderr
        self.assertEqual(deployment, "deployment-1")
        upload = self.requests[0]
        self.assertIn("publishingType=AUTOMATIC", upload.full_url)
        self.assertIn("name=ext-catalog+0.1.0", upload.full_url)
        self.assertEqual(upload.get_header("Authorization"), "Bearer dXNlcjpzZWNyZXQ=")
        self.assertIn(b"PK-bundle", upload.data)
        self.assertEqual(len(self.requests), 4)
        self.assertTrue(all("id=deployment-1" in r.full_url for r in self.requests[1:]))

    def test_ext_103_a_refused_deployment_fails_the_release(self) -> None:
        """EXT-103: the errors of Central end the release, before the GitHub release."""
        stderr, sys.stderr = sys.stderr, io.StringIO()
        try:
            with self.assertRaises(release.ReleaseError) as caught:
                release.publish(self.bundle, "x", "u", "p", opener=self.opener(
                    [{"deploymentState": "FAILED", "errors": {"pom": ["missing license"]}}]), sleep=lambda s: None)
            with self.assertRaises(release.ReleaseError):
                release.publish(self.bundle, "x", "u", "p", opener=self.opener(
                    [{"deploymentState": "VALIDATING"}] * 3), wait=20, every=10, sleep=lambda s: None)
        finally:
            sys.stderr = stderr
        self.assertIn("missing license", str(caught.exception))


class RepositoryTest(unittest.TestCase):
    """EXT-103: the extensions of this repository are ready to be released one by one."""

    def test_ext_103_every_extension_has_one_version_in_build_manifest_and_package(self) -> None:
        """EXT-103: pom.xml, manifest.yaml and package.json agree; coordinates and id follow the name."""
        found = release.extensions(release.ROOT)
        self.assertTrue(found)
        for extension in found.values():
            if extension.pom is None:
                continue
            with self.subTest(extension=extension.name):
                self.assertEqual(extension.pom_text("groupId"), release.GROUP)
                self.assertEqual(extension.pom_text("artifactId"), extension.name)
                self.assertEqual(extension.pom_text("version"), extension.version)
                self.assertEqual(extension.id, release.expected_id(extension.name))
                with open(os.path.join(extension.folder, "package.json"), encoding="utf-8") as f:
                    self.assertEqual(json.load(f)["version"], extension.version)
                self.assertTrue(os.path.isfile(os.path.join(extension.folder, "CHANGELOG.md")))
                self.assertEqual(release.requires_problems(extension, found), [])
        self.assertTrue(release.closure(list(found), release.ROOT))


if __name__ == "__main__":
    unittest.main()
