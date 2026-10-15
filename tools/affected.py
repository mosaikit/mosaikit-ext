# SPDX-FileCopyrightText: 2026 Massimo Antonini
# SPDX-License-Identifier: MPL-2.0
"""The extensions a pull request must build and test (EXT-104, ADR-0001).

One repository must not mean one slow pipeline: the CI of a pull request builds the extensions whose
folders it changes and those that require or optionally use them, transitively, and no other. The
dependencies are read from the manifests (`requires` and `optional`, MK-132), never from a list kept
in the CI. A change outside the extension folders (the CI, the shared requirements, tools/, the
README) may concern any extension, so it selects all of them.

    python tools/affected.py select --base origin/main             # folders changed since the merge base, and their dependents
    python tools/affected.py select --files ext-catalog/web/index.js
    python tools/affected.py select --all --json                   # {"extensions": [...], "built": [...]}
    python tools/affected.py select --base SHA --github-output      # the same two lists for $GITHUB_OUTPUT
    python tools/affected.py aggregate '{"build": {"result": "skipped"}, ...}'   # the verdict of the required check

`extensions` are every selected folder; `built` are those of them with a build (pom.xml), the ones the
CI extracts and builds. `aggregate` takes the results of the jobs the required check waits for
(`toJSON(needs)` in a workflow) and passes only if every one succeeded or was skipped because no
extension with a build was selected.
"""
from __future__ import annotations

import argparse
import io
import json
import os
import subprocess
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import release  # noqa: E402

ROOT = release.ROOT


class AffectedError(Exception):
    pass


def folders(root: str = ROOT) -> list[str]:
    """Every extension folder of the repository, with or without a manifest or a build."""
    return sorted(
        name for name in os.listdir(root)
        if name.startswith("ext-") and os.path.isdir(os.path.join(root, name))
    )


def dependents(root: str = ROOT) -> dict[str, set[str]]:
    """For each manifest id, the folders of the extensions that require it or use it when present."""
    result: dict[str, set[str]] = {}
    for extension in release.extensions(root).values():
        for used in {*extension.requires(), *extension.optional()}:
            result.setdefault(used, set()).add(extension.name)
    return result


def id_of(name: str, root: str = ROOT) -> str:
    """The manifest id of a folder; the one its name gives when it has no manifest (or is gone)."""
    folder = os.path.join(root, name)
    if os.path.isfile(os.path.join(folder, "manifest.yaml")):
        identifier = release.load(folder).id
        if identifier:
            return identifier
    return release.expected_id(name)


def folder_of(path: str) -> str | None:
    """The extension folder a changed path belongs to, or None for a file of the root."""
    first = path.replace("\\", "/").lstrip("/").split("/", 1)
    if len(first) == 2 and first[0].startswith("ext-"):
        return first[0]
    return None


def affected(changed: list[str], root: str = ROOT) -> list[str]:
    """The folders to build for these changed paths (relative to the root): the folders they touch and,
    transitively, those that require or use them; every folder when a path is outside the folders."""
    every = folders(root)
    touched = set()
    for path in changed:
        if not path.strip():
            continue
        name = folder_of(path)
        if name is None:
            return every
        touched.add(name)
    users = dependents(root)
    selected = set()
    pending = sorted(touched)
    while pending:
        name = pending.pop()
        if name in selected:
            continue
        selected.add(name)
        pending.extend(users.get(id_of(name, root), ()))
    # A folder removed by the change is not built; those that used it are.
    return sorted(name for name in selected if name in every)


def built(names: list[str], root: str = ROOT) -> list[str]:
    return [name for name in names if os.path.isfile(os.path.join(root, name, "pom.xml"))]


def changed_files(base: str, head: str = "HEAD", root: str = ROOT) -> list[str]:
    """The paths a change touches since its merge base with `base`, old and new names of renames."""
    try:
        result = subprocess.run(
            ["git", "diff", "--name-only", "--no-renames", "-z", f"{base}...{head}"],
            cwd=root, check=True, capture_output=True,
        )
    except subprocess.CalledProcessError as e:
        raise AffectedError(f"git diff {base}...{head} failed: {e.stderr.decode(errors='replace').strip()}")
    return [p for p in result.stdout.decode("utf-8").split("\0") if p]


# The results of a job the required check accepts: skipped only for the build of an empty set.
ACCEPTED = {"success"}


def aggregate(needs: dict, skippable: tuple[str, ...] = ("build",)) -> list[str]:
    """The reasons the required check fails, from the results of the jobs it waits for; none when
    every job succeeded, or a build job was skipped because the set of extensions to build was empty."""
    if not needs:
        return ["the check waits for no job"]
    problems = []
    for job, state in sorted(needs.items()):
        result = (state or {}).get("result")
        if result in ACCEPTED or (result == "skipped" and job in skippable):
            continue
        problems.append(f"{job}: {result}")
    return problems


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    parser.add_argument("--root", default=ROOT, help="the repository (default: the one of this script)")
    commands = parser.add_subparsers(dest="command", required=True)
    c = commands.add_parser("select", help="the extension folders to build, one per line")
    source = c.add_mutually_exclusive_group(required=True)
    source.add_argument("--base", help="the branch or commit the change is merged into")
    source.add_argument("--files", nargs="*", help="the changed paths, relative to the root")
    source.add_argument("--all", action="store_true", help="every extension")
    c.add_argument("--head", default="HEAD", help="the head of the change (default: HEAD)")
    c.add_argument("--json", action="store_true", help='print {"extensions": [...], "built": [...]}')
    c.add_argument("--github-output", action="store_true", help="also append extensions= and built= to $GITHUB_OUTPUT")
    c = commands.add_parser("aggregate", help="pass or fail as one, from the results of the jobs (toJSON(needs))")
    c.add_argument("needs", help="a JSON object {job: {result: ...}}")
    args = parser.parse_args(argv)
    try:
        if args.command == "select":
            if args.all:
                names = folders(args.root)
            else:
                changed = args.files if args.files is not None else changed_files(args.base, args.head, args.root)
                names = affected(changed, args.root)
            lists = {"extensions": names, "built": built(names, args.root)}
            if args.github_output:
                output = os.environ.get("GITHUB_OUTPUT")
                if not output:
                    raise AffectedError("GITHUB_OUTPUT is not set")
                with open(output, "a", encoding="utf-8", newline="\n") as f:
                    for key, value in lists.items():
                        f.write(f"{key}={json.dumps(value)}\n")
            if args.json:
                print(json.dumps(lists))
            else:
                for name in names:
                    print(name)
        elif args.command == "aggregate":
            try:
                needs = json.loads(args.needs)
            except ValueError as e:
                raise AffectedError(f"the results are not JSON: {e}")
            problems = aggregate(needs)
            for problem in problems:
                print(f"error  {problem}", file=sys.stderr)
            if problems:
                return 1
            print("every selected extension passed")
    except (AffectedError, release.ReleaseError) as e:
        for line in str(e).splitlines():
            print(f"error  {line}", file=sys.stderr)
        return 1
    return 0


if __name__ == "__main__":
    sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding="utf-8", line_buffering=True)
    sys.exit(main())
