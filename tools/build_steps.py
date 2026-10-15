# SPDX-FileCopyrightText: 2026 Massimo Antonini
# SPDX-License-Identifier: MPL-2.0
"""The steps that build and test one extension from its folder (EXT-102, ADR-0001).

Every extension builds alone from its folder with the published Mosaikit SDK, as the README of each
folder says; the CI and the extraction test of EXT-102 follow the same steps, decided here:

1. The extensions of this repository it `requires` (its manifest, MK-132), in order (an extension
   after those it requires), each one installed in the local Maven repository as its package, the
   zip `io.github.mosaikit.ext:ext-<name>:<version>:zip` that the tests of the extension install
   next to it, as a product does:
       mvn -f api/pom.xml install                           (when it has an api/ module)
       mvn package -DskipTests -Dinvoker.skip
       mvn install:install-file -Dfile=target/ext-<name>-<version>.zip -DgroupId=io.github.mosaikit.ext
           -DartifactId=ext-<name> -Dversion=<version> -Dpackaging=zip
2. The extension itself:
       mvn -f api/pom.xml install                           (when it has an api/ module)
       mvn verify                                           (its tests, and the bench of tests/)

The api/ module, the contract other extensions compile against (MK-134), is installed apart because
Maven resolves the dependencies of a project before any plugin of its build runs.

    python tools/build_steps.py plan ext-catalog-connection-postgres     # the steps, one command per line
    python tools/build_steps.py run ext-catalog-connection-postgres      # run them, from the folders of this repository
"""
from __future__ import annotations

import argparse
import io
import os
import shlex
import shutil
import subprocess
import sys
from dataclasses import dataclass
from typing import Callable

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import release  # noqa: E402

ROOT = release.ROOT
MAVEN = ["-B", "-ntp"]


class BuildError(Exception):
    pass


@dataclass(frozen=True)
class Step:
    extension: str              # the folder the command runs in, ext-<name>
    args: tuple[str, ...]       # the arguments of mvn

    def __str__(self) -> str:
        return f"({self.extension}) mvn {shlex.join(self.args)}"


def order(name: str, root: str = ROOT) -> list[str]:
    """The folders of the extensions of this repository that `name` requires, transitively, each after
    those it requires, then `name`. Optional extensions are not built: the tests run without them."""
    known = release.extensions(root)
    by_name = {e.name: e for e in known.values()}
    if name not in by_name:
        raise BuildError(f"{name} has no manifest.yaml in the repository")
    result: list[str] = []
    visiting: list[str] = []

    def visit(extension: release.Extension) -> None:
        if extension.name in result:
            return
        if extension.name in visiting:
            cycle = visiting[visiting.index(extension.name):] + [extension.name]
            raise BuildError("the extensions require each other: " + " -> ".join(cycle))
        visiting.append(extension.name)
        for required in sorted(extension.requires()):
            other = known.get(required)
            if other is None:
                # Not of this repository: Maven finds its published package.
                continue
            visit(other)
        visiting.pop()
        result.append(extension.name)

    visit(by_name[name])
    return result


def api_steps(name: str, folder: str) -> list[Step]:
    if os.path.isfile(os.path.join(folder, "api", "pom.xml")):
        return [Step(name, (*MAVEN, "-f", "api/pom.xml", "install"))]
    return []


def install_steps(name: str, folder: str) -> list[Step]:
    """Put the package of an extension in the local Maven repository, as the zip its dependents install."""
    extension = release.load(folder)
    group = extension.pom_text("groupId") or release.GROUP
    artifact = extension.pom_text("artifactId") or name
    version = extension.pom_text("version") or extension.version
    return [
        *api_steps(name, folder),
        Step(name, (*MAVEN, "package", "-DskipTests", "-Dinvoker.skip")),
        Step(name, (*MAVEN, "install:install-file", f"-Dfile=target/{artifact}-{version}.zip",
                    f"-DgroupId={group}", f"-DartifactId={artifact}", f"-Dversion={version}", "-Dpackaging=zip")),
    ]


def verify_steps(name: str, folder: str) -> list[Step]:
    return [*api_steps(name, folder), Step(name, (*MAVEN, "verify"))]


def plan(name: str, root: str = ROOT, locate: Callable[[str], str] | None = None,
         installed: set[str] | None = None) -> list[Step]:
    """The steps that build and test `name`: those it requires installed first, then its own verify.
    `locate` gives the folder of an extension (default: its folder in `root`); the extensions in
    `installed` are already in the local Maven repository and are skipped."""
    locate = locate or (lambda n: os.path.join(root, n))
    names = order(name, root)
    steps: list[Step] = []
    for required in names[:-1]:
        if installed is None or required not in installed:
            steps += install_steps(required, locate(required))
    return steps + verify_steps(name, locate(name))


def run(steps: list[Step], locate: Callable[[str], str], runner=subprocess.run) -> None:
    mvn = shutil.which("mvn") or "mvn"
    for step in steps:
        print(f"::group::{step}" if os.environ.get("GITHUB_ACTIONS") else f"--- {step}", flush=True)
        result = runner([mvn, *step.args], cwd=locate(step.extension))
        if os.environ.get("GITHUB_ACTIONS"):
            print("::endgroup::", flush=True)
        if result.returncode != 0:
            raise BuildError(f"{step} failed with exit code {result.returncode}")


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    parser.add_argument("--root", default=ROOT, help="the repository (default: the one of this script)")
    commands = parser.add_subparsers(dest="command", required=True)
    for command, text in (("plan", "print the steps"), ("run", "run the steps")):
        c = commands.add_parser(command, help=text)
        c.add_argument("names", nargs="+", help="extension folders, ext-<name>")
    args = parser.parse_args(argv)

    def locate(name: str) -> str:
        return os.path.join(args.root, name)

    try:
        installed: set[str] = set()
        for name in args.names:
            name = os.path.basename(os.path.normpath(name))
            steps = plan(name, args.root, locate, installed)
            installed.update(order(name, args.root)[:-1])
            if args.command == "plan":
                for step in steps:
                    print(step)
            else:
                run(steps, locate)
    except (BuildError, release.ReleaseError) as e:
        for line in str(e).splitlines():
            print(f"error  {line}", file=sys.stderr)
        return 1
    return 0


if __name__ == "__main__":
    sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding="utf-8", line_buffering=True)
    sys.exit(main())
