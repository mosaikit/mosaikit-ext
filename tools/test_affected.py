# SPDX-FileCopyrightText: 2026 Massimo Antonini
# SPDX-License-Identifier: MPL-2.0
"""Tests of EXT-104: the CI of a pull request tests only the extensions it changes and those that
depend on them.

    python -m unittest discover -s tools -v      # needs PyYAML (pip install pyyaml)

They cover the choice of the extensions to build from the changed files and the manifests, and the
verdict of the one required check whatever set ran. That the workflow runs the choice is shown by the
CI of a pull request.
"""
from __future__ import annotations

import io
import json
import os
import shutil
import subprocess
import sys
import tempfile
import textwrap
import unittest
from contextlib import redirect_stdout

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import affected  # noqa: E402


def manifest(name: str, requires: dict[str, str] | None = None, optional: dict[str, str] | None = None) -> str:
    lines = [f"id: io.github.mosaikit.ext.{name.replace('-', '.')}", "version: 0.1.0"]
    for key, values in (("requires", requires), ("optional", optional)):
        if values:
            lines.append(f"{key}:")
            lines += [f"  io.github.mosaikit.ext.{other.replace('-', '.')}: '{accepted}'" for other, accepted in values.items()]
    return "\n".join(lines) + "\n"


class Repository:
    """A repository of extensions in a temporary folder:

    catalog <- catalog-connection (requires) <- catalog-connection-postgres (requires)
            <- dashboards (optional)         <- processes (optional, of dashboards)
    plus a folder without a manifest (ext-notes) and one without a build (ext-dashboards)."""

    def __init__(self, test: unittest.TestCase) -> None:
        self.root = tempfile.mkdtemp(prefix="ext-104-")
        test.addCleanup(shutil.rmtree, self.root, ignore_errors=True)
        self.write({
            "README.md": "# extensions\n",
            ".github/workflows/ci.yml": "name: CI\n",
            "docs/requirements/EXT-104.md": "a requirement\n",
            "tools/affected.py": "# the script\n",
            "ext-catalog/manifest.yaml": manifest("catalog"),
            "ext-catalog/pom.xml": "<project/>\n",
            "ext-catalog-connection/manifest.yaml": manifest("catalog-connection", requires={"catalog": ">=0.1 <1"}),
            "ext-catalog-connection/pom.xml": "<project/>\n",
            "ext-catalog-connection-postgres/manifest.yaml": manifest(
                "catalog-connection-postgres", requires={"catalog-connection": ">=0.1 <1"}),
            "ext-catalog-connection-postgres/pom.xml": "<project/>\n",
            "ext-dashboards/manifest.yaml": manifest("dashboards", optional={"catalog": ">=0.1 <1"}),
            "ext-processes/manifest.yaml": manifest("processes", optional={"dashboards": ">=0.1"}),
            "ext-processes/pom.xml": "<project/>\n",
            "ext-notes/README.md": "# ext-notes\n",
        })

    def write(self, files: dict[str, str]) -> None:
        for path, content in files.items():
            full = os.path.join(self.root, *path.split("/"))
            os.makedirs(os.path.dirname(full), exist_ok=True)
            with open(full, "w", encoding="utf-8", newline="\n") as f:
                f.write(textwrap.dedent(content))

    def affected(self, *changed: str) -> list[str]:
        return affected.affected(list(changed), self.root)


EVERY = ["ext-catalog", "ext-catalog-connection", "ext-catalog-connection-postgres", "ext-dashboards", "ext-notes",
         "ext-processes"]


