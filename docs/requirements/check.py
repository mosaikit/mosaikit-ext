# SPDX-FileCopyrightText: 2026 Massimo Antonini
# SPDX-License-Identifier: MPL-2.0
"""Checks the requirements of this repository (docs/requirements/EXT-nnn.md), as the requirements test
of Mosaikit does for its own:

- the front matter follows docs/requirements/requirement.schema.json (a copy of the one of Mosaikit),
  the file is named after the id, the id has the prefix and the area is one of requirements.json,
  and the body is not empty;
- every dependency on an EXT requirement exists; dependencies on Mosaikit (MK) are checked against a
  clone of it when there is one (../mosaikit, or MOSAIKIT_REQUIREMENTS);
- every EXT id cited by a test exists, and every requirement marked done is cited by a test
  (`@Tag("EXT-012")` in Java, `EXT-012` in the title of a test).

    python docs/requirements/check.py
"""
from __future__ import annotations

import io
import json
import os
import re
import sys

import jsonschema
import yaml

ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
DIRECTORY = os.path.join(ROOT, "docs", "requirements")
FRONT_MATTER = re.compile(r"^---\n(.*?)\n---\n(.*)$", re.S)
TEST_FILES = re.compile(r"(\.spec\.ts|\.test\.ts|\.e2e\.ts|Test\.java|IT\.java)$")


def read(path: str) -> tuple[dict, str]:
    text = io.open(path, encoding="utf-8").read().replace("\r\n", "\n")
    m = FRONT_MATTER.match(text)
    if not m:
        raise ValueError("no front matter between --- lines")
    return yaml.safe_load(m.group(1)) or {}, m.group(2)


def platform_ids() -> set[str] | None:
    directory = os.environ.get("MOSAIKIT_REQUIREMENTS",
                               os.path.join(os.path.dirname(ROOT), "mosaikit", "docs", "requirements"))
    if not os.path.isdir(directory):
        return None
    return {name[:-3] for name in os.listdir(directory) if re.match(r"^MK-\d{3,}\.md$", name)}


def cited_by_tests(prefix: str) -> set[str]:
    cited: set[str] = set()
    tag = re.compile(rf"\b{prefix}-\d{{3,}}\b")
    for base, dirs, files in os.walk(ROOT):
        dirs[:] = [d for d in dirs if d not in ("node_modules", "target", ".git", "docs", ".mosaikit")]
        for name in files:
            if TEST_FILES.search(name):
                cited.update(tag.findall(io.open(os.path.join(base, name), encoding="utf-8", errors="replace").read()))
    return cited


def main() -> int:
    product = json.load(io.open(os.path.join(DIRECTORY, "requirements.json"), encoding="utf-8"))
    schema = json.load(io.open(os.path.join(DIRECTORY, "requirement.schema.json"), encoding="utf-8"))
    validator = jsonschema.Draft202012Validator(schema)
    prefix = product["prefix"]
    own = re.compile(rf"^{prefix}-\d{{3,}}$")
    errors: list[str] = []
    requirements: dict[str, dict] = {}
    for name in sorted(os.listdir(DIRECTORY)):
        if not re.match(r"^[A-Z]{2,4}-\d{3,}\.md$", name):
            continue
        try:
            meta, body = read(os.path.join(DIRECTORY, name))
        except (ValueError, yaml.YAMLError) as e:
            errors.append(f"{name}: {e}")
            continue
        for error in validator.iter_errors(meta):
            where = "/".join(str(p) for p in error.absolute_path) or "front matter"
            errors.append(f"{name}: {where}: {error.message}")
        rid = meta.get("id", "")
        if f"{rid}.md" != name:
            errors.append(f"{name}: its id is {rid}")
        if not own.match(str(rid)):
            errors.append(f"{name}: the id does not have the prefix {prefix}")
        if meta.get("area") not in product["areas"]:
            errors.append(f"{name}: area {meta.get('area')} is not one of requirements.json")
        if len(body.strip()) <= 10:
            errors.append(f"{name}: the body is empty")
        requirements[str(rid)] = meta
    platform = platform_ids()
    for rid, meta in requirements.items():
        for d in list(meta.get("depends") or []) + ([meta["moved-to"]] if meta.get("moved-to") else []):
            if own.match(d):
                if d not in requirements:
                    errors.append(f"{rid}: {d} does not exist")
            elif not any(d.startswith(p + "-") for p in product["dependsOn"]):
                errors.append(f"{rid}: {d} is not of a product this one builds on")
            elif platform is not None and d.startswith("MK-") and d not in platform:
                errors.append(f"{rid}: {d} does not exist in Mosaikit")
    cited = cited_by_tests(prefix)
    for rid in sorted(cited - set(requirements)):
        errors.append(f"a test cites {rid}, which does not exist")
    for rid, meta in requirements.items():
        if meta.get("status") == "done" and "verified-in" not in meta and rid not in cited:
            errors.append(f"{rid} is done but no test cites it")
    for e in errors:
        print("error  ", e)
    counts: dict[str, int] = {}
    for meta in requirements.values():
        counts[meta.get("status", "?")] = counts.get(meta.get("status", "?"), 0) + 1
    print(f"{len(requirements)} requirements ({', '.join(f'{v} {k}' for k, v in sorted(counts.items()))}), "
          f"{len(errors)} errors" + ("" if platform is not None else "; Mosaikit not found, MK ids not checked"))
    return 1 if errors else 0


if __name__ == "__main__":
    sys.exit(main())
