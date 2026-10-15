# SPDX-FileCopyrightText: 2026 Massimo Antonini
# SPDX-License-Identifier: MPL-2.0
"""Tests of EXT-102: each extension builds alone from its folder, after the extensions it requires.

    python -m unittest discover -s tools -v      # needs PyYAML (pip install pyyaml)

They cover the steps of tools/build_steps.py, which the CI and the extraction test follow: the api/
module installed before the build, and the extensions of this repository that an extension requires
built and installed first, in order, as the zip its tests install.
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

POM = """<project xmlns="http://maven.apache.org/POM/4.0.0">
    <groupId>io.github.mosaikit.ext</groupId>
    <artifactId>{name}</artifactId>
    <version>{version}</version>
</project>
"""


def manifest(name: str, requires: tuple[str, ...] = (), optional: tuple[str, ...] = (), version: str = "0.1.0") -> str:
    lines = [f"id: io.github.mosaikit.ext.{name[len('ext-'):].replace('-', '.')}", f"version: {version}"]
    for key, values in (("requires", requires), ("optional", optional)):
        if values:
            lines.append(f"{key}:")
            lines += [f"  {other}: '>=0.1 <1'" for other in values]
    return "\n".join(lines) + "\n"


def extension(name: str, *, requires=(), optional=(), api=False, version="0.1.0") -> dict[str, str]:
    files = {f"{name}/manifest.yaml": manifest(name, requires, optional, version),
             f"{name}/pom.xml": POM.format(name=name, version=version)}
    if api:
        files[f"{name}/api/pom.xml"] = POM.format(name=name + "-api", version=version)
    return files


CATALOG = "io.github.mosaikit.ext.catalog"
CONNECTION = "io.github.mosaikit.ext.catalog.connection"


class StepsTest(unittest.TestCase):
    """EXT-102: the steps that build an extension alone, the same in its README, the CI and the extraction test."""

    def setUp(self) -> None:
        self.root = tempfile.mkdtemp(prefix="ext-102-build-")
        self.addCleanup(shutil.rmtree, self.root, ignore_errors=True)
        self.write({
            **extension("ext-catalog", api=True),
            **extension("ext-catalog-connection", requires=(CATALOG,), api=True, version="0.2.0"),
            **extension("ext-catalog-connection-postgres", requires=(CONNECTION, "io.github.mosaikit.other")),
            **extension("ext-dashboards", optional=(CATALOG,)),
        })

    def write(self, files: dict[str, str]) -> None:
        for path, content in files.items():
            full = os.path.join(self.root, *path.split("/"))
            os.makedirs(os.path.dirname(full), exist_ok=True)
            with open(full, "w", encoding="utf-8", newline="\n") as f:
                f.write(textwrap.dedent(content))

    def plan(self, name: str, installed: set[str] | None = None) -> list[str]:
        return [str(s) for s in build.plan(name, self.root, installed=installed)]

    def test_ext_102_the_api_module_is_installed_before_the_build(self) -> None:
        """EXT-102: Maven resolves dependencies before plugins, so api/ is installed apart, first."""
        self.assertEqual(self.plan("ext-catalog"), [
            "(ext-catalog) mvn -B -ntp -f api/pom.xml install",
            "(ext-catalog) mvn -B -ntp verify",
        ])
        self.assertEqual(self.plan("ext-dashboards"), ["(ext-dashboards) mvn -B -ntp verify"])

    def test_ext_102_the_extensions_it_requires_are_installed_first_in_order(self) -> None:
        """EXT-102: each required extension of the repository after those it requires, as its zip package."""
        self.assertEqual(build.order("ext-catalog-connection-postgres", self.root),
                         ["ext-catalog", "ext-catalog-connection", "ext-catalog-connection-postgres"])
        self.assertEqual(self.plan("ext-catalog-connection-postgres"), [
            "(ext-catalog) mvn -B -ntp -f api/pom.xml install",
            "(ext-catalog) mvn -B -ntp package -DskipTests -Dinvoker.skip",
            "(ext-catalog) mvn -B -ntp install:install-file -Dfile=target/ext-catalog-0.1.0.zip "
            "-DgroupId=io.github.mosaikit.ext -DartifactId=ext-catalog -Dversion=0.1.0 -Dpackaging=zip",
            "(ext-catalog-connection) mvn -B -ntp -f api/pom.xml install",
            "(ext-catalog-connection) mvn -B -ntp package -DskipTests -Dinvoker.skip",
            "(ext-catalog-connection) mvn -B -ntp install:install-file "
            "-Dfile=target/ext-catalog-connection-0.2.0.zip -DgroupId=io.github.mosaikit.ext "
            "-DartifactId=ext-catalog-connection -Dversion=0.2.0 -Dpackaging=zip",
            "(ext-catalog-connection-postgres) mvn -B -ntp verify",
        ])

    def test_ext_102_optional_extensions_are_not_built(self) -> None:
        """EXT-102: an extension only used when present is not needed to build and test."""
        self.assertEqual(build.order("ext-dashboards", self.root), ["ext-dashboards"])

    def test_ext_102_extensions_already_installed_are_not_built_again(self) -> None:
        """EXT-102: in one run, a required extension is installed once."""
        steps = self.plan("ext-catalog-connection-postgres", installed={"ext-catalog", "ext-catalog-connection"})
        self.assertEqual(steps, ["(ext-catalog-connection-postgres) mvn -B -ntp verify"])

    def test_ext_102_extensions_that_require_each_other_are_refused(self) -> None:
        """EXT-102: a cycle of required extensions cannot be built in any order."""
        self.write(extension("ext-catalog", requires=("io.github.mosaikit.ext.catalog.connection.postgres",)))
        with self.assertRaisesRegex(build.BuildError, "require each other"):
            build.order("ext-catalog-connection-postgres", self.root)

    def test_ext_102_the_steps_run_in_the_folder_of_each_extension(self) -> None:
        """EXT-102: each command runs in the folder of its extension, and a failure stops the build."""
        calls = []

        def runner(command, cwd):
            calls.append((os.path.basename(cwd), command[1:]))
            return subprocess.CompletedProcess(command, 1 if "verify" in command else 0)

        steps = build.plan("ext-catalog-connection", self.root)
        with self.assertRaisesRegex(build.BuildError, "verify failed"):
            build.run(steps, lambda n: os.path.join(self.root, n), runner)
        self.assertEqual([c[0] for c in calls], ["ext-catalog"] * 3 + ["ext-catalog-connection"] * 2)

    def test_ext_102_the_steps_of_this_repository(self) -> None:
        """EXT-102: the PostgreSQL connector is built after the connection framework, installed as its zip."""
        order = build.order("ext-catalog-connection-postgres")
        self.assertEqual(order[-2:], ["ext-catalog-connection", "ext-catalog-connection-postgres"])
        steps = [str(s) for s in build.plan("ext-catalog-connection-postgres")]
        self.assertIn("(ext-catalog-connection) mvn -B -ntp -f api/pom.xml install", steps)
        self.assertTrue(any("-DartifactId=ext-catalog-connection -Dversion=" in s and "-Dpackaging=zip" in s
                            for s in steps), steps)


if __name__ == "__main__":
    unittest.main()