class SelectionTest(unittest.TestCase):
    """EXT-104: a pull request builds the extensions it changes and those that require or use them, and no other."""

    def setUp(self) -> None:
        self.repo = Repository(self)

    def test_ext_104_a_change_to_one_extension_selects_it_and_those_that_depend_on_it(self) -> None:
        """EXT-104: those that require it and those that use it when present, transitively, and no other."""
        self.assertEqual(self.repo.affected("ext-catalog/web/index.js"), [
            "ext-catalog", "ext-catalog-connection", "ext-catalog-connection-postgres", "ext-dashboards",
            "ext-processes"])
        self.assertEqual(self.repo.affected("ext-catalog-connection/pom.xml"),
                         ["ext-catalog-connection", "ext-catalog-connection-postgres"])

    def test_ext_104_an_extension_nothing_depends_on_selects_only_itself(self) -> None:
        """EXT-104: the extensions it requires are not built again: they did not change."""
        self.assertEqual(self.repo.affected("ext-catalog-connection-postgres/src/Main.java"),
                         ["ext-catalog-connection-postgres"])
        self.assertEqual(self.repo.affected("ext-notes/README.md"), ["ext-notes"])

    def test_ext_104_changes_to_several_extensions_select_the_union(self) -> None:
        """EXT-104: each changed extension with its dependents, once."""
        self.assertEqual(self.repo.affected("ext-dashboards/README.md", "ext-catalog-connection-postgres/pom.xml",
                                            "ext-processes/CHANGELOG.md"),
                         ["ext-catalog-connection-postgres", "ext-dashboards", "ext-processes"])

    def test_ext_104_no_change_selects_no_extension(self) -> None:
        """EXT-104: the empty set is a valid selection (and the required check still passes, see below)."""
        self.assertEqual(self.repo.affected(), [])

    def test_ext_104_a_removed_extension_selects_those_that_used_it(self) -> None:
        """EXT-104: a folder the change deletes is not built; the extensions that require it are."""
        shutil.rmtree(os.path.join(self.repo.root, "ext-catalog-connection"))
        self.assertEqual(self.repo.affected("ext-catalog-connection/manifest.yaml"),
                         ["ext-catalog-connection-postgres"])

    def test_ext_104_only_the_selected_extensions_with_a_build_are_built(self) -> None:
        """EXT-104: a folder with only its README is selected but has nothing to build."""
        names = self.repo.affected("ext-catalog/web/index.js", "ext-notes/README.md")
        self.assertEqual(affected.built(names, self.repo.root),
                         ["ext-catalog", "ext-catalog-connection", "ext-catalog-connection-postgres", "ext-processes"])


class ManifestsTest(unittest.TestCase):
    """EXT-104: the dependencies between extensions are read from their manifests, not from a list in the CI."""

    def setUp(self) -> None:
        self.repo = Repository(self)

    def test_ext_104_a_new_dependency_in_a_manifest_changes_the_selection(self) -> None:
        """EXT-104: declaring `requires` in a manifest is enough; nothing else is edited."""
        self.assertEqual(self.repo.affected("ext-processes/web/index.js"), ["ext-processes"])
        self.repo.write({"ext-catalog/manifest.yaml": manifest("catalog", optional={"processes": ">=0.1"})})
        self.assertEqual(self.repo.affected("ext-processes/web/index.js"), [
            "ext-catalog", "ext-catalog-connection", "ext-catalog-connection-postgres", "ext-dashboards",
            "ext-processes"])

    def test_ext_104_a_dependency_removed_from_a_manifest_leaves_the_selection(self) -> None:
        """EXT-104: an extension that no longer declares the changed one is not built."""
        self.repo.write({"ext-dashboards/manifest.yaml": manifest("dashboards")})
        self.assertEqual(self.repo.affected("ext-catalog/web/index.js"),
                         ["ext-catalog", "ext-catalog-connection", "ext-catalog-connection-postgres"])

    def test_ext_104_the_manifests_of_this_repository_give_the_selection(self) -> None:
        """EXT-104: in this repository, a change to an extension selects every extension whose manifest declares it."""
        known = affected.release.extensions(affected.ROOT)
        self.assertTrue(known)
        for extension in known.values():
            with self.subTest(extension=extension.name):
                names = affected.affected([f"{extension.name}/manifest.yaml"])
                self.assertIn(extension.name, names)
                for other in known.values():
                    if extension.id in {*other.requires(), *other.optional()}:
                        self.assertIn(other.name, names)


class RootTest(unittest.TestCase):
    """EXT-104: a change to a file of the root (CI, shared requirements) runs every extension."""

    def setUp(self) -> None:
        self.repo = Repository(self)

    def test_ext_104_a_change_to_the_root_selects_every_extension(self) -> None:
        """EXT-104: the CI, the shared requirements, the tools and the README concern every extension."""
        for path in (".github/workflows/ci.yml", "docs/requirements/EXT-104.md", "tools/affected.py", "README.md",
                     "REUSE.toml"):
            with self.subTest(path=path):
                self.assertEqual(self.repo.affected(path), EVERY)
        self.assertEqual(self.repo.affected("ext-notes/README.md", "LICENSE"), EVERY)

    def test_ext_104_a_file_named_like_an_extension_at_the_root_is_a_root_file(self) -> None:
        """EXT-104: only a path inside an ext-* folder belongs to an extension."""
        self.assertEqual(self.repo.affected("ext-catalog.md"), EVERY)


def git(*args: str, cwd: str) -> str:
    return subprocess.run(["git", *args], cwd=cwd, check=True, capture_output=True, text=True).stdout


