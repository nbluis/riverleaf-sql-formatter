# TODO — o que ainda falta

> Lista de trabalho (PT). Código/doc/README continuam em inglês (regra de ouro).
> Atualizado em 2026-07-16.

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

- [ ] Subquery e `case` embrulhados em função ainda ficam inline; comentário mid-token /
      dentro de subquery não-expandida cai em passthrough. Documentado em "Known limitations".
