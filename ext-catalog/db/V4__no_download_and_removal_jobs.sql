-- SPDX-FileCopyrightText: 2026 Massimo Antonini
-- SPDX-License-Identifier: MPL-2.0
--
-- Downloads and deletes without jobs (EXT-002, EXT-004). Folders and files inherit the levels of their
-- folder in the kernel (MK-136), so the kernel makes the signed links of a download and deletes the
-- content of a file for a person who reaches the file through a folder above it, in the request: the
-- downloads and the removals that waited for a job of the organization are no longer kept.

drop table download;
drop table pending_removal;
