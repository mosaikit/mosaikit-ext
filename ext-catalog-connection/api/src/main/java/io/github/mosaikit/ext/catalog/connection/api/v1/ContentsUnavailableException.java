// SPDX-FileCopyrightText: 2026 Massimo Antonini
// SPDX-License-Identifier: MPL-2.0
package io.github.mosaikit.ext.catalog.connection.api.v1;

/**
 * Why a connector cannot list the contents of a source (EXT-019): the framework tells the person each
 * reason with its own message, never with an empty list. A source that answers with nothing is not an
 * exception: it is an empty page, which the framework tells apart too.
 *
 * <p>The message is the detail of the source, such as the error of the remote system, shown to the
 * person; it never contains the credential.
 */
public class ContentsUnavailableException extends RuntimeException {

    private static final long serialVersionUID = 1L;

    /** Why the contents cannot be listed. */
    public enum Reason {
        /** The source does not answer, or refuses the connection or the credential. */
        UNREACHABLE,
        /** The source does not describe its contents, such as an API without a description of its endpoints: someone has to declare them. */
        NEEDS_DECLARATION,
        /** The connector cannot read this kind of source or of piece yet. */
        NOT_READABLE
    }

    private final Reason reason;

    public ContentsUnavailableException(Reason reason, String message) {
        super(message);
        if (reason == null) {
            throw new IllegalArgumentException("A reason is required");
        }
        this.reason = reason;
    }

    public ContentsUnavailableException(Reason reason, String message, Throwable cause) {
        this(reason, message);
        initCause(cause);
    }

    /** The source does not answer or refuses the connection; the message is its error. */
    public static ContentsUnavailableException unreachable(String message) {
        return new ContentsUnavailableException(Reason.UNREACHABLE, message);
    }

    /** The source does not describe its contents: they have to be declared. */
    public static ContentsUnavailableException needsDeclaration(String message) {
        return new ContentsUnavailableException(Reason.NEEDS_DECLARATION, message);
    }

    /** The connector cannot read this kind of piece or of source yet. */
    public static ContentsUnavailableException notReadable(String message) {
        return new ContentsUnavailableException(Reason.NOT_READABLE, message);
    }

    public Reason reason() {
        return reason;
    }
}
