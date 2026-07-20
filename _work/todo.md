# TODO — o que ainda falta

> Lista de trabalho (PT). Código/doc/README continuam em inglês (regra de ouro).
> Atualizado em 2026-07-20.

## README / divulgação

- [ ] **Gravar o GIF de demo** (~3-5s de format-on-save alinhando uma query),
      salvar em `assets/demo.gif`, apagar o comentário e descomentar o bloco no
      `packages/vscode/README.md` (logo abaixo do exemplo do topo).
- [ ] **Publicar no VS Code Marketplace** (`cd packages/vscode && vsce publish`, precisa de PAT).
      Depois de publicar:
  - trocar o badge laranja "under construction" por badges reais de versão + installs;
  - ativar no README a instalação de um clique / `code --install-extension nbluis.riverleaf-sql-formatter`.
- [ ] **Publicar a lib no npm** (`npm login` + `npm publish -w riverleaf-sql-formatter`).
      `npm publish --dry-run` já passa limpo (tarball só com `dist/` + README + LICENSE).

## Distribuição — biblioteca npm + CLI (monorepo) ✅

- [x] Reestruturado em workspaces (`packages/core` = lib + CLI publicável, `packages/vscode` =
      extensão), sem mudar a lógica de formatação — ver `_work/monorepo-lib-cli-plan.md` (Fases 0–5
      feitas). Core ESM-only, zero-dep em runtime, bin `riverleaf`; extensão consome o core.
- [x] `repository` (com `directory`) + `LICENSE` + `icon` presentes em cada pacote para as listagens.
- [ ] Verificar a extensão no editor real após a reestruturação (rodar `build-install-vsix`,
      Format Document num `.sql`).
- [ ] (opcional) **Fase 6 — CI**: GitHub Actions rodando test+lint+typecheck+build em PR e publicando
      em tag/release (secrets `NPM_TOKEN` / `VSCE_PAT`).
