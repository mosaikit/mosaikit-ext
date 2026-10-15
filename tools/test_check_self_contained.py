# SPDX-FileCopyrightText: 2026 Massimo Antonini
# SPDX-License-Identifier: MPL-2.0
"""Tests of EXT-102: every extension folder is self-contained, and an extracted folder builds alone.

    python -m unittest discover -s tools -v
    EXT_102_BUILD=1 python -m unittest discover -s tools -v   # also build and test each extracted folder
    EXT_102_EXTENSIONS=ext-catalog,ext-catalog-connection ... # only these folders (the CI of EXT-104)

The extraction uses `git filter-repo --subdirectory-filter` on a clone of HEAD when git-filter-repo
is installed (pip install git-filter-repo), and a copy of the folder otherwise. The build follows
tools/build_steps.py, as the README of each folder does: the extensions it requires, extracted on their own,
installed first; its api/ module; mvn verify.
"""
from __future__ import annotations

import os
import shutil
import subprocess
import sys
import tempfile
import textwrap
import unittest

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import build_steps as build  # noqa: E402
import check_self_contained as check  # noqa: E402

POM = """<project>
    <parent>
        <groupId>io.github.mosaikit</groupId>
        <artifactId>mosaikit-extension-parent</artifactId>
        <version>0.1.0-SNAPSHOT</version>
        {relative}
    </parent>
    <artifactId>ext-example</artifactId>
</project>
"""


def write(root: str, files: dict[str, str]) -> None:
    for path, content in files.items():
        full = os.path.join(root, *path.split("/"))
        os.makedirs(os.path.dirname(full), exist_ok=True)
        with open(full, "w", encoding="utf-8", newline="\n") as f:
            f.write(textwrap.dedent(content))


def extension(**extra: str) -> dict[str, str]:
    """A complete extension with a build, plus the files given (`/` in names as `__`)."""
    files = {
        "ext-example/README.md": "# ext-example\n\nSee [the requirements](docs/requirements/).\n",
        "ext-example/CHANGELOG.md": "# Changelog\n",
        "ext-example/manifest.yaml": "id: io.github.mosaikit.ext.example\n",
        "ext-example/pom.xml": POM.format(relative="<relativePath/>"),
        "ext-example/package.json": '{"devDependencies": {"@mosaikit/testing": "https://github.com/mosaikit/mosaikit/releases/download/snapshot/mosaikit-testing-latest.tgz"}}',
        "ext-example/docs/requirements/README.md": "a requirement\n",
        "ext-example/tests/extension.spec.ts": "import { x } from './helper.js';\n",
        "ext-example/web/index.js": "import { t } from './i18n.js';\nimport { u } from '../web/i18n.js';\n",
    }
    files.update({"ext-example/" + k.replace("__", "/"): v for k, v in extra.items()})
    return files


class SelfContainedCheckTest(unittest.TestCase):
    """EXT-102: the check fails when a file of an extension refers to a file outside its folder."""

    def setUp(self) -> None:
        self.root = tempfile.mkdtemp(prefix="ext-102-")
        self.addCleanup(shutil.rmtree, self.root, ignore_errors=True)

    def problems(self, files: dict[str, str]) -> list[str]:
        write(self.root, files)
        return [str(p) for p in check.check_extension(os.path.join(self.root, "ext-example"))]

    def assertFlags(self, files: dict[str, str], *fragments: str) -> None:
        problems = self.problems(files)
        for fragment in fragments:
            self.assertTrue(any(fragment in p for p in problems), f"{fragment!r} not in {problems}")

    def test_ext_102_a_complete_folder_passes(self) -> None:
        """EXT-102: references inside the folder and through published packages are allowed."""
        self.assertEqual(self.problems(extension(**{
            "README.md": "Built on [Mosaikit](https://github.com/mosaikit/mosaikit/tree/main/../docs).\n"
                         "Run `npm test` in ./tests, see tests/../web/index.js.\n",
        })), [])

    def test_ext_102_a_relative_import_from_another_extension_fails(self) -> None:
        """EXT-102: an import of a file of another extension (not of its package) is refused."""
        self.assertFlags(
            extension(**{"tests__unit.test.ts": "import { COLOURS } from '../../ext-other/src/index.js';\n"}),
            "ext-example/tests/unit.test.ts:1: refers to ../../ext-other/src/index.js",
        )

    def test_ext_102_markdown_links_outside_the_folder_fail(self) -> None:
        """EXT-102: a link to a file of the root, relative or absolute, is refused."""
        self.assertFlags(
            extension(**{"README.md": "See [ADR-0001](../docs/adr/0001.md) and [CI](/.github/workflows/ci.yml).\n"}),
            "refers to ../docs/adr/0001.md", "links /.github/workflows/ci.yml at the root",
        )

    def test_ext_102_npm_dependencies_on_paths_and_workspaces_fail(self) -> None:
        """EXT-102: an npm dependency is a published package, not a folder or a workspace."""
        self.assertFlags(
            extension(**{"package.json": '{"workspaces": ["x"], "dependencies": {"ext-other": "file:../ext-other",'
                                         ' "ext-shared": "workspace:*", "ext-abs": "link:/opt/ext"}}'}),
            "declares workspaces", "ext-other comes from file:../ext-other", "ext-shared comes from a workspace",
            "ext-abs comes from link:/opt/ext",
        )

    def test_ext_102_a_pom_must_not_look_for_its_parent_in_the_root(self) -> None:
        """EXT-102: the parent POM is the published one, never ../pom.xml."""
        self.assertFlags(extension(**{"pom.xml": POM.format(relative="")}), "the parent has no <relativePath/>")
        self.assertFlags(extension(**{"pom.xml": POM.format(relative="<relativePath>../pom.xml</relativePath>")}),
                         "refers to ../pom.xml")

    def test_ext_102_shared_configuration_of_the_root_fails(self) -> None:
        """EXT-102: tsconfig extends, scripts and modules of the root are refused, also with backslashes."""
        self.assertFlags(
            extension(**{
                "tsconfig.json": '{"extends": "../tsconfig.base.json"}',
                "build.cmd": "call ..\\tools\\build.cmd\n",
            }),
            "refers to ../tsconfig.base.json", "refers to ../tools/build.cmd",
        )

    def test_ext_102_a_folder_with_a_build_holds_changelog_requirements_and_tests(self) -> None:
        """EXT-102: build, sources, tests, changelog, README and requirements are in the folder."""
        files = extension()
        for missing in ("CHANGELOG.md", "manifest.yaml", "docs/requirements/README.md", "tests/extension.spec.ts",
                        "README.md"):
            del files["ext-example/" + missing]
        self.assertFlags(files, "no CHANGELOG.md", "no manifest.yaml", "no docs/requirements", "no tests",
                         "no README.md")

    def test_ext_102_what_builds_write_is_not_checked(self) -> None:
        """EXT-102: node_modules, target and the bench are outputs, not sources of the extension."""
        self.assertEqual(self.problems(extension(**{
            "node_modules__x__index.js": "require('../../../outside.js')\n",
            "target__classes__x.txt": "../outside\n",
            ".mosaikit-bench__log.txt": "../outside\n",
        })), [])

    @unittest.skipUnless(hasattr(os, "symlink"), "no symbolic links")
    def test_ext_102_a_link_outside_the_folder_fails(self) -> None:
        """EXT-102: a symbolic link to a file of the root is refused."""
        files = extension()
        files["LICENSE"] = "licence\n"
        write(self.root, files)
        try:
            os.symlink(os.path.join(self.root, "LICENSE"), os.path.join(self.root, "ext-example", "LICENSE"))
        except OSError:
            self.skipTest("symbolic links are not allowed here")
        problems = [str(p) for p in check.check_extension(os.path.join(self.root, "ext-example"))]
        self.assertTrue(any("is a link to" in p for p in problems), problems)

    def test_ext_102_every_extension_of_the_repository_is_self_contained(self) -> None:
        """EXT-102: the folders of this repository pass the check."""
        folders = check.extensions(check.ROOT)
        self.assertTrue(folders)
        self.assertEqual([str(p) for f in folders for p in check.check_extension(f)], [])


