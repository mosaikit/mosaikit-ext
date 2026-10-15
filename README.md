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

Each extension has a folder of its own at the root, holding its requirements
(`ext-<name>/docs/requirements/`) and, once its code arrives, its build, sources, tests and changelog
(ADR-0001); the requirements that span several extensions are in `docs/requirements/`.

## One folder, one extension

Each folder is a project of its own, built and tested like an extension of a third party, only
against what Mosaikit publishes (EXT-102). `ext-catalog` and `ext-catalog-connection` have a build;
the others have their README and requirements until their code arrives. A folder with a build holds:

```
ext-<name>/
  manifest.yaml        id io.github.mosaikit.ext.<name>, frontend, contributions
  pom.xml              parent io.github.mosaikit:mosaikit-extension-parent (empty relativePath),
                       coordinates io.github.mosaikit.ext:ext-<name>
  package.json         the bench @mosaikit/testing and Playwright; playwright.config.ts, tsconfig.json
  web/                 the app (index.js), its texts in English and Italian (i18n.js), its icon
  tests/               Playwright tests on the bench, titled with the id of their requirement
  docs/requirements/   its EXT-nnn.md
  README.md, CHANGELOG.md, .gitignore
```

From the folder, with Java 25, Maven and Node.js 24: `mvn package` writes
`target/ext-<name>-<version>.zip`, `mvn verify` also runs `npm test` on a Mosaikit installation
started by the bench. Until the first release of Mosaikit the parent POM is its `0.1.0-SNAPSHOT` and
the bench its `mosaikit-testing-latest.tgz`, both from the pre-release
[`snapshot`](https://github.com/mosaikit/mosaikit/releases/tag/snapshot); the README of each
extension says how to put the parent in the local Maven repository, and the CI does it with the
action `mosaikit/.github/actions/kernel-api`.

A file of an extension never refers to a file outside its folder: another extension, or Mosaikit,
is used through its published package. `python tools/check_self_contained.py` fails on a relative
path that leaves the folder, a Markdown link to the root, an npm dependency on a path or a
workspace, a POM that looks for its parent in `../pom.xml`, a link outside the folder, or a folder
with a build that lacks its manifest, changelog, requirements or tests. Its tests,
`python -m unittest discover -s tools -v`, also extract every folder with a build as a repository of
its own; with `EXT_102_BUILD=1` they build and test it there, and `EXT_102_EXTENSIONS=ext-a,ext-b`
limits them to those folders. The steps are those the README of each folder gives, and
`python tools/build_steps.py plan ext-<name>` prints them: first the extensions of this repository it
`requires` (manifest), each after those it requires, built and installed in the local Maven repository
as their zip package; then its `api/` module, when it has one (Maven resolves dependencies before any
plugin runs, so it is installed apart), and `mvn verify`.

The CI of a pull request builds only the extensions it changes and those that require or optionally
use them, transitively, as their manifests declare; a change to a file of the root (CI, shared
requirements, tools) builds every extension. `python tools/affected.py select --base origin/main`
prints that set (EXT-104).

### Moving an extension to a repository of its own

```bash
git clone https://github.com/mosaikit/mosaikit-ext.git ext-catalog && cd ext-catalog
git filter-repo --subdirectory-filter ext-catalog   # pip install git-filter-repo
mvn verify                                          # builds and passes its tests, unchanged
```

The history of the folder is kept and the package coordinates do not change. What the new
repository takes from the root, by hand, is the licence (`LICENSE`, `LICENSES/`, `REUSE.toml`) and
a CI workflow.

## Releases

Each extension is released on its own, with its own version, from a tag `ext-<name>/vX.Y.Z`
(EXT-103): a fix to one extension does not release the others. A release publishes only that
extension, as `io.github.mosaikit.ext:ext-<name>` version X.Y.Z: its package zip in Maven Central,
where Mosaikit publishes its Maven artifacts, and attached to a GitHub release of the tag, whose
notes are the section of that version in the extension's `CHANGELOG.md`.

1. In the folder, set the version in `pom.xml`, `manifest.yaml` and `package.json`, and give the
   entries of `## [Unreleased]` in `CHANGELOG.md` a section `## [X.Y.Z] - <date>`.
2. `python tools/release.py check ext-<name>/vX.Y.Z` passes; merge.
3. A maintainer tags the merged commit and pushes the tag.

`tools/release.py` (`pip install pyyaml`) holds what a release decides, and the release workflow only
calls it: `check` refuses a tag whose version differs from the build, the manifest or `package.json`,
a version without its changelog section, a parent POM that is still a snapshot, or a required
extension that is not in this repository; `notes` prints the release notes; `bundle` and `publish`
build and upload the bundle of the Central Portal; `closure` lists what a product gets with an
extension. Its tests are in `tools/test_release.py`.

### Getting an extension in a product

A product declares each extension it installs by package and version. The published POM of an
extension declares, as dependencies of type `zip`, the extensions its manifest `requires`, with the
range of versions of the manifest (MK-132); the ones it uses only when present (`optional`) are not
dependencies. So Maven brings the extension and the extensions it requires, and nothing else:

```xml
<dependency>
  <groupId>io.github.mosaikit.ext</groupId>
  <artifactId>ext-catalog-connection-postgres</artifactId>
  <version>0.1.0</version>
  <type>zip</type>
</dependency>
<!-- in the build of the distribution: every extension zip into extensions/ -->
<plugin>
  <groupId>org.apache.maven.plugins</groupId>
  <artifactId>maven-dependency-plugin</artifactId>
  <executions>
    <execution>
      <id>extensions</id>
      <phase>package</phase>
      <goals><goal>copy-dependencies</goal></goals>
      <configuration>
        <includeTypes>zip</includeTypes>
        <outputDirectory>${project.build.directory}/extensions</outputDirectory>
      </configuration>
    </execution>
  </executions>
</plugin>
```

Without Maven, `gh release download ext-<name>/vX.Y.Z --repo mosaikit/mosaikit-ext --pattern '*.zip'`
downloads one package; its release notes name the extensions it requires.
`python tools/release.py closure ext-catalog-connection-postgres` lists them from the manifests of the
repository.

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

`EXT-nnn.md`, one file per requirement, in the format of the requirements of Mosaikit: in
`ext-<name>/docs/requirements/` for the requirements of one extension, in `docs/requirements/` for
those that span several; `python docs/requirements/check.py` checks them all (`pip install pyyaml jsonschema`). See
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
