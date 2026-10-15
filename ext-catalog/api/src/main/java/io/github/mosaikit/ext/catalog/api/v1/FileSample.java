// SPDX-FileCopyrightText: 2026 Massimo Antonini
// SPDX-License-Identifier: MPL-2.0
package io.github.mosaikit.ext.catalog.api.v1;

import java.util.Arrays;
import java.util.Locale;
import java.util.Objects;

/**
 * What a kind of file looks at to recognize a file (EXT-105): its name, its media type as it was
 * stored, its size and its first bytes, at most {@link #HEAD} of them.
 *
 * @param name the name of the file in its folder, such as {@code plan.note}
 * @param mediaType the media type it was stored with, such as {@code text/plain}; {@code
 *     application/octet-stream} when unknown
 * @param size its size in bytes
 * @param head its first bytes, all of them for a file smaller than {@link #HEAD}
 */
public record FileSample(String name, String mediaType, long size, byte[] head) {

    /** How many bytes of the start of a file a sample holds, at most. */
    public static final int HEAD = 4096;

    public FileSample {
        Objects.requireNonNull(name, "name");
        mediaType = mediaType == null || mediaType.isBlank() ? "application/octet-stream" : mediaType;
        head = head == null ? new byte[0] : head.clone();
        if (head.length > HEAD) {
            head = Arrays.copyOf(head, HEAD);
        }
    }

    /** The extension of the name, lowercase and without the dot, such as {@code note}; empty without one. */
    public String extension() {
        int dot = name.lastIndexOf('.');
        return dot < 0 || dot == name.length() - 1 ? "" : name.substring(dot + 1).toLowerCase(Locale.ROOT);
    }

    /** Whether the media type is this one, without its parameters and in any case. */
    public boolean isOfType(String type) {
        int semicolon = mediaType.indexOf(';');
        String bare = (semicolon < 0 ? mediaType : mediaType.substring(0, semicolon)).trim();
        return bare.equalsIgnoreCase(type);
    }

    /** Whether the content starts with these bytes, such as a magic number. */
    public boolean startsWith(byte... prefix) {
        if (prefix.length > head.length) {
            return false;
        }
        for (int i = 0; i < prefix.length; i++) {
            if (head[i] != prefix[i]) {
                return false;
            }
        }
        return true;
    }

    /** The first bytes, a copy. */
    @Override
    public byte[] head() {
        return head.clone();
    }

    @Override
    public boolean equals(Object other) {
        return other instanceof FileSample sample
                && name.equals(sample.name)
                && mediaType.equals(sample.mediaType)
                && size == sample.size
                && Arrays.equals(head, sample.head);
    }

    @Override
    public int hashCode() {
        return Objects.hash(name, mediaType, size, Arrays.hashCode(head));
    }

    @Override
    public String toString() {
        return "FileSample[name=" + name + ", mediaType=" + mediaType + ", size=" + size + ", head=" + head.length
                + " bytes]";
    }
}
