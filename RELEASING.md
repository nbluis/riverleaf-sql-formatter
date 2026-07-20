# Releasing

How to cut a release of both artifacts this repo ships:

- **npm library + CLI** — `riverleaf-sql-formatter` (`packages/core`).
- **VS Code extension** — `nbluis.riverleaf-sql-formatter` (`packages/vscode`).

Their versions are kept **in sync** (same `X.Y.Z` on both). The **GitHub Release** is the changelog —
its notes are auto-generated from the merged PRs since the previous release tag.

> Assumes the npm package name and the Marketplace publisher are already registered to your accounts.

## One-time setup (authentication)

Do this once per machine.

```bash
# npm — log in as the account that owns `riverleaf-sql-formatter`
npm login
npm whoami                       # should print your npm username

# VS Code Marketplace — a Personal Access Token for publisher `nbluis`
#   Create a PAT at https://dev.azure.com  (scope: Marketplace → Manage).
npx @vscode/vsce login nbluis    # paste the PAT when prompted
#   …or export it for non-interactive publishing:  export VSCE_PAT=<token>

# GitHub CLI — for creating the release
gh auth login
```

## Release checklist

Run everything from the repo root. Pick the new version once and reuse it:

```bash
export VERSION=X.Y.Z             # e.g. 0.1.0 — no leading "v"
```

### 1. Start from a clean, green `main`

```bash
git checkout main
git pull
npm ci
npm run lint
npm run typecheck
npm test
npm run build
```

All four must pass. `npm run build` produces `packages/core/dist` and `packages/vscode/out`.

### 2. Bump the version (both packages + root, in sync)

```bash
npm version "$VERSION" --no-git-tag-version                             # root (private, cosmetic)
npm version "$VERSION" --no-git-tag-version -w riverleaf-sql-formatter  # core (lib + CLI)
npm version "$VERSION" --no-git-tag-version --prefix packages/vscode    # extension
npm install --package-lock-only                                         # sync package-lock.json
```

`--no-git-tag-version` stops npm from tagging/committing — we tag once, later, via the GitHub Release.

### 3. Land the bump on `main`

Open it as a small **release PR** so the bump is itself a merged PR (keeps history clean):

```bash
git switch -c release/v$VERSION
git commit -am "chore: release v$VERSION"
git push -u origin release/v$VERSION
gh pr create --fill --title "Release v$VERSION"
```

Merge the PR, then update local `main`:

```bash
git checkout main && git pull
```

### 4. Dry-run both publishes (inspect before shipping)

```bash
# npm — lists the exact tarball (should be: dist/ + README + LICENSE + package.json)
npm publish --dry-run -w riverleaf-sql-formatter

# extension — builds and lists the .vsix contents without uploading
( cd packages/vscode && npx @vscode/vsce package )
```

Confirm the versions in the output read `$VERSION` and nothing unexpected is included.

### 5. Publish to npm

```bash
npm publish -w riverleaf-sql-formatter --access public
```

The core's `prepublishOnly` re-runs typecheck + test + build before the upload, so a broken build
never ships. Verify:

```bash
npm view riverleaf-sql-formatter version    # should print $VERSION
```

### 6. Publish the VS Code extension

```bash
cd packages/vscode
npx @vscode/vsce publish --packagePath "riverleaf-sql-formatter-$VERSION.vsix"
cd ../..
```

(`vsce package` in step 4 created that `.vsix`; publishing the exact file you inspected avoids a
surprise rebuild. If you skipped step 4, plain `npx @vscode/vsce publish` packages and uploads in one
go.) If `VSCE_PAT` is exported, add `-p "$VSCE_PAT"` for non-interactive use.

### 7. Create the GitHub Release (tag + changelog)

This creates the `v$VERSION` tag on the merged bump commit and auto-generates notes from the PRs
merged since the last release:

```bash
gh release create "v$VERSION" \
  --title "v$VERSION" \
  --generate-notes \
  "packages/vscode/riverleaf-sql-formatter-$VERSION.vsix"
```

The trailing path attaches the `.vsix` as a downloadable asset. Review/edit the generated notes in the
GitHub UI if needed.

### 8. Post-release check

- `npx riverleaf@latest --version` prints `$VERSION` (npm is live).
- The Marketplace listing shows `$VERSION` (may take a few minutes to propagate).
- The GitHub Release page shows the notes and the attached `.vsix`.

## Notes & recovery

- **Versioning.** Patch (`X.Y.Z+1`) for fixes, minor (`X.Y+1.0`) for new formatting behavior/flags,
  major for breaking changes. While pre-1.0, breaking changes may ride a minor bump.
- **npm mistake.** You can `npm unpublish riverleaf-sql-formatter@$VERSION` only within 72h and only if
  nothing depends on it; otherwise `npm deprecate riverleaf-sql-formatter@$VERSION "message"` and
  release a fixed patch. Republishing the *same* version is not allowed.
- **Marketplace mistake.** `npx @vscode/vsce unpublish nbluis.riverleaf-sql-formatter` removes the
  whole extension (heavy-handed); prefer publishing a fixed patch version instead.
- **Failed publish mid-way.** The two publishes are independent. If npm succeeded but the extension
  failed (or vice-versa), fix the cause and re-run only the failed step — the version is already
  bumped and tagged.
