# Plano — resolver as Known Limitations restantes (round 2)

> Documento de trabalho, escrito em **2026-07-16** depois de concluir as fases 5–9
> (`main` em `08315c5`, 132 testes). Idioma de código/doc/testes: **inglês** (regra de ouro);
> este rascunho pode ficar em PT.
>
> **Estado das limitações verificado rodando o formatter** (não lendo os docs).
>
> ## ✅ Decisões travadas com o usuário (2026-07-16, via preview)
> - **A1/A2** — `)` alinha **sob o conector** (`and`/`or`/`on`-river); inner 1 nível a partir dele.
> - **A3** — `case` num `join` ON **expande** (como where/having).
> - **B1** — lista de colunas do `INSERT` quebra com **colunas sob a primeira** (estilo select list).
> - **B2** — tupla única larga de `values` **quebra**, valores sob o primeiro.
> - **C1/C2 (Fase 13)** — **fora de escopo** por ora (documentar como limitação conhecida).
> - **E (comentário mid-token)** — **não corrigir**; passthrough é o correto.
> - **D3** — **manter** `null → editor.rulers[0] → 80` (sem mudança).
>
> Ordem de execução: **10 → 11 → 12**. (13 fora; D3 sem ação.)

## Inventário das limitações (verificado 2026-07-16)

| # | Limitação | Hoje | Veredito |
|---|-----------|------|----------|
| A1 | subquery numa condição de `where`/`having` que **não** é a 1ª | inline | resolver |
| A2 | subquery dentro de um `join` ON | inline | resolver |
| A3 | `case` dentro de um `join` ON | inline | resolver (barato) |
| C1 | subquery embrulhada numa função (`coalesce((select …), 0)`) | inline | opcional (complexo) |
| C2 | `case` embrulhado numa função | inline | opcional (complexo) |
| B1 | lista de colunas do `INSERT` não quebra mesmo larga | 1 linha | resolver (precisa layout) |
| B2 | tupla única larga de `values` não quebra por dentro | 1 linha | resolver (precisa layout) |
| E | comentário no meio de um token/condição | passthrough | **não corrigir** (correto) |
| — | comentário dentro de subquery **não** expandida | passthrough | **grátis** ao resolver A1/A2/C |
| D3 | default de `maxLineLength` não fixado | `null→rulers→80` | decisão de config (rápida) |

Máquina reusável: `renderSubqueryBlock` / `findSubquery` / `renderInner` (subqueries),
`emitTerm` com flag (já faz isso p/ `case` via `expandCase`), `renderBoolClause` /
`renderRiverTail` (where/having), `renderOn` (join), `renderListClause` (`alwaysBreak`),
`renderInsertClause`, `parseCase` / `renderCase`.

---

## Fase 10 — Subquery em posições booleanas restantes (A1, A2) ✅ CONCLUÍDA

> ✅ Feito (2026-07-16). 134 testes (era 132). `emitTerm` ganhou a flag `expandSubquery` (irmã da
> `expandCase`), threaded por `renderBoolRiver`/`renderRiverTail`; `renderBoolClause` passa `true` no
> tail (inclusive após a 1ª condição-subquery) e força o break via `hasSubquery`; `renderOn` passa
> `true` e força break de ON single-condition quando há subquery. `)` sob o conector (`lineStart`),
> inner 1 nível a partir dele — conferido contra o layout travado. `isCommentSafe`: `whereCommentsSafe`
> e o ramo ON de `joinCommentsSafe` agora usam `boolExprCommentsSafe` (blanka toda subquery + recorre
> em cada interior), então comentário dentro de qualquer condição-subquery reflui. `blankFirstSubquery`
> e o import de `parseBoolExpr` removidos de `format.ts`.

Hoje `renderBoolClause` só expande a subquery quando é o **1º** termo (via caminho especial que
alinha o `)` sob a keyword da cláusula). `renderOn` (join) nunca expande. Objetivo: expandir uma
subquery num termo **não-primeiro** de `where`/`having` **e** em qualquer termo de um `join` ON.

**Como:** dar ao `emitTerm` uma flag `expandSubquery` (irmã de `expandCase`), threaded por
`renderBoolRiver`/`renderRiverTail` (where/having → `true`; `renderOn` → `true` agora). Quando o
termo é um átomo que contém `findSubquery`, expandir via `renderSubqueryBlock` com
`ownerLeading = lineStart` do termo (a coluna do conector `and`/`or`, ou do `on`). Forçar o break
(`hasSubquery`, como já existe `hasCase`). O **1º** termo do `where` continua no caminho especial
atual (`)` sob a keyword) — não mexer.

### Alvo A1 (PROPOSTO) — `)` sob o conector, inner 1 nível a partir dele
```
select id
  from orders
 where status_id = 1
   and customer_id in (
         select customer_id
           from vip_customers
          where active = true
       )
```
(`and` col 3; inner `select` col 5 = col-do-`and` + 2; `)` col 3, sob o `and`.)

### Alvo A2 (PROPOSTO) — idem, mas ancorado na river secundária do `on`
```
select o.id
  from orders o
  join customers c on c.id = o.customer_id
                  and c.id in (
                      select id
                        from vip_customers
                      )
```
(`and` alinhado sob a river do `on`; inner 1 nível a partir do `and`; `)` sob o `and`.)

- Grátis junto: **comentário dentro dessas subqueries** passa a refluir (`isCommentSafe` já
  recorre em toda subquery que o layout expande — estender `whereCommentsSafe`/`joinCommentsSafe`
  para os termos não-primeiros / ON).
