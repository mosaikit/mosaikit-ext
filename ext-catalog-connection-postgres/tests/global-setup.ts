// SPDX-FileCopyrightText: 2026 Massimo Antonini
// SPDX-License-Identifier: MPL-2.0
import { randomBytes } from 'node:crypto';
import { Bench, freePort, packagesIn, startPostgres } from '@mosaikit/testing';
import pg from 'pg';
import { SOURCE_DATABASE, SOURCE_ENVIRONMENT, type Source } from './source.js';

/**
 * Starts an embedded PostgreSQL, with the database of the installation and a database to connect to
 * (shop), then Mosaikit on it with the package of this connector (mvn package) and the package of the
 * connection framework it requires (target/required, copied by mvn package), with an organization and
 * two people; stops them after the tests. No Docker: the PostgreSQL of the bench, from npm.
 *
 * The database shop has schemas with tables, views, a materialized view, a column of a type named
 * geometry (as PostGIS names it), an empty schema and a schema its user may not read; its user reader
 * has a random password, which the tests keep as the credential of their connections.
 */
export default async function globalSetup(): Promise<() => Promise<void>> {
  const own = packagesIn('target');
  const required = packagesIn('target/required');
  if (own.length === 0 || required.length === 0) {
    throw new Error('Build the connector first: mvn package (it copies the connection framework into target/required)');
  }
  const server = await startPostgres({ directory: '.source-db', persistent: false });
  const password = randomBytes(12).toString('hex');
  try {
    await seed(server.port, password);
  } catch (error) {
    await server.stop();
    throw error;
  }
  const source: Source = {
    host: '127.0.0.1',
    port: server.port,
    database: SOURCE_DATABASE,
    user: 'reader',
    password,
    admin: { user: server.user, password: server.password, database: 'mosaikit' },
  };
  process.env[SOURCE_ENVIRONMENT] = JSON.stringify(source);
  const bench = await Bench.start({
    work: '.mosaikit-bench',
    extensions: [...own, ...required],
    // The installation keeps its own database on the same server: the tests look into it for the credential.
    database: { url: server.url, username: server.user, password: server.password },
    // The package is not signed by a publisher in the tests: its frontend runs like a verified one.
    settings: { 'mosaikit.extensions.unverified-frontends': 'module' },
    controlPort: await freePort(),
  });
  bench.publish();
  return async () => {
    await bench.stop();
    await server.stop();
  };
}

async function seed(port: number, password: string): Promise<void> {
  const admin = new pg.Client({ host: '127.0.0.1', port, user: 'mosaikit', password: 'mosaikit', database: 'mosaikit' });
  await admin.connect();
  try {
    await admin.query(`create database ${SOURCE_DATABASE}`);
    await admin.query(`create role reader login password '${password}'`);
  } finally {
    await admin.end();
  }
  const shop = new pg.Client({ host: '127.0.0.1', port, user: 'mosaikit', password: 'mosaikit', database: SOURCE_DATABASE });
  await shop.connect();
  try {
    await shop.query(`
      create schema sales;
      create table sales.customers (id integer primary key, name text not null);
      create table sales.orders (id integer primary key, customer integer references sales.customers, total numeric(10,2), placed date);
      insert into sales.customers values (1, 'Acme'), (2, 'Green');
      insert into sales.orders values (1, 1, 50.00, '2026-01-10'), (2, 1, 150.00, '2026-02-11'), (3, 2, 75.50, '2026-03-12'),
        (4, 2, 220.00, '2026-04-13'), (5, 1, 10.00, '2026-05-14');
      create view sales.big_orders as select * from sales.orders where total > 100;
      create materialized view sales.totals as select customer, sum(total) as total from sales.orders group by customer;
      -- A type named as the one of PostGIS, which the embedded server does not have.
      create type public.geometry as (x double precision, y double precision);
      create schema places;
      create table places.sites (name text, location public.geometry);
      create schema staging;
      create schema secret;
      create table secret.salaries (person text, amount numeric);
      grant usage on schema sales, places, staging to reader;
      grant select on sales.customers, sales.orders, sales.big_orders, sales.totals, places.sites to reader;
      -- Granted, so that only the read-only transaction of the queries stops a change.
      grant insert, update, delete on sales.orders to reader;
    `);
  } finally {
    await shop.end();
  }
}
