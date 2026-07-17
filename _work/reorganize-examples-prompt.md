# Prompt — reorganizar os exemplos YAML em vários arquivos por assunto

> Cole o bloco a partir de "TAREFA" numa nova sessão do Claude Code, no repo
> `riverleaf-sql-formatter`. Objetivo: quebrar a suíte de casos (hoje concentrada em
> `test/cases/postgres.yaml` + alguns arquivos por feature) numa taxonomia limpa **por assunto**,
> sem mudar nenhum caso.

## Contexto / porquê

O runner (`test/cases.test.ts`) carrega **todo** `*.yaml` de `test/cases/` (leitura plana, não
recursiva), então dividir/mover casos entre arquivos é **grátis** (zero mudança de código). Hoje
`postgres.yaml` é um catch-all com assuntos misturados (alinhamento, listas, where, joins,
comentários) e `subquery.yaml` mistura subqueries com CTEs. A proposta é um arquivo por assunto, com
um comentário de escopo no topo de cada um.

## Taxonomia alvo (flat, em `test/cases/`)

| Arquivo            | Escopo |
| ------------------ | ------ |
| `alignment.yaml`   | O rio: alinhamento básico de cláusulas, casing de keyword, keyword multi-palavra, normalização de indent (D2), múltiplos statements separados por linha em branco, espaçamento antes de `(` (chamada de função). Inclui o exemplo "showcase" que combina join + where + group. |
| `lists.yaml`       | Quebra de lista por contagem: select multi-coluna quebra / 1 coluna inline; `from` com vírgula; `group by` / `order by`; combinação group by + having + order by. |
| `where.yaml`       | `where`/`having`: 1 condição inline, ≥2 quebram (RIVER), conectores, `between` protegido, grupo `( )` sempre expande (BLOCK), grupos aninhados. |
| `joins.yaml`       | Joins: ON única inline, ON multi-condição quebra (rio secundário), `cross`/`using`/`natural` sem ON em uma linha. |
| `comments.yaml`    | Toda a colocação de comentários: leading / trailing / inline (lista e where) / standalone (entre cláusulas, itens, condições) / dentro de grupo (BLOCK) / antes da 1ª condição do where / em join ON / após `;` / leading por statement / passthrough (mid-token e subquery function-wrapped). |
| `case.yaml`        | `case ... end` (lista, where/having, join ON, aninhado, `when ... then` que cresce). **Já existe** — manter. |
| `dml.yaml`         | `insert` / `update` / `delete` (+ set/values, colunas do insert, tuplas). **Já existe** — manter. |
| `subquery.yaml`    | Subqueries (não-CTE): `from (…)`, where em qualquer posição, join ON, join-table, subquery escalar no select, function-wrapped (inline), e os comentários **dentro** dessas subqueries. **Existe** — remover só os casos de CTE. |
| `cte.yaml`         | **Novo.** Todos os casos de `with`: CTE única, múltiplas CTEs, três CTEs, CTEs com `where` interno, comentário dentro de uma CTE. Movidos de `subquery.yaml`. |
| `lateral.yaml`     | `LATERAL` derived tables. **Já existe** — manter. |

No fim, `postgres.yaml` deixa de existir (seu conteúdo foi distribuído). Nome por *feature*, não por
dialeto: se no futuro surgir um quirk específico de dialeto, crie `dialect_<nome>.yaml` (ou, se quiser
subpastas, será preciso um ajuste único no runner para ler recursivamente — hoje ele é flat).

## Mapa atual → alvo (por assunto; robusto a renomeações do dicionário)

- **`postgres.yaml`** se dissolve:
  - alinhamento básico, casing, multi-statement, normalização D2, "no space before ( ", e o exemplo
    showcase (join+where+group) → `alignment.yaml`.
  - select multi/1-coluna, `from` com vírgula, group by/having/order by → `lists.yaml`.
  - grupo OR expande, 1 condição inline, grupo único expande → `where.yaml`.
  - join 1-ON inline, join multi-ON quebra → `joins.yaml`.
  - todos os casos cujo foco é **comentário** → `comments.yaml`.
- **`subquery.yaml`**: casos de `with` (CTE única/múltipla/três/where interno/comentário em CTE) →
  `cte.yaml`; o resto fica.

## Regras

1. **Mover verbatim.** Não altere `input`, `expected`, `description`, `options` nem `idempotent` de
   nenhum caso — é só realocação. A contagem total de casos tem de ficar **idêntica**.
2. Cada arquivo novo começa com um comentário `#` de 1–2 linhas descrevendo seu escopo (siga o
   estilo dos cabeçalhos atuais de `dml.yaml`/`lateral.yaml`).
3. Ordene os casos dentro de cada arquivo do mais simples ao mais complexo, quando fizer sentido.
4. Não toque em `src/**` nem no runner (a menos que opte por subpastas — aí é um ajuste único e
   isolado no `readdirSync` para recursivo; documente se fizer).

## Verificação

- Antes: conte os casos — `grep -rc '^- description:' test/cases | awk -F: '{s+=$2} END{print s}'`.
- Depois: mesma contagem; `npx tsc --noEmit` && `npm test` (todos verdes + idempotência) &&
  `npm run lint`.
- Garanta que `postgres.yaml` não existe mais e que nenhum caso foi perdido/duplicado (a contagem
  cobre isso).

## Docs a atualizar

- `.claude/rules/testing.md` — a seção "Structure" cita "um arquivo por família (postgres.yaml,
  mysql.yaml, ...)"; troque pela taxonomia por assunto acima.
- `CLAUDE.md` — a seção "Tests" (lista de arquivos), se citar os nomes.

## Processo

- `git checkout -b reorg-example-yamls` → fazer os movimentos → verde → commit com rodapé
  `Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>` → `git checkout main &&
  git merge --ff-only reorg-example-yamls` → push:
  `git -c credential.helper='!gh auth git-credential' push https://github.com/nbluis/riverleaf-sql-formatter.git main`
- **Sem** re-package do vsix (só testes/docs).

## Ordem em relação à reescrita pelo dicionário

Independente. Se as duas tarefas forem feitas, sugiro **reorganizar primeiro** (arquivos no layout
final) e depois rodar `_work/rewrite-examples-prompt.md` sobre eles — mas a ordem inversa também
funciona, pois o mapa acima é por assunto, não por nome.
