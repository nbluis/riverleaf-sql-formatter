---
name: build-install-vsix
description: Build, package, and install the Riverleaf SQL Formatter VS Code extension locally. Use after changing runtime code in packages/core/src or packages/vscode/src to test the extension in the real editor, or whenever a fresh .vsix should replace the installed build.
---

# build-install-vsix

Wraps the repeated local-deploy dance: build → package → uninstall the previous build (any
publisher id) → install the fresh `.vsix` with `--force`.

## Run

From the project root:

```bash
bash .claude/skills/build-install-vsix/deploy.sh
```

Then reload the VS Code window (`Developer: Reload Window`) so the new build is active.

## Notes

- Uses `vsce package --allow-missing-repository --skip-license` (no repository/LICENSE required
  yet).
- Uninstalls **any** installed `*.riverleaf-sql-formatter` first, so publisher/name changes don't
  leave duplicates fighting to format `.sql`.
- Only needed after **runtime** changes (`packages/core/src/formatter/*`,
  `packages/vscode/src/extension.ts`). Test-only, YAML, or README changes don't require re-packaging.
- Verify a change actually works end-to-end (open a `.sql`, run Format Document) — not just tests.
