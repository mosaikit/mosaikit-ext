// SPDX-FileCopyrightText: 2026 Massimo Antonini
// SPDX-License-Identifier: MPL-2.0
import { Bench, freePort, packagesIn } from '@mosaikit/testing';

/**
 * Starts Mosaikit with the package of this extension (mvn package) on an embedded PostgreSQL, with an
 * organization and two people, and stops it after the tests. Next to it, the extensions of the tests
 * (tests/fixtures): the connectors built by mvn package, a sample database and a connector whose
 * declaration lacks a field (EXT-010), a sample stream and API (EXT-019), and an extension that
 * contributes uses of the pieces of connections, installed as a directory (EXT-019); no other extension
 * of the repository is installed (ADR-0001). The installation is downloaded once;
 * MOSAIKIT_INSTALLATION chooses another one, such as a build of Mosaikit.
 */
export default async function globalSetup(): Promise<() => Promise<void>> {
  const own = packagesIn('target');
  const connectors = packagesIn(
    'tests/fixtures/sample/target',
    'tests/fixtures/broken/target',
    'tests/fixtures/sources/target',
  );
  if (own.length === 0 || connectors.length < 3) {
    throw new Error('Build the extension and the connectors of the tests first: mvn package');
  }
  const bench = await Bench.start({
    work: '.mosaikit-bench',
    extensions: [...own, ...connectors, 'tests/fixtures/consumer'],
    // The package is not signed by a publisher in the tests: its frontend runs like a verified one.
    settings: { 'mosaikit.extensions.unverified-frontends': 'module' },
    // The tests remove a connector and install it again, restarting the installation.
    controlPort: await freePort(),
  });
  bench.publish();
  return () => bench.stop();
}
