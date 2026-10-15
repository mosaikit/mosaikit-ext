-- SPDX-FileCopyrightText: 2026 Massimo Antonini
-- SPDX-License-Identifier: MPL-2.0
--
-- Downloads and removals of files (EXT-002, EXT-004). The content of a file is in the file service of
-- the kernel (MK-041) and goes out only through its signed, expiring links (MK-093).

-- A download asked by a person: the files it holds, each with its path in the archive (or its name
-- alone for one file), and once ready their signed links. The kernel makes a link for a person only to
-- a file on which they hold a level themselves (MK-055); a file the person reaches through a folder
-- above it, as the catalog allows, is linked by the extension without a person, after its own check,
-- in a job of the organization (MK-085): the download waits for it, then is ready.
create table download (
    id              uuid primary key,
    organization_id uuid not null default mk_kernel.current_organization(),
    -- The person who asked for it, the only one who reads it.
    requested_by    varchar(255) not null,
    -- The name the browser saves: the file, or the archive.
    name            varchar(300) not null,
    status          varchar(7) not null check (status in ('pending', 'ready', 'failed')),
    -- How long its links are valid, in seconds.
    validity        integer not null check (validity > 0),
    -- The entries as JSON: [{ "path", "file", "url" }], a folder with no file and no url.
    entries         text not null,
    expires         timestamp with time zone,
    created_at      timestamp with time zone not null
);

create index download_created_ix on download (organization_id, created_at);

alter table download enable row level security;

create policy download_organization on download
    using (organization_id = mk_kernel.current_organization())
    with check (organization_id = mk_kernel.current_organization());

-- The content of files deleted from the catalog that the person could not delete in the file service
-- themselves, because they reach the file only through a folder above it: the extension deletes it
-- without a person, in a job of the organization, then removes the resource of the file. Until then the
-- resource stays registered, so that the content never becomes a file of the whole organization.
create table pending_removal (
    item_id         uuid primary key,
    organization_id uuid not null default mk_kernel.current_organization(),
    file_id         uuid not null
);

alter table pending_removal enable row level security;

create policy pending_removal_organization on pending_removal
    using (organization_id = mk_kernel.current_organization())
    with check (organization_id = mk_kernel.current_organization());
