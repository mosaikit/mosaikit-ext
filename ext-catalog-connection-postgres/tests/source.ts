// SPDX-FileCopyrightText: 2026 Massimo Antonini
// SPDX-License-Identifier: MPL-2.0
import pg from 'pg';

/** The database the tests connect to, started by tests/global-setup.ts on an embedded PostgreSQL. */
export interface Source {
  readonly host: string;
  readonly port: number;
  readonly database: string;
  /** The user of the connections, and its password, which the tests keep as a credential. */
  readonly user: string;
  readonly password: string;
  /** The superuser of the server, and the database of the installation of Mosaikit. */
  readonly admin: { readonly user: string; readonly password: string; readonly database: string };
}

export const SOURCE_DATABASE = 'shop';

/** The variable through which the global setup gives the source to the tests. */
export const SOURCE_ENVIRONMENT = 'EXT_POSTGRES_SOURCE';

export function source(): Source {
  const value = process.env[SOURCE_ENVIRONMENT];
  if (!value) {
    throw new Error(`${SOURCE_ENVIRONMENT} is not set: the tests run after tests/global-setup.ts`);
  }
  return JSON.parse(value) as Source;
}

/** A query as the superuser, on the database of the source or another one of the server. */
export async function asAdmin<T extends pg.QueryResultRow>(database: string, text: string, values: unknown[] = []): Promise<T[]> {
  const { host, port, admin } = source();
  const client = new pg.Client({ host, port, user: admin.user, password: admin.password, database });
  await client.connect();
  try {
    return (await client.query<T>(text, values)).rows;
  } finally {
    await client.end();
  }
}
