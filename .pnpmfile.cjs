// TypeScript 7 (tsgo) ships without a programmatic API (it lands in 7.1), so
// typescript-eslint cannot run against it. Microsoft publishes
// @typescript/typescript6 for exactly this: tools that still need the TS 6
// compiler API, side-by-side with typescript@7.
//
// This hook rewrites the `typescript` peer dependency of the
// typescript-eslint packages to a scoped TS 6 install. The project's own
// `typescript` stays at 7.x for tsc/tsdown.
//
// Remove this file once typescript-eslint supports TS 7.1's API.
function readPackage(pkg) {
  const isTsEslint =
    pkg.name === 'typescript-eslint' ||
    (pkg.name && pkg.name.startsWith('@typescript-eslint/'));
  if (isTsEslint && pkg.peerDependencies && pkg.peerDependencies.typescript) {
    delete pkg.peerDependencies.typescript;
    pkg.dependencies = {
      ...pkg.dependencies,
      typescript: 'npm:@typescript/typescript6@^6.0.2',
    };
  }
  return pkg;
}

module.exports = { hooks: { readPackage } };
