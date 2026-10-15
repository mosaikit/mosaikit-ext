-- SPDX-FileCopyrightText: 2026 Massimo Antonini
-- SPDX-License-Identifier: MPL-2.0
--
-- Schema ext_catalog_connection, owned by the extension and migrated by the kernel at start (EXT-010).
--
-- The connections of an organization to its data sources. Each one names the type of its connector
-- and the extension that declared it, so that it stays listed, as unavailable, when that extension is
-- removed or turned off, and works again when it comes back. The values of the connection form are
-- kept here; the credential is in the secrets service of the kernel (MK-062), here only its name.

create table connection (
    id              uuid primary key,
    organization_id uuid not null default mk_kernel.current_organization(),
    name            varchar(200) not null,
    type            varchar(64) not null,
    connector       varchar(255) not null,
    -- The values of the connection form, a JSON object.
    settings        text not null default '{}',
    credential      varchar(255),
    created_at      timestamp with time zone not null
);

create unique index connection_name_ux on connection (organization_id, lower(name));

alter table connection enable row level security;

create policy connection_organization on connection
    using (organization_id = mk_kernel.current_organization())
    with check (organization_id = mk_kernel.current_organization());
