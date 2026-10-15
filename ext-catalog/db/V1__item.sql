-- SPDX-FileCopyrightText: 2026 Massimo Antonini
-- SPDX-License-Identifier: MPL-2.0
--
-- Schema ext_catalog, owned by the extension and migrated by the kernel at start (EXT-001).
--
-- One table for the tree of an organization: folders and files are items, each in at most one
-- parent folder (none at the root). Each item is also a resource registered with the kernel (MK-054),
-- which keeps its owner and its grants; the content of a file goes to the file service of the kernel
-- (MK-041), here only its identifier, size and type.

create table item (
    id              uuid primary key,
    organization_id uuid not null default mk_kernel.current_organization(),
    parent_id       uuid references item (id),
    kind            varchar(6) not null check (kind in ('folder', 'file')),
    name            varchar(255) not null,
    -- Files only: the stored content (MK-041), its size in bytes and its media type.
    file_id         uuid,
    size            bigint check (size >= 0),
    content_type    varchar(255),
    created_at      timestamp with time zone not null,
    changed_at      timestamp with time zone not null,
    check ((kind = 'folder') = (size is null))
);

create index item_parent_ix on item (organization_id, parent_id);

-- Two items of a folder never have the same name, in any case. At the root, where each person sees
-- only what they read, the extension checks the names they see.
create unique index item_name_ux on item (organization_id, parent_id, lower(name)) where parent_id is not null;

alter table item enable row level security;

create policy item_organization on item
    using (organization_id = mk_kernel.current_organization())
    with check (organization_id = mk_kernel.current_organization());