def git(*args: str, cwd: str) -> str:
    return subprocess.run(["git", *args], cwd=cwd, check=True, capture_output=True, text=True).stdout


def filter_repo_available() -> bool:
    try:
        return subprocess.run(["git", "filter-repo", "--version"], capture_output=True).returncode == 0
    except OSError:
        return False


class ExtractionTest(unittest.TestCase):
    """EXT-102: extracting a folder gives a repository that builds and passes its tests without changes."""

    def extract(self, name: str, into: str) -> str:
        """The folder as a repository of its own, from HEAD with git filter-repo, or copied."""
        target = os.path.join(into, name)
        if filter_repo_available() and os.path.exists(os.path.join(check.ROOT, ".git")):
            git("init", "--quiet", target, cwd=into)
            git("fetch", "--quiet", "--no-tags", check.ROOT, "HEAD", cwd=target)
            git("checkout", "--quiet", "-B", "main", "FETCH_HEAD", cwd=target)
            git("filter-repo", "--force", "--quiet", "--subdirectory-filter", name, cwd=target)
            self.assertEqual(git("status", "--porcelain", cwd=target), "")
        else:
            print(f"\n{name}: git filter-repo not available, the folder is copied", file=sys.stderr)
            shutil.copytree(os.path.join(check.ROOT, name), target,
                            ignore=shutil.ignore_patterns(*check.SKIPPED))
        return target

    def test_ext_102_an_extracted_folder_is_a_complete_extension(self) -> None:
        """EXT-102: git filter-repo --subdirectory-filter ext-<name> keeps everything the extension needs."""
        built = [f for f in check.extensions(check.ROOT) if os.path.isfile(os.path.join(f, "pom.xml"))]
        self.assertTrue(built, "no extension has a build yet")
        only = {n.strip() for n in os.environ.get("EXT_102_EXTENSIONS", "").split(",") if n.strip()}
        if only:
            built = [f for f in built if os.path.basename(f) in only]
            self.assertEqual(sorted(os.path.basename(f) for f in built), sorted(only),
                             "EXT_102_EXTENSIONS names a folder without a build")
        with tempfile.TemporaryDirectory(prefix="ext-102-extract-") as scratch:
            extracted_folders: dict[str, str] = {}

            def locate(name: str) -> str:
                if name not in extracted_folders:
                    extracted_folders[name] = self.extract(name, scratch)
                return extracted_folders[name]

            installed: set[str] = set()
            for folder in built:
                name = os.path.basename(folder)
                with self.subTest(extension=name):
                    extracted = locate(name)
                    for needed in ("README.md", "pom.xml", *check.WITH_BUILD):
                        self.assertTrue(os.path.exists(os.path.join(extracted, needed)), needed)
                    self.assertEqual([str(p) for p in check.check_extension(extracted, name)], [])
                    if os.environ.get("EXT_102_BUILD") == "1":
                        # The steps of its README: the extensions it requires installed first, each
                        # extracted on its own, then its api/ module and mvn verify (tools/build_steps.py).
                        steps = build.plan(name, check.ROOT, locate, installed)
                        try:
                            build.run(steps, locate)
                        except build.BuildError as e:
                            self.fail(f"the extracted {name} does not build: {e}")
                        installed.update(build.order(name, check.ROOT)[:-1])

if __name__ == "__main__":
    unittest.main()
