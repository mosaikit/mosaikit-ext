// SPDX-FileCopyrightText: 2026 Massimo Antonini
// SPDX-License-Identifier: MPL-2.0
import { createServer } from 'node:net';
import { Bench, BENCH_PEOPLE, packagesIn } from '@mosaikit/testing';

/**
 * Starts Mosaikit with the package of this extension (mvn package) on an embedded PostgreSQL, with an
 * organization and three people (the third outside the groups of the tests, EXT-006), and stops it
 * after the tests. Only this folder is installed, with the fixtures of its tests: one adds a kind of files
 * through its contract (EXT-105, tests/fixtures/text-notes), one links documents to its records (EXT-006,
 * tests/fixtures/records): the extension is tested alone (ADR-0001). The installation is downloaded
 * once; MOSAIKIT_INSTALLATION chooses another one, such as a build of Mosaikit. The tests restart the
 * installation through the control port, to remove and install again the fixture.
 */
export default async function globalSetup(): Promise<() => Promise<void>> {
  const own = packagesIn('target');
  if (own.length === 0) {
    throw new Error('Build the extension first: mvn package');
  }
  const fixtures = ['text-notes', 'records'].flatMap((fixture) => {
    const built = packagesIn(`tests/fixtures/${fixture}/target`);
    if (built.length === 0) {
      throw new Error(`Build the fixture of the tests first: mvn -f tests/fixtures/${fixture} package`);
    }
    return built;
  });
  const bench = await Bench.start({
    work: '.mosaikit-bench',
    extensions: [...own, ...fixtures],
    controlPort: await freePort(),
    people: [...BENCH_PEOPLE, { user: 'outsider@example.test', password: 'Bench-outsider-2026', name: 'Outsider' }],
    // The package is not signed by a publisher in the tests: its frontend runs like a verified one.
    settings: { 'mosaikit.extensions.unverified-frontends': 'module' },
  });
  bench.publish();
  return () => bench.stop();
}

/** A port nobody listens on, for the control endpoint of the bench. */
function freePort(): Promise<number> {
  return new Promise((resolve, reject) => {
    const server = createServer();
    server.once('error', reject);
    server.listen(0, () => {
      const address = server.address();
      const port = typeof address === 'object' && address ? address.port : 0;
      server.close(() => resolve(port));
    });
  });
}
