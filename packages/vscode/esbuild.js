// Extension bundle. The formatter core (packages/core/src) is pure TS and is
// bundled in here from source; it is also tested directly by vitest in the core
// package without going through this build.
const esbuild = require('esbuild');
const path = require('node:path');

// Resolve paths relative to this file so the build works no matter the cwd
// (root `npm run build:vscode` runs it as `node packages/vscode/esbuild.js`).
const here = __dirname;
const watch = process.argv.includes('--watch');

/** @type {import('esbuild').BuildOptions} */
const options = {
  entryPoints: [path.join(here, 'src/extension.ts')],
  bundle: true,
  outfile: path.join(here, 'out/extension.js'),
  external: ['vscode'],
  // Resolve the `riverleaf-sql-formatter` import to the core's public entry
  // (source), so the extension bundles the in-repo core directly — no dependency
  // on a prior `build:core`. Mirrors the tsconfig `paths` mapping.
  alias: {
    'riverleaf-sql-formatter': path.join(here, '../core/src/index.ts'),
  },
  format: 'cjs',
  platform: 'node',
  target: 'node16',
  sourcemap: true,
  logLevel: 'info',
};

async function main() {
  if (watch) {
    const ctx = await esbuild.context(options);
    await ctx.watch();
  } else {
    await esbuild.build(options);
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
