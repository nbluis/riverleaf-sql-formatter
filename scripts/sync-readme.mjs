// Copies the canonical root README into each published package so the npm page
// and the VS Code Marketplace listing show the same doc. The copies are build
// artifacts (git-ignored) — always edit the root README.md, never these.
//
// Runs automatically from the publish lifecycles: `vscode:prepublish` (before
// `vsce package`/`publish`) and the core's `prepublishOnly` (before `npm
// publish`), plus the root `npm run build`.
import { copyFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const targets = ['packages/core', 'packages/vscode'];

for (const pkg of targets) {
  copyFileSync(join(root, 'README.md'), join(root, pkg, 'README.md'));
}
console.log(`synced README.md → ${targets.join(', ')}`);
