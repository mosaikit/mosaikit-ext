// SPDX-FileCopyrightText: 2026 Massimo Antonini
// SPDX-License-Identifier: MPL-2.0
package org.example.textnotes;

import io.github.mosaikit.ext.catalog.api.v1.CatalogFile;
import io.github.mosaikit.ext.catalog.api.v1.FileEvent;
import io.github.mosaikit.ext.catalog.api.v1.FileEvent.Change;
import io.github.mosaikit.ext.catalog.api.v1.FileKind;
import io.github.mosaikit.ext.catalog.api.v1.FileSample;
import io.github.mosaikit.ext.catalog.api.v1.FileState;
import jakarta.enterprise.context.ApplicationScoped;
import java.io.IOException;
import java.io.InputStream;
import java.io.UncheckedIOException;
import java.nio.charset.StandardCharsets;
import java.util.Set;

/**
 * The kind "text note" (EXT-105): a file named *.note, of type text/x-note, or whose text starts with
 * "NOTE:". When a note is stored, replaced or found again, the kind reads it on the server and records
 * how many words it has (counted), or that it has none (empty), and reads it again through a signed link
 * of the catalog, as a process of the extension that loads it elsewhere would (EXT-107); every change it
 * is told is kept by {@link ReceivedEvents}, for the tests.
 */
@ApplicationScoped
public class TextNoteKind implements FileKind {

    static final String EXTENSION = "org.example.textnotes";

    private static final byte[] MAGIC = "NOTE:".getBytes(StandardCharsets.US_ASCII);
    private static final Set<Change> READS = Set.of(Change.STORED, Change.REPLACED, Change.RECOGNIZED);

    private final ReceivedEvents received;

    public TextNoteKind(ReceivedEvents received) {
        this.received = received;
    }

    @Override
    public String extension() {
        return EXTENSION;
    }

    @Override
    public String name() {
        return "text-note";
    }

    @Override
    public boolean recognizes(FileSample sample) {
        return sample.extension().equals("note") || sample.isOfType("text/x-note") || sample.startsWith(MAGIC);
    }

    @Override
    public void changed(FileEvent event) {
        CatalogFile file = event.file();
        String text = null;
        LinkedContent.Read linked = null;
        if (event.change() != Change.DELETED) {
            text = read(file);
            if (READS.contains(event.change())) {
                int words = words(text);
                file.record(words == 0
                        ? FileState.of("empty", "The note has no words.")
                        : FileState.of("counted", words == 1 ? "1 word" : words + " words"));
                linked = LinkedContent.read(file);
            }
        }
        received.add(event, text, linked);
    }

    static String read(CatalogFile file) {
        try (InputStream content = file.open()) {
            return new String(content.readAllBytes(), StandardCharsets.UTF_8);
        } catch (IOException e) {
            throw new UncheckedIOException(e);
        }
    }

    static int words(String text) {
        String body = text.startsWith("NOTE:") ? text.substring(5) : text;
        String trimmed = body.strip();
        return trimmed.isEmpty() ? 0 : trimmed.split("\\s+").length;
    }
}