- **Idempotência**: base 0; a subquery interna nunca vira a coluna mais à esquerda.

### Arquivos Fase 10
`layout.ts` (`emitTerm`, `renderBoolRiver`/`renderRiverTail`, `renderOn`, `renderBoolClause`
`hasSubquery`), `format.ts` (`whereCommentsSafe`, `joinCommentsSafe`).

---

## Fase 11 — `case` dentro de um `join` ON (A3) ✅ CONCLUÍDA

> ✅ Feito (2026-07-16). 138 testes (era 134). `renderOn` passa `expandCase = true` para o
> `renderBoolRiver` e detecta `hasCase` para forçar o break (inclusive ON de condição única). O que
> vem depois do `end` (ex.: `= 1`) fica na linha do `end`. Layout conferido contra o preview travado.

Hoje `renderOn` passa `expandCase = false`. Trocar para `true` (ou threaded) para que um `case`
numa condição de ON expanda na coluna do operando, igual a where/having (C3, fase 7). Alvo:
```
select o.id
  from orders o
  join customers c on case
                      when c.vip then 1
                      else 0
                      end = 1
```
- Muito pouco código (só liberar a flag no `renderOn`), mas **confirmar** o alvo com o usuário
  (ON com `case` é raro). Pode ir junto com a Fase 10.

### Arquivos Fase 11
`layout.ts` (`renderOn` passa `expandCase` para `renderBoolRiver`).

---

## Fase 12 — Quebra de listas DML largas (B1, B2) 🔴 layout a travar

### B1 — lista de colunas do `INSERT`
Hoje `renderInsertClause` é sempre 1 linha. Quebrar quando passar da largura, **alinhando as
colunas sob a primeira** (igual a um `select` list que quebra):
```
insert into big_table (column_one,
                       column_two,
                       column_three,
                       column_four)
values (...)
```
Alternativa (bloco) — **NÃO** recomendada (destoa do estilo river):
```
insert into big_table (
  column_one,
  column_two
)
```
- Decisão de layout a travar (recomendo a 1ª: colunas sob a primeira, vírgula à direita).

### B2 — tupla única larga de `values`
Hoje uma tupla não quebra por dentro. Quebrar os valores alinhados sob o primeiro (mesmo estilo):
```
values (value_one,
        value_two,
        value_three)
```
- Multi-row (>1 tupla) já quebra 1 por linha; B2 é só o *interior* de uma tupla larga.
  **Menor prioridade** — a interação (tupla larga dentro de várias tuplas) é fofa; talvez limitar
  B2 ao caso de tupla única por ora e documentar.

### Arquivos Fase 12
`layout.ts` (`renderInsertClause` → quebra tipo lista; `renderListClause`/`values` p/ tupla).

---

## Fase 13 (opcional) — Subquery / `case` embrulhado em função (C1, C2) 🔴 complexo

`coalesce((select …), 0)`, `func(case … end)`. Expandir exige achar a subquery/case **dentro** da
lista de argumentos e emitir `prefix((` + inner + `), sufixo)`. Fofo e menos comum; as fases
anteriores mantiveram inline de propósito. **Recomendo deixar por último** (ou fora de escopo até
haver demanda). Se for fazer, alvo provável:
```
select id,
       coalesce((
         select max(amount)
           from order_items oi
          where oi.order_id = orders.id
       ), 0) as top
  from orders
```

### Arquivos Fase 13
`layout.ts` (`renderItemLines` / `emitTerm` — achar subquery dentro de call, prefixo/sufixo).

---

## Não corrigir (comportamento correto)

- **E — comentário no meio de um token/condição** (`total_amount > -- x` \n `1000`). Reflow seguro
  é impossível sem risco de comentar código; **passthrough é o correto**. Documentar como decisão,
  não como bug.

## Decisão de config

- **D3 — default de `maxLineLength`.** Hoje `null → editor.rulers[0] → 80`. Opções: (a) manter;
  (b) fixar `80`; (c) fixar `100`. Rápido (`types.ts` `DEFAULT_OPTIONS`). Decidir com o usuário.

---

## Ordem sugerida
**10 → 11 → 12 → (13 opcional).** D3 a qualquer momento (independente).
10 e 11 reusam a máquina de subquery/case e destravam os comentários-dentro-de-subquery de graça;
12 é layout novo de lista DML; 13 é o mais complexo e de menor retorno.

## Regras do processo (iguais às fases 1–9)
1. Ler `formatting-spec.md` + módulo relevante.
2. **Travar o layout com o usuário** (preview/AskUserQuestion) antes de implementar cada fase.
3. **YAML-first**: caso(s) que falham; gerar `expected` via gerador no **diretório do projeto**
   (js-yaml 5.x → `import { dump }`), revisar contra o layout travado, colar, apagar o gerador.
4. Implementar mantendo **idempotência** e **nunca corromper** (na dúvida, inline/passthrough).
5. `npx tsc --noEmit` + `npm test` + `npm run lint`.
6. Doc: `README.md`, `.claude/rules/roadmap.md`, `formatting-spec.md`, `CLAUDE.md`, este plano.
7. Branch → commit (rodapé `Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>`)
   → `--ff-only` na main → push via
   `git -c credential.helper='!gh auth git-credential' push https://github.com/nbluis/riverleaf-sql-formatter.git main`.
8. Runtime mudou → re-package + re-install o vsix (`build-install-vsix`). Uma fase por commit.
