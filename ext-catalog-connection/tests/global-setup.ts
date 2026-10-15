// SPDX-FileCopyrightText: 2026 Massimo Antonini
// SPDX-License-Identifier: MPL-2.0
import { Bench, packagesIn } from '@mosaikit/testing';

/**
 * Starts Mosaikit with the package of this extension (mvn package) on an embedded PostgreSQL, with an
 * organization and two people, and stops it after the tests. Only this folder is installed: the
 * extension is tested alone (ADR-0001). The installation is downloaded once; MOSAIKIT_INSTALLATION
 * chooses another one, such as a build of Mosaikit.
 */
export default async function globalSetup(): Promise<() => Promise<void>> {
  const own = packagesIn('target');
  if (own.length === 0) {
    throw new Error('Build the extension first: mvn package');
  }
  const bench = await Bench.start({
    work: '.mosaikit-bench',
    extensions: [...own],
    // The package is not signed by a publisher in the tests: its frontend runs like a verified one.
    settings: { 'mosaikit.extensions.unverified-frontends': 'module' },
  });
  bench.publish();
  return () => bench.stop();
}
