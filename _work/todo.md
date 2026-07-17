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

## Contribuições

- [x] **Seção "Contributing" no README** — fluxo test-first, links pros templates de issue,
      e as house rules (tudo em inglês + dicionário de astronomia).
- [x] **Padrões para abrir issues** — `.github/ISSUE_TEMPLATE/` com dois issue forms:
      `formatting.yml` (input/expected obrigatórios) e `other.yml`, + `config.yml`
      (`blank_issues_enabled: false`).
- [x] **Padrões para abrir PRs** — `.github/PULL_REQUEST_TEMPLATE.md` com checklist do projeto.
      (Optei por não criar um `CONTRIBUTING.md` separado — a seção no README cobre.)

## Empacotamento (pré-publicação)

- [ ] Adicionar `repository` ao `package.json` (hoje o `vsce package` roda com
      `--allow-missing-repository`) e conferir `LICENSE` + `icon` para a listagem do Marketplace.

## Formatter

- [ ] **Lacunas de cobertura PostgreSQL (round 3)** — ver `_work/postgres-coverage-gaps-plan.md`
      (operadores multi-caractere fatiados pelo tokenizer, keywords cortadas como âncoras,
      ~16 features sem teste).

## Aberto por design (não urgente)

- [x] **Subquery e `case` embrulhados em função** — resolvido (D3, 2026-07-17; commits
      `2648684`, `d4ba515`). Agora expandem em itens select/group/order, `where`/`having` e
      `join` ON; o `)` fica sob a coluna do item/operando e o resto da expressão anda na linha
      de fecho. Comentário dentro de uma subquery embrulhada passou a refluir junto (ela expande).
- [ ] (by design, não é para "resolver") Comentário de linha **no meio de uma expressão** —
      dentro de um único item de lista ou condição booleana, fora de fronteira e fora de uma
      subquery que expande — força passthrough do statement, para uma junção de linhas nunca
      comentar código. Coberto pela rede `test/comment-invariants.test.ts` (nunca comenta código,
      nunca perde comentário, idempotente). Documentado em "Known limitations".
