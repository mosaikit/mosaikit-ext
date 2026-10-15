// SPDX-FileCopyrightText: 2026 Massimo Antonini
// SPDX-License-Identifier: MPL-2.0
package io.github.mosaikit.ext.catalog.api.v1;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertNull;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.junit.jupiter.api.Assertions.assertTrue;

import dev.mosaikit.kernel.api.contract.Contract;
import java.nio.charset.StandardCharsets;
import org.junit.jupiter.api.Tag;
import org.junit.jupiter.api.Test;

/** A kind recognizes a file by its name, its media type or its first bytes, and records a state (EXT-105). */
@Tag("EXT-105")
class FileSampleTest {

    @Test
    void theContractIsVersionOneOfFileKindOfTheCatalog() {
        Contract contract = FileKind.class.getAnnotation(Contract.class);
        assertEquals("io.github.mosaikit.ext.catalog", contract.extension());
        assertEquals("file-kind", contract.name());
        assertEquals(1, contract.version());
    }

    @Test
    void aSampleGivesTheExtensionTheMediaTypeAndTheFirstBytes() {
        byte[] png = {(byte) 0x89, 'P', 'N', 'G', '\r', '\n'};
        FileSample sample = new FileSample("Plan.Final.PNG", "image/png; charset=binary", 6, png);
        assertEquals("png", sample.extension());
        assertTrue(sample.isOfType("IMAGE/PNG"));
        assertFalse(sample.isOfType("image/jpeg"));
        assertTrue(sample.startsWith((byte) 0x89, (byte) 'P', (byte) 'N', (byte) 'G'));
        assertFalse(sample.startsWith("%PDF".getBytes(StandardCharsets.US_ASCII)));
        assertFalse(sample.startsWith(new byte[10]));
    }

    @Test
    void aSampleWithoutTypeOrExtensionIsOctetStream() {
        FileSample sample = new FileSample("README", null, 0, null);
        assertEquals("", sample.extension());
        assertEquals("application/octet-stream", sample.mediaType());
        assertEquals(0, sample.head().length);
        assertEquals("", new FileSample("odd.", "text/plain", 0, null).extension());
    }

    @Test
    void aSampleKeepsAtMostTheHeadOfTheContent() {
        FileSample sample = new FileSample("big.bin", "application/octet-stream", 10_000, new byte[10_000]);
        assertEquals(FileSample.HEAD, sample.head().length);
        byte[] head = sample.head();
        head[0] = 1;
        assertEquals(0, sample.head()[0], "the head cannot be changed from outside");
    }

    @Test
    void aStateIsANameWithAnOptionalDetail() {
        assertEquals("loaded", FileState.of("loaded").value());
        assertNull(FileState.of("loaded", "  ").detail());
        assertEquals("No rows", FileState.of("failed", "No rows").detail());
        assertThrows(IllegalArgumentException.class, () -> FileState.of("Loaded"));
        assertThrows(IllegalArgumentException.class, () -> FileState.of("9lives"));
        assertThrows(IllegalArgumentException.class, () -> FileState.of("a".repeat(33)));
        assertThrows(
                IllegalArgumentException.class, () -> FileState.of("failed", "x".repeat(FileState.MAX_DETAIL + 1)));
    }
}
