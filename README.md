# mosaikit-ext

Common extensions for [Mosaikit](https://github.com/mosaikit/mosaikit): the pieces most products built
on Mosaikit need, written once and composed by each product next to its own extensions.

| Extension | Manifest id | What it is |
|---|---|---|
| `ext-catalog` | `io.github.mosaikit.ext.catalog` | the file manager of an organization: folders, sub-folders, upload, move, rename, sharing, stored through the file service of the kernel (filesystem in the portable distribution, S3 on a server) |
| `ext-catalog-connection` | `io.github.mosaikit.ext.catalog.connection` | the framework of connections to data sources: list, creation path, detail, source picker, encrypted credentials, content model, SQL workspace |
| `ext-catalog-connection-<source>` | `io.github.mosaikit.ext.catalog.connection.<source>` | one connector per generic kind of source: `postgres`, `mysql`, `sqlserver`, `oracle`, `rest`, `websocket`, `sse`, `mqtt`, `kafka`, `trino`, `bigquery`, `snowflake`, `iceberg` |
| `ext-dashboards` | `io.github.mosaikit.ext.dashboards` | dashboards: the builder, the widget catalog, sources read from the connections, cross filters |
| `ext-processes` | `io.github.mosaikit.ext.processes` | the visual process editor and its server executor: runs, schedules, versions, reports |

The repository holds the requirements first (`docs/requirements/`); the code of the extensions comes
next, one folder per extension at the root.

## Naming

- Folders and artifacts are `ext-<extension>[-<sub>]...`: `ext-catalog`, `ext-catalog-connection`,
  `ext-catalog-connection-kafka`. A sub-extension extends the one its name starts with.
- Manifest ids are reverse-DNS with the same segments: `io.github.mosaikit.ext.catalog.connection.kafka`.
- A product that adds its own extensions to these follows the same rule under its own domain, for
  example `org.example.ext.catalog.connection.myformat` for a connector of its own.

## How products compose them

A product is a Mosaikit distribution that installs some of these extensions and its own. Every
extension here is independent: it declares which others it requires and which it only uses when they
are there (MK-132), it detects the presence of the others (MK-133), it talks to them only through the
contracts they publish (MK-134), and a reference to a resource of an extension that is not installed
degrades into a placeholder instead of an error (MK-135). The libraries an extension needs travel
inside it (MK-131). So a product can, for example:

- install `ext-catalog-connection` with the connectors it needs, and add a connector of its own for a
  protocol of its domain;
- contribute a widget to `ext-dashboards` or a node to `ext-processes` from one of its extensions;
- leave out `ext-processes` altogether, and its dashboards keep working.

None of these extensions knows the products that use it.

## Requirements

`docs/requirements/EXT-nnn.md`, one file per requirement, in the format of the requirements of
Mosaikit; `python docs/requirements/check.py` checks them (`pip install pyyaml jsonschema`). See
[docs/requirements/README.md](docs/requirements/README.md).

## Licence

[Mozilla Public License 2.0](LICENSE). Every file carries the copyright of Massimo Antonini (2026) and
the licence identifier MPL-2.0, in its SPDX header or through [REUSE.toml](REUSE.toml); the
repository follows the [REUSE](https://reuse.software) specification (`reuse lint`).

## Contributing

Contributions are welcome under the rules of Mosaikit: English everywhere, Conventional Commits, and
every commit signed off (`git commit -s`) to certify the
[Developer Certificate of Origin](https://developercertificate.org/). Every change is linked to an
`EXT-nnn` requirement, or to a new one.
