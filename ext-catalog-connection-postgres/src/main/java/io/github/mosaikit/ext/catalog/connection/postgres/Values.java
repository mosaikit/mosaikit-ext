// SPDX-FileCopyrightText: 2026 Massimo Antonini
// SPDX-License-Identifier: MPL-2.0
package io.github.mosaikit.ext.catalog.connection.postgres;

import java.math.BigDecimal;
import java.math.BigInteger;
import java.sql.Array;
import java.sql.SQLException;
import java.util.HexFormat;

/** The values of a row of PostgreSQL as JSON values: text, numbers, booleans or null (EXT-040). */
final class Values {

    private Values() {}

    static Object json(Object value) throws SQLException {
        return switch (value) {
            case null -> null;
            case Boolean bool -> bool;
            case Integer number -> number;
            case Long number -> number;
            case Short number -> number.intValue();
            case BigInteger number -> number;
            case BigDecimal number -> number;
            // NaN and the infinities are not JSON numbers.
            case Double number -> number.isNaN() || number.isInfinite() ? number.toString() : number;
            case Float number -> number.isNaN() || number.isInfinite() ? number.toString() : number.doubleValue();
            case byte[] bytes -> "\\x" +HexFormat.of().formatHex(bytes);
            case Array array -> array.toString();
            default -> value.toString();
        };
    }
}
