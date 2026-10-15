// SPDX-FileCopyrightText: 2026 Massimo Antonini
// SPDX-License-Identifier: MPL-2.0
package io.github.mosaikit.ext.catalog;

import dev.mosaikit.kernel.api.files.FileStorage;
import dev.mosaikit.kernel.api.files.SignedLink;
import dev.mosaikit.kernel.api.sharing.Sharing;
import io.quarkus.security.Authenticated;
import jakarta.transaction.Transactional;
import jakarta.ws.rs.Consumes;
import jakarta.ws.rs.POST;
import jakarta.ws.rs.Path;
import jakarta.ws.rs.Produces;
import jakarta.ws.rs.core.MediaType;
import jakarta.ws.rs.core.Response;
import java.time.Duration;
import java.time.Instant;
import java.util.ArrayList;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.NoSuchElementException;
import java.util.UUID;

/**
 * Downloads (EXT-002, EXT-004), under {@code /api/v1/ext/catalog/downloads}: one file with its name, or
 * several items as one archive that the app writes from their files. The content never passes through
 * the extension: each file comes from a signed, expiring link of the file service of the kernel
 * (MK-093), made in the request for the person, who reads each file also through a folder above it
 * (MK-136): the link carries their rights, so revoking their share stops it at its next use.
 */
@Path("/api/v1/ext/catalog/downloads")
@Produces(MediaType.APPLICATION_JSON)
@Consumes(MediaType.APPLICATION_JSON)
@Authenticated
public class DownloadResource {

    /** How long the links of a download are valid unless asked otherwise, in seconds. */
    static final int VALIDITY = 300;

    /** The longest validity a download may ask for, in seconds. */
    static final int MAX_VALIDITY = 3600;

    /** The most items one download names. */
    static final int MAX_ITEMS = 1000;

    /**
     * Request of a download.
     *
     * @param items the items to download: one file is downloaded as it is, anything else as an archive
     * @param name the name of the archive, {@code <folder>.zip} for one folder unless given
     * @param validFor how long the links are valid, in seconds: {@value #VALIDITY} unless given, at most
     *     {@value #MAX_VALIDITY}
     */
    public record NewDownload(List<UUID> items, String name, Integer validFor) {}

    /** An entry of a download: its path in the archive and its link, none for a folder. */
    public record EntryView(String path, String url) {}

    /**
     * A download, with its links.
     *
     * @param kind {@code file} for one file, saved as it is, or {@code archive}
     * @param expires when its links stop working
     */
    public record DownloadView(String kind, String name, Instant expires, List<EntryView> entries) {}

    private final Items items;
    private final Sharing sharing;
    private final FileStorage files;

    public DownloadResource(Items items, Sharing sharing, FileStorage files) {
        this.items = items;
        this.sharing = sharing;
        this.files = files;
    }

    /**
     * A download of items the person reads, with the signed links of its files; 404 when an item does
     * not exist or they cannot read it.
     */
    @POST
    @Transactional
    public DownloadView create(NewDownload request) {
        if (request == null || request.items() == null || request.items().isEmpty()) {
            throw CatalogResource.problem(Response.Status.BAD_REQUEST, "The download names no item.");
        }
        if (request.items().size() > MAX_ITEMS) {
            throw CatalogResource.problem(
                    Response.Status.BAD_REQUEST, "A download names at most " + MAX_ITEMS + " items.");
        }
        int validity = request.validFor() == null ? VALIDITY : request.validFor();
        if (validity < 1 || validity > MAX_VALIDITY) {
            throw CatalogResource.problem(
                    Response.Status.BAD_REQUEST, "validFor is between 1 and " + MAX_VALIDITY + " seconds.");
        }
        Tree tree = new Tree(items, sharing);
        List<Item> selected = new ArrayList<>();
        for (UUID id : new LinkedHashSet<>(request.items())) {
            selected.add(tree.readable(id).orElseThrow(CatalogResource::notFound));
        }
        boolean single = selected.size() == 1 && !selected.getFirst().isFolder();
        String name = single ? selected.getFirst().getName() : archiveName(request.name(), selected);
        List<Archive.Entry> entries = Archive.entries(selected, folder -> items.children(folder.getId()).stream()
                .sorted(Listing.order(null, null))
                .toList());
        Duration duration = Duration.ofSeconds(validity);
        List<EntryView> signed = new ArrayList<>();
        for (Archive.Entry entry : entries) {
            if (entry.file() == null) {
                signed.add(new EntryView(entry.path(), null));
                continue;
            }
            try {
                SignedLink link = files.link(CatalogResource.EXTENSION, entry.file(), duration);
                signed.add(new EntryView(entry.path(), link.path()));
            } catch (NoSuchElementException e) {
                // The content is gone or the kernel does not let the person read it: as an item not found.
                throw CatalogResource.notFound();
            }
        }
        return new DownloadView(single ? "file" : "archive", name, Instant.now().plus(duration), List.copyOf(signed));
    }

    /** The name of an archive: the one asked, or the folder selected alone, or "Files". */
    private static String archiveName(String requested, List<Item> selected) {
        String base;
        if (requested != null && !requested.isBlank()) {
            base = CatalogResource.name(requested.endsWith(".zip")
                    ? requested.substring(0, requested.length() - 4)
                    : requested);
        } else if (selected.size() == 1) {
            base = selected.getFirst().getName();
        } else {
            base = "Files";
        }
        return base + ".zip";
    }
}
