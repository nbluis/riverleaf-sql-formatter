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

## Formatter

- [x] **Lacunas de cobertura PostgreSQL (round 3)** — CONCLUÍDO (2026-07-17). Operadores multi-char
      (maximal-munch), keywords que não ancoram (`IS DISTINCT FROM`, `FOR UPDATE`, `WITH ORDINALITY`,
      `ON CONFLICT`), `MERGE`, e goldens de todas as features que já funcionavam (set-ops decididos
      no rio). Suíte 181 → 341 casos. Detalhes no histórico do git (o plano foi removido do `_work/`).
