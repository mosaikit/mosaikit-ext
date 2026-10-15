// SPDX-FileCopyrightText: 2026 Massimo Antonini
// SPDX-License-Identifier: MPL-2.0
package io.github.mosaikit.ext.catalog.connection.api.v1;

/**
 * The outcome of a connection test (EXT-010).
 *
 * @param success whether the source answered and accepted the credential
 * @param message what to tell the person, such as the version of the server or why it failed; never the
 *     credential
 */
public record TestResult(boolean success, String message) {

    /** The source answered. */
    public static TestResult succeeded(String message) {
        return new TestResult(true, message);
    }

    /** The source did not answer, or refused the connection. */
    public static TestResult failed(String message) {
        return new TestResult(false, message);
    }
}
