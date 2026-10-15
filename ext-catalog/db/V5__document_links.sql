-- SPDX-FileCopyrightText: 2026 Massimo Antonini
-- SPDX-License-Identifier: MPL-2.0
--
-- Documents linked to resources of other extensions (EXT-006). A link joins a file of the catalog to a
-- resource that another extension registered with the kernel (MK-054), kept as the reference by which
-- it registered it: its extension, type and id. The link goes with the file; it stays while the
-- extension of the resource is absent or the resource is gone, and the kernel resolves it for each
-- person (MK-135).
--
-- Files are also found by the search of the platform (MK-040) by the words of their name: the index
-- is on the same expression as the query of the catalog.

create table document_link (
    id              uuid primary key,
    organization_id uuid not null default mk_kernel.current_organization(),
    item_id         uuid not null references item (id) on delete cascade,
    extension       varchar(255) not null,
    type            varchar(64) not null,
    resource_id     varchar(255) not null,
    created_by      uuid,
    created_at      timestamp with time zone not null
);

create unique index document_link_ux on document_link (organization_id, item_id, extension, type, resource_id);
create index document_link_resource_ix on document_link (organization_id, extension, type, resource_id);

alter table document_link enable row level security;

create policy document_link_organization on document_link
    using (organization_id = mk_kernel.current_organization())
    with check (organization_id = mk_kernel.current_organization());

create index item_name_search_ix on item
    using gin (to_tsvector('simple', regexp_replace(name, '[[:punct:][:space:]]+', ' ', 'g')));
