# Catalog API

`io.github.mosaikit.ext:ext-catalog-api`: the contracts of the catalog that other extensions implement
(MK-134), only interfaces and records. The catalog and every extension that implements one of its
contracts bring it as a library; the kernel loads it once, in the highest version of its major
version.

| Package | Contract | Content |
|---|---|---|
| `io.github.mosaikit.ext.catalog.api.v1` | `io.github.mosaikit.ext.catalog/file-kind` version 1 | `FileKind`, a kind of files added to the file manager (EXT-105), with `FileSample`, `FileEvent`, `CatalogFile`, `FileState`, and `CatalogFiles`, the bean of the catalog that finds the files of a kind |

A breaking change of a contract is a new package (`api.v2`) and interface with the next version, next
to the old one, in a minor release; the major version of the artifact changes only when an old
version is retired. See "Kinds of files" in the [README of the catalog](../README.md).

```bash
mvn install    # target/ext-catalog-api-1.0.0.jar, reproducible, into the local repository
```
