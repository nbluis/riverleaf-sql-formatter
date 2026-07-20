# TODO — o que ainda falta

> Lista de trabalho (PT). Código/doc/README continuam em inglês (regra de ouro).
> Atualizado em 2026-07-17.

## README / divulgação

- [ ] **Gravar o GIF de demo** (~3-5s de format-on-save alinhando uma query),
      salvar em `assets/demo.gif`, apagar o comentário e descomentar o bloco no README
      (logo abaixo do exemplo do topo).
- [ ] **Publicar no VS Code Marketplace.** Depois de publicar:
  - trocar o badge laranja "under construction" por badges reais de versão + installs;
  - ativar no README a instalação de um clique / `code --install-extension nbluis.riverleaf-sql-formatter`.

## Empacotamento (pré-publicação)

- [ ] Adicionar `repository` ao `package.json` (hoje o `vsce package` roda com
      `--allow-missing-repository`) e conferir `LICENSE` + `icon` para a listagem do Marketplace.

## Distribuição

- [ ] **Biblioteca npm + CLI (monorepo)** — ver `_work/monorepo-lib-cli-plan.md`. Reestruturar em
      workspaces (`packages/core` = lib + CLI publicável, `packages/vscode` = extensão), sem mudar a
      lógica de formatação. Esforço estimado ~1 dia; Fase 0 tem decisões a travar (nomes, bin, dual
      ESM/CJS, tsup, versionamento, flags do CLI).
