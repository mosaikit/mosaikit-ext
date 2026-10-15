-- SPDX-FileCopyrightText: 2026 Massimo Antonini
-- SPDX-License-Identifier: MPL-2.0
--
-- Kinds of files added by other extensions (EXT-105). A file keeps the kind that recognized it,
-- `<extension>/<name>` of an implementation of the contract file-kind of the catalog (MK-134), and the
-- state that kind recorded on it. The kind stays when its extension goes: the catalog then shows the
-- file as a plain file, and as a file of its kind again when the extension comes back.

alter table item add column file_kind varchar(320);
alter table item add column kind_state varchar(32);
alter table item add column kind_state_detail varchar(500);

alter table item add constraint item_file_kind_ck check (file_kind is null or kind = 'file');
alter table item add constraint item_kind_state_ck check (kind_state is null or file_kind is not null);

create index item_file_kind_ix on item (organization_id, file_kind) where file_kind is not null;
