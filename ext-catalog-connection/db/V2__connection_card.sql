-- SPDX-FileCopyrightText: 2026 Massimo Antonini
-- SPDX-License-Identifier: MPL-2.0
--
-- What the card of a connection shows besides its name (EXT-011, EXT-015): a description, the address
-- of the source as its connector tells it from the settings, shown when there is no description, and
-- the thumbnail a person uploaded, a file of the file service of the kernel attached to the
-- connection. The owner is not here: each connection is a resource of the kernel (MK-054), which
-- keeps its owner and its grants.

alter table connection add column description varchar(1000);
alter table connection add column address varchar(500);
alter table connection add column thumbnail uuid;