class GitTest(unittest.TestCase):
    """EXT-104: the changed files are those of the pull request since its merge base."""

    def test_ext_104_the_changes_of_the_base_after_the_fork_are_not_the_pull_request(self) -> None:
        """EXT-104: git diff against the merge base, with both names of a renamed file."""
        repo = Repository(self)
        git("init", "--quiet", "-b", "main", cwd=repo.root)
        for setting in (("user.name", "Test"), ("user.email", "test@example.org"), ("commit.gpgsign", "false")):
            git("config", *setting, cwd=repo.root)
        git("add", ".", cwd=repo.root)
        git("commit", "--quiet", "-m", "start", cwd=repo.root)
        git("checkout", "--quiet", "-b", "change", cwd=repo.root)
        os.rename(os.path.join(repo.root, "ext-notes", "README.md"), os.path.join(repo.root, "ext-notes", "NOTES.md"))
        git("add", ".", cwd=repo.root)
        git("commit", "--quiet", "-m", "change", cwd=repo.root)
        git("checkout", "--quiet", "main", cwd=repo.root)
        repo.write({"README.md": "# changed on main after the fork\n"})
        git("commit", "--quiet", "-am", "later", cwd=repo.root)
        changed = affected.changed_files("main", "change", repo.root)
        self.assertEqual(sorted(changed), ["ext-notes/NOTES.md", "ext-notes/README.md"])

    def test_ext_104_the_command_prints_the_lists_for_the_workflow(self) -> None:
        """EXT-104: `select` writes the folders and those with a build as JSON for a matrix."""
        repo = Repository(self)
        out = io.StringIO()
        with tempfile.TemporaryDirectory() as scratch:
            output = os.path.join(scratch, "output")
            os.environ["GITHUB_OUTPUT"] = output
            self.addCleanup(os.environ.pop, "GITHUB_OUTPUT", None)
            with redirect_stdout(out):
                code = affected.main(["--root", repo.root, "select", "--files", "ext-catalog-connection/pom.xml",
                                      "--json", "--github-output"])
            with open(output, encoding="utf-8") as f:
                written = f.read()
        self.assertEqual(code, 0)
        lists = {"extensions": ["ext-catalog-connection", "ext-catalog-connection-postgres"],
                 "built": ["ext-catalog-connection", "ext-catalog-connection-postgres"]}
        self.assertEqual(json.loads(out.getvalue()), lists)
        self.assertEqual(written, "".join(f"{k}={json.dumps(v)}\n" for k, v in lists.items()))


class RequiredCheckTest(unittest.TestCase):
    """EXT-104: the required check of the pull request passes or fails as one, whatever set of extensions ran."""

    def test_ext_104_the_check_passes_when_every_selected_extension_passed(self) -> None:
        """EXT-104: one success for any number of builds."""
        self.assertEqual(affected.aggregate({"affected": {"result": "success"}, "build": {"result": "success"}}), [])

    def test_ext_104_the_check_passes_when_no_extension_was_selected(self) -> None:
        """EXT-104: the build of the empty set is skipped, and the check passes."""
        self.assertEqual(affected.aggregate({"affected": {"result": "success"}, "build": {"result": "skipped"}}), [])

    def test_ext_104_the_check_fails_when_one_extension_failed_or_was_cancelled(self) -> None:
        """EXT-104: one failed build of the matrix fails the whole check."""
        for result in ("failure", "cancelled"):
            with self.subTest(result=result):
                self.assertEqual(affected.aggregate({"affected": {"result": "success"}, "build": {"result": result}}),
                                 [f"build: {result}"])

    def test_ext_104_the_check_fails_when_the_selection_failed(self) -> None:
        """EXT-104: a skipped build does not pass when the selection itself did not run."""
        self.assertEqual(affected.aggregate({"affected": {"result": "failure"}, "build": {"result": "skipped"}}),
                         ["affected: failure"])
        self.assertEqual(affected.aggregate({}), ["the check waits for no job"])

    def test_ext_104_the_command_exits_with_the_verdict(self) -> None:
        """EXT-104: `aggregate` reads toJSON(needs) and exits 0 or 1."""
        with redirect_stdout(io.StringIO()):
            self.assertEqual(affected.main(["aggregate", json.dumps({"affected": {"result": "success"},
                                                                     "build": {"result": "skipped"}})]), 0)
        self.assertEqual(affected.main(["aggregate", json.dumps({"affected": {"result": "success"},
                                                                 "build": {"result": "failure"}})]), 1)


if __name__ == "__main__":
    unittest.main()
