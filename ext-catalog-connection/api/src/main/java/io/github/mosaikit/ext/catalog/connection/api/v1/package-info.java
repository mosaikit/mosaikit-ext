// SPDX-FileCopyrightText: 2026 Massimo Antonini
// SPDX-License-Identifier: MPL-2.0
/**
 * Version 1 of the contract between the connection framework and its connectors (EXT-010, MK-134):
 * {@link io.github.mosaikit.ext.catalog.connection.api.v1.Connector} and the records it exchanges: the
 * one shape of the contents of every source, {@link io.github.mosaikit.ext.catalog.connection.api.v1.Piece}
 * (EXT-019), and the rows of a query (EXT-040). A
 * breaking change is a new package, {@code api.v2}, next to this one.
 */
package io.github.mosaikit.ext.catalog.connection.api.v1;
