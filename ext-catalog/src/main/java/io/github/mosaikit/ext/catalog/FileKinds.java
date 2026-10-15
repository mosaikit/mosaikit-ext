// SPDX-FileCopyrightText: 2026 Massimo Antonini
// SPDX-License-Identifier: MPL-2.0
package io.github.mosaikit.ext.catalog;

import dev.mosaikit.kernel.api.contract.Contracts;
import io.github.mosaikit.ext.catalog.api.v1.FileKind;
import io.github.mosaikit.ext.catalog.api.v1.FileSample;
import jakarta.enterprise.context.ApplicationScoped;
import java.io.BufferedInputStream;
import java.io.IOException;
import java.io.InputStream;
import java.io.UncheckedIOException;
import java.util.List;
import java.util.Optional;
import java.util.regex.Pattern;
import org.jboss.logging.Logger;

/**
 * The kinds of files of the extensions active in the organization (EXT-105): the implementations of the
 * contract {@code file-kind} of the catalog (MK-134), which the kernel gives anew at each call, so a kind
 * comes and goes with its extension. A kind is known as {@code <extension>/<name>}.
 */
@ApplicationScoped
public class FileKinds {

    private static final Logger LOG = Logger.getLogger(FileKinds.class);

    private static final Pattern NAME = Pattern.compile("[a-z][a-z0-9-]{0,63}");

    private final Contracts contracts;

    public FileKinds(Contracts contracts) {
        this.contracts = contracts;
    }

    /** The kinds of the extensions active in the organization of the request or of the job, by extension. */
    public List<FileKind> active() {
        return contracts.implementations(FileKind.class).stream()
                .filter(FileKinds::valid)
                .toList();
    }

    /** The active kind of this identifier. */
    public Optional<FileKind> find(String id) {
        return id == null ? Optional.empty() : active().stream().filter(kind -> id(kind).equals(id)).findFirst();
    }

    /** The identifier of a kind, {@code <extension>/<name>}. */
    public static String id(FileKind kind) {
        return kind.extension() + "/" + kind.name();
    }

    /** The extension of the identifier of a kind. */
    public static String extensionOf(String id) {
        int slash = id.lastIndexOf('/');
        return slash < 0 ? id : id.substring(0, slash);
    }

    /**
     * The first of the kinds that recognizes the file, in their order; empty for none. A kind that fails
     * counts as one that does not recognize it, so that a fault of an extension never stops an upload.
     */
    public static Optional<String> recognize(FileSample sample, List<FileKind> kinds) {
        for (FileKind kind : kinds) {
            try {
                if (kind.recognizes(sample)) {
                    return Optional.of(id(kind));
                }
            } catch (RuntimeException e) {
                LOG.warnf(e, "The kind of files %s failed to look at %s", id(kind), sample.name());
            }
        }
        return Optional.empty();
    }

    /**
     * Reads the start of a content, to recognize its kind, and gives back a stream that still yields the
     * whole content.
     */
    public static Head head(InputStream content) {
        BufferedInputStream buffered = content instanceof BufferedInputStream stream
                ? stream
                : new BufferedInputStream(content, FileSample.HEAD);
        buffered.mark(FileSample.HEAD);
        try {
            byte[] head = buffered.readNBytes(FileSample.HEAD);
            buffered.reset();
            return new Head(head, buffered);
        } catch (IOException e) {
            throw new UncheckedIOException(e);
        }
    }

    /** The first bytes of a content, and the stream of all of it. */
    public record Head(byte[] bytes, InputStream content) {}

    private static boolean valid(FileKind kind) {
        String name = kind.name();
        if (name == null || !NAME.matcher(name).matches()) {
            LOG.warnf(
                    "Extension %s has a kind of files named %s: a name is lowercase letters, digits and '-'",
                    kind.extension(), name);
            return false;
        }
        return true;
    }
}
