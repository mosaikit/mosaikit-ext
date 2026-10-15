// SPDX-FileCopyrightText: 2026 Massimo Antonini
// SPDX-License-Identifier: MPL-2.0
package io.github.mosaikit.ext.catalog;

import com.fasterxml.jackson.databind.ObjectMapper;
import dev.mosaikit.kernel.api.context.CurrentOrganization;
import dev.mosaikit.kernel.api.events.PlatformEvents;
import dev.mosaikit.kernel.api.files.FileStorage;
import dev.mosaikit.kernel.api.files.SignedLink;
import dev.mosaikit.kernel.api.sharing.Sharing;
import io.quarkus.security.Authenticated;
import io.quarkus.security.identity.SecurityIdentity;
import jakarta.transaction.Transactional;
import jakarta.ws.rs.Consumes;
import jakarta.ws.rs.GET;
import jakarta.ws.rs.POST;
import jakarta.ws.rs.Path;
import jakarta.ws.rs.PathParam;
import jakarta.ws.rs.Produces;
import jakarta.ws.rs.core.MediaType;
import jakarta.ws.rs.core.Response;
import java.time.Duration;
import java.time.Instant;
import java.util.ArrayList;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Map;
import java.util.NoSuchElementException;
import java.util.Optional;
import java.util.UUID;

/**
 * Downloads (EXT-002, EXT-004), under {@code /api/v1/ext/catalog/downloads}: one file with its name, or
 * several items as one archive that the app writes from their files. The content never passes through
 * the extension: each file comes from a signed, expiring link of the file service of the kernel
 * (MK-093), made for the items the person reads.
 *
 * <p>The kernel makes a link for a person only to a file on which they hold a level themselves; it does
 * not know that a level on a folder counts on its content. When a file of the download is reached only
 * through a folder, the extension, after its own check, asks a job of the organization to make the
 * links without a person (see {@link CatalogJobs}): the download answers 202 and is ready a few seconds
 * later at {@code GET /downloads/{id}}.
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

    /** How long a download is kept, to be read again. */
    static final Duration KEPT = Duration.ofDays(1);

    /** The event that asks a job to make the links of a download. */
    static final String DOWNLOAD_REQUESTED = "download.requested";

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
     * A download.
     *
     * @param id its identifier, to read it again while it is {@code pending}
     * @param kind {@code file} for one file, saved as it is, or {@code archive}
     * @param status {@code pending}, {@code ready} or {@code failed}
     * @param expires when its links stop working, once ready
     */
    public record DownloadView(
            UUID id, String kind, String name, String status, Instant expires, List<EntryView> entries) {}

    private final Items items;
    private final Downloads downloads;
    private final Sharing sharing;
    private final FileStorage files;
    private final PlatformEvents events;
    private final CurrentOrganization organization;
    private final SecurityIdentity identity;
    private final ObjectMapper mapper;

    public DownloadResource(
            Items items,
            Downloads downloads,
            Sharing sharing,
            FileStorage files,
            PlatformEvents events,
            CurrentOrganization organization,
            SecurityIdentity identity,
            ObjectMapper mapper) {
        this.items = items;
        this.downloads = downloads;
        this.sharing = sharing;
        this.files = files;
        this.events = events;
        this.organization = organization;
        this.identity = identity;
        this.mapper = mapper;
    }

    /**
     * Asks for a download of items the person reads: 200 with the links when the kernel makes them for
     * the person, 202 while a job makes them; 404 when an item does not exist or they cannot read it.
     */
    @POST
    @Transactional
    public Response create(NewDownload request) {
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
        String kind = single ? "file" : "archive";

        Optional<List<Archive.Entry>> signed = signAsPerson(entries, validity);
        if (signed.isPresent()) {
            Instant expires = Instant.now().plusSeconds(validity);
            return Response.ok(new DownloadView(null, kind, name, Download.READY, expires, views(signed.get())))
                    .build();
        }
        Instant now = Instant.now();
        downloads.deleteBefore(now.minus(KEPT));
        Download download = new Download(
                organization.require(), person(), name, validity, Archive.json(mapper, entries), now);
        downloads.insert(download);
        events.raise(
                CatalogResource.EXTENSION, DOWNLOAD_REQUESTED, Map.of("download", download.getId().toString()));
        return Response.accepted(view(download, kind)).build();
    }

    /** A download the person asked for; 404 for any other. */
    @GET
    @Path("{id}")
    @Transactional
    public DownloadView get(@PathParam("id") UUID id) {
        Download download = downloads.findById(id)
                .filter(found -> found.getRequestedBy().equals(person()))
                .orElseThrow(CatalogResource::notFound);
        List<Archive.Entry> entries = Archive.read(mapper, download.getEntries());
        boolean single = entries.size() == 1 && entries.getFirst().file() != null;
        return view(download, single ? "file" : "archive");
    }

    /**
     * The entries with the links that the kernel makes for the person: only when they hold a level on
     * every file themselves, the owner, a person the file is shared with, an administrator. Empty
     * otherwise, for a job to make them.
     */
    private Optional<List<Archive.Entry>> signAsPerson(List<Archive.Entry> entries, int validity) {
        List<Archive.Entry> signed = new ArrayList<>();
        for (Archive.Entry entry : entries) {
            if (entry.file() == null) {
                signed.add(entry);
                continue;
            }
            if (sharing.level(Tree.ref(Item.FILE, entry.item())).isEmpty()) {
                return Optional.empty();
            }
            try {
                SignedLink link = files.link(CatalogResource.EXTENSION, entry.file(), Duration.ofSeconds(validity));
                signed.add(entry.signed(link.path()));
            } catch (NoSuchElementException e) {
                return Optional.empty();
            }
        }
        return Optional.of(signed);
    }

    private DownloadView view(Download download, String kind) {
        List<EntryView> entries = Download.READY.equals(download.getStatus())
                ? views(Archive.read(mapper, download.getEntries()))
                : List.of();
        return new DownloadView(
                download.getId(), kind, download.getName(), download.getStatus(), download.getExpires(), entries);
    }

    private static List<EntryView> views(List<Archive.Entry> entries) {
        return entries.stream().map(entry -> new EntryView(entry.path(), entry.url())).toList();
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

    private String person() {
        return identity.getPrincipal().getName();
    }
}
