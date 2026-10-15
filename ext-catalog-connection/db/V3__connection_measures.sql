-- SPDX-FileCopyrightText: 2026 Massimo Antonini
-- SPDX-License-Identifier: MPL-2.0
--
-- What the card of a connection measures (EXT-014): when the connection was last changed, how many
-- pieces its source holds at the top level, as last listed, and the state of the source at the last
-- test or listing, with its time. Nothing is read from the source to fill them: they are what the
-- framework saw the last time someone tested or browsed the connection.

alter table connection add column updated_at timestamp with time zone;
update connection set updated_at = created_at;
alter table connection alter column updated_at set not null;

-- The pieces at the top level of the source; null until it is listed.
alter table connection add column pieces integer;
-- Whether the source held more pieces than the first page that was counted.
alter table connection add column more_pieces boolean not null default false;
-- reachable or unreachable; null until the source is tested or listed.
alter table connection add column source_state varchar(32);
alter table connection add column checked_at timestamp with time zone;
