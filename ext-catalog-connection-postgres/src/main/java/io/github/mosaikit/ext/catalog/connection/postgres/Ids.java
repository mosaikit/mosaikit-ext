// SPDX-FileCopyrightText: 2026 Massimo Antonini
// SPDX-License-Identifier: MPL-2.0
package io.github.mosaikit.ext.catalog.connection.postgres;

import java.util.ArrayList;
import java.util.List;

/**
 * The ids of the pieces of a database (EXT-019): {@code schema} and {@code schema/table}, with the
 * names as they are, except '%' and '/', written {@code %25} and {@code %2F}, so that any name of
 * PostgreSQL makes one id and the id gives back the names.
 */
final class Ids {

    private Ids() {}

    /** The id of a schema, or of a relation of a schema. */
    static String of(String... names) {
        List<String> segments = new ArrayList<>();
        for (String name : names) {
            segments.add(name.replace("%", "%25").replace("/", "%2F"));
        }
        return String.join("/", segments);
    }

    /** The names of an id: none for the top level, the schema, or the schema and the relation. */
    static List<String> parse(String id) {
        List<String> names = new ArrayList<>();
        if (id == null || id.isEmpty()) {
            return names;
        }
        for (String segment : id.split("/", -1)) {
            StringBuilder name = new StringBuilder();
            for (int i = 0; i < segment.length(); i++) {
                char c = segment.charAt(i);
                if (c == '%') {
                    if (segment.startsWith("%25", i)) {
                        name.append('%');
                    } else if (segment.regionMatches(true, i, "%2F", 0, 3)) {
                        name.append('/');
                    } else {
                        throw new IllegalArgumentException("Not an id of this connector: " + id);
                    }
                    i += 2;
                } else {
                    name.append(c);
                }
            }
            if (name.isEmpty()) {
                throw new IllegalArgumentException("Not an id of this connector: " + id);
            }
            names.add(name.toString());
        }
        return names;
    }
}
