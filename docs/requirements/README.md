# Requirements

One Markdown file per requirement, `EXT-nnn.md`, with a YAML front matter and the description in the
body: the format of the requirements of Mosaikit
([`docs/requirements`](https://github.com/mosaikit/mosaikit/tree/main/docs/requirements)).

```markdown
---
id: EXT-003
title: Folders and files are shared with people, groups, the organization or a link
area: files
priority: P1
status: proposed
depends: [EXT-001, MK-055]
estimate: [5, 8]
acceptance:
  - Sharing a folder with a group gives its members access to everything inside it.
---

Why it is wanted and what it covers.

## History

- 2026-10-14: written.
```

- `requirement.schema.json` is a copy of the schema of Mosaikit: update it from there.
- `requirements.json` gives the prefix `EXT`, the areas (`files`, `connections`, `dashboards`,
  `processes`, `common`) and the products these extensions build on (`MK`).
- `python docs/requirements/check.py` checks the files: schema, name, prefix, area, body,
  dependencies (also on Mosaikit when it is cloned next to this repository, or found through
  `MOSAIKIT_REQUIREMENTS`), and that every requirement marked `done` is cited by a test.

## Statuses

`proposed` (written, not yet planned), `planned` (in a phase of a plan), `in-progress`, `done` (its
acceptance is verified by tests), `dropped` (no longer wanted, the body says why), `moved` (carried on
by `moved-to`).

## Areas and extensions

| Area | Extension |
|---|---|
| `files` | `ext-catalog` |
| `connections` | `ext-catalog-connection` and its connectors `ext-catalog-connection-<source>` |
| `dashboards` | `ext-dashboards` |
| `processes` | `ext-processes` |
| `common` | what several of them share: cards, headers, list pages, lineage, contracts |

## Where they come from

Many of these requirements were written first by a product built on Mosaikit and moved here when it
decided to compose these common extensions; their History says from which id. They are rewritten
without anything of that product.
