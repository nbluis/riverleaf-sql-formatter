# Plano — limitações remanescentes (pós fases 1–4)

> Documento de trabalho. Escrito em **2026-07-15** após concluir as 4 Known Limitations originais
> (`main` em `aac729e`+, 90 testes passando). Idioma do código/doc/testes: **inglês** (regra de
> ouro); este rascunho de trabalho pode ficar em PT.

## Progresso

- ✅ **Fase 5 (A3, A4, A2, B1) — CONCLUÍDA** (2026-07-15, commit `3e9d3f4`, já em `main` e pushado).
  114 testes passando (era 90). Feito:
  - **A3** subquery como tabela de `join` (`join (select …) alias on …`); ON single inline,
    multi-condição mantém o secondary river na linha do `) alias`. Segmenter passou a reconhecer
    `join (` como join (não a função `LEFT(`) só quando o interior começa com `SELECT`/`WITH`.
  - **A4** subquery escalar na lista do `select` (expande na coluna do item; `func(select …)` fica
    inline).
  - **A2** subquery no **1º** termo de um `where` multi-condição (expande sob a keyword; demais
    condições descem via `renderRiverTail`). Subquery em termo não-primeiro fica inline.
  - **B1** comentário **dentro** de subquery expandida agora reflui — `isCommentSafe` virou
    recursivo (desce em toda subquery que o layout expande). Comentário dentro de subquery
    não-expandida ainda cai para passthrough.
  - `findSubquery`/`matchParen` movidos para `segmenter.ts` (compartilhados com `format.ts`).
- ✅ **Fase 7 (C1, C3) — CONCLUÍDA** (2026-07-16). 118 testes (era 114). Feito:
  - **C1** `case` aninhado num ramo `when`/`else` expande recursivamente na coluna onde o `case`
    interno começa (`renderCaseSegment` + `findNestedCase`; `renderCase` chama o segmento). O que
    vem depois do `end` interno segue na linha do `end` interno. Atualizado o golden que antes
    mantinha o aninhado inline.
  - **C3** `case` em `where`/`having` expande na coluna do operando; o que vem após o `end`
    (ex.: `> 100`) segue na linha do `end`. Implementado via flag `expandCase` em `emitTerm`
    (threaded por `renderBoolRiver`/`renderRiverTail`; `renderBoolClause` passa `true` e força o
    break via `hasCase`; `renderOn`/join passa `false` → case em join ON fica inline).
    `group by`/`order by` já funcionavam via `renderItemLines` (confirmado com caso).
- ✅ **Fase 6 (A1) — CONCLUÍDA** (2026-07-16). 124 testes (era 118). Feito:
  - **A1** múltiplas CTEs `with a as (…), b as (…)` expandem cada uma. `renderCteClause` agora faz
    `splitCommaList` do corpo do `with`; cada CTE precisa ser `name as ( select|with … )`
    (`findSubquery`). `ownerLeading = leading` do `with` para **todas** → cada `)` sob o `with`. A
    1ª CTE leva o head `with`; as demais recuam o nome para a coluna do `with` (prefix só
    `name as `). A vírgula vai como `afterStr` depois do `)` da CTE anterior (a última sem vírgula).
    Se algum corpo de CTE não for parênteses `select`/`with` (ex.: `values`), cai no one-liner
    (`renderGenericClause`). `cteCommentsSafe` (format.ts) estendido: recorre em cada CTE quando
    todas expandem (comentário dentro reflui via a recursão; parte `name as`/pós-`)` deve ser
    comment-free). Layout travado (usuário 2026-07-15).
- ✅ **Fase 8 (C2) — CONCLUÍDA** (2026-07-16). 128 testes (era 124). Feito:
  - **C2** um `when … then` que passa da largura quebra **antes do `then`**: `when <cond>` numa
    linha e `then <result>` na seguinte, ambos na coluna do `case`. Em `renderCaseSegment`: se o
    segmento não tem case aninhado, não cabe (`fits`) e é um `WHEN`, acha o `THEN` top-level
    (`findThen`, paren/case depth 0) e quebra. `ELSE` nunca quebra (sem `THEN`; else longo fica
    inline). Case aninhado num ramo tem precedência (já é multi-linha). Idempotente (tokens iguais
    na releitura → mesma decisão de largura). Layout travado (usuário 2026-07-15).
- ✅ **Fase 9 (D1 ✅; D2 ✅; D3 fora) — CONCLUÍDA** (2026-07-16). 132 testes.
  - **D1** ✅. Conectores dentro de um grupo `( )` expandido agora right-align (RIVER) à river do
    próprio grupo (`blockIndent - 1`), operandos em `blockIndent`; o `)` continua sob o conector
    dono (só mexi em `renderBoolBlock`, não no `emitTerm`). Golden atualizado + 1 caso novo.
  - **D2** ✅ **normalizar para coluna 0**. Preview apresentado; o usuário inicialmente escolheu
    preservar e depois mudou de ideia para normalizar. `base` agora é a constante `0` em `format()`
    (removi `detectBaseIndent`). Saída sempre no left-margin; indentação de origem é descartada.
    Continua idempotente (a cláusula mais larga fica na coluna 0; blocos internos indentam 1 nível).
    Golden re-gerado + 1 caso novo (input indentado → coluna 0).
  - **D3** fora de escopo (fica `null → editor.rulers[0] → 80`).
>
> Seleção do usuário (2026-07-15): resolver **A1, A2, A3, A4** (subqueries/CTEs), **C1, C2, C3**
> (case), e **B1** vem de graça junto com as subqueries. **B2 fica como está** (passthrough é o
> comportamento correto). Estético: **D1 sim** (RIVER + `)` sob a keyword — muda o golden),
> **D3 fica como está** (falar depois), **D2 ainda a decidir** com preview.
>
> Antes/depois revisado e aprovado pelo usuário no artifact
> `62c942b4-6fb4-4805-b055-e899dd84f7cd`. **Todos os layouts-alvo estão travados abaixo** (embutidos
> como sketches). **Única decisão ainda aberta: D2** (preservar vs. normalizar a indentação base) —
> decidir com preview no início da fase 9.

## Regras do processo (repetir em cada fase — igual às fases 1–4)

1. Ler `.claude/rules/formatting-spec.md` + módulo relevante.
2. **YAML-first**: caso(s) que falham em `test/cases/*.yaml`; gerar `expected` via gerador no
   **diretório do projeto** (scratchpad não resolve `node_modules`; js-yaml 5.x → `import { dump }`),
   revisar, colar, apagar o gerador.
3. Implementar mantendo **idempotência** e **nunca corromper** (na dúvida, passthrough/inline).
4. `npx tsc --noEmit` + `npm test` + `npm run lint`.
5. Doc: `README.md`, `.claude/rules/roadmap.md`, `formatting-spec.md`, `CLAUDE.md`.
6. Branch → commit (rodapé `Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>`)
   → `--ff-only` na main → push via
   `git -c credential.helper='!gh auth git-credential' push https://github.com/nbluis/riverleaf-sql-formatter.git main`.

## Máquinas já existentes para reusar

- `findSubquery(tokens)` / `matchParen` — acham `( select|with ... )` top-level.
- `renderSubqueryBlock(prefix, inner, ownerLeading, afterStr)` — `prefix(` + `renderInner` no
  `ownerLeading + indentSize` + `)` sob `ownerLeading` + `afterStr`. **Reusável em todas as posições
  novas de subquery.**
- `renderInner` — segmenta e chama `formatStatement` recursivamente.
- `parseCase` / `renderCase` / `renderItemLines` — case na lista.
- `emitTerm` / `renderBoolRiver` / `renderBoolBlock` — expressões booleanas (where/having/on).

---

## Fase 5 — Subqueries em mais posições + comentário dentro (A3, A4, A2, B1)

Reusa `renderSubqueryBlock`. Fazer da mais simples para a mais complexa.

### 5a. A3 — subquery como tabela de um `join` 🟡 (layout travado)
`renderJoinClause`: se a parte antes do `on` (tableRef) começa com uma subquery
(`findSubquery(tableRef)`), expandir `join (` … `) alias` com `ownerLeading = leading` do join; o
`on …` fica **na linha do `) alias`** (inline se 1 condição; secondary river se várias).
- **Atenção**: hoje `join` seguido de `(` não é reconhecido como join (o guard do `LEFT(` em
  `isClauseBoundary` retorna 0). Precisa distinguir `join (subquery)` de função — só tratar como
  função quando o interior **não** começa com `select`/`with`.
```
select o.id
  from orders o
  join (
    select customer_id
      from vip_customers
  ) v on v.customer_id = o.customer_id
```

### 5b. A4 — subquery escalar na lista do `select` 🟡
Em `renderItemLines`: se o item contém uma subquery top-level (`findSubquery(item.tokens)`),
expandir via `renderSubqueryBlock` com `ownerLeading = operandCol` (coluna do item); `afterStr` = o
que vem depois do `)` (ex.: `as item_count`). Alvo provável:
```
select id,
       (
         select count(*)
           from order_items oi
          where oi.order_id = orders.id
       ) as item_count
  from orders
```
- **Cuidado**: item que é `func(select …)` (subquery aninhada em função) — manter inline (só
  expandir quando o item **é** a subquery, possivelmente com alias depois).

### 5c. A2 — subquery dentro de `where`/`having` multi-condição 🟡 (layout travado)
Hoje `renderBoolClause` só expande a subquery quando `terms.length === 1`. Estender para: quando o
**1º termo** é (ou contém) uma subquery, expandi-la reusando **exatamente** o caminho do caso de
condição única (`ownerLeading = leading` da cláusula → `)` sob o `w` do `where`, inner em
`leading + indentSize`), e então renderizar os termos restantes (`and`/`or`) normalmente abaixo.
- Subquery num termo **não-primeiro** (depois de `and`/`or`) → manter inline por ora (documentar).
- **Não** usar `lineStart` do `emitTerm` (daria `)` na coluna do operando, col 7 — errado). É o
  `leading` da cláusula (col 1) que o usuário confirmou.
```
select id
  from orders
 where customer_id in (
   select customer_id
     from vip_customers
    where active = true
 )
   and status_id = 1
```

### 5d. B1 — comentário dentro de subquery (cai junto) 🟡 (layout travado)
Hoje qualquer comentário dentro da subquery → `isCommentSafe` reprova → passthrough do statement
inteiro. Relaxar `isCommentSafe` para **não** reprovar por comentário que esteja **dentro** de uma
subquery expansível; a recursão (`renderInner` → `formatStatement`) posiciona o comentário (no
exemplo, comentário entre cláusulas do inner → coluna de conteúdo do inner).
- **Cuidado (idempotência + segurança)**: garantir que a segurança dos comentários do **interior**
  seja checada na recursão (hoje `renderInner` não passa por `isCommentSafe`). Opção: `renderInner`
  checar `isCommentSafe` do inner e cair para passthrough do bloco interno se inseguro.
```
select x.id
  from (
    select id
           -- note inside
      from orders
  ) x
```

### Arquivos Fase 5
`layout.ts` (`renderJoinClause`, `renderItemLines`, `emitTerm`), `format.ts` (`isCommentSafe`),
possível `renderInner` (checagem de segurança).

---

## Fase 6 — Múltiplas CTEs `with a as (...), b as (...)` (A1) ✅ CONCLUÍDA

`renderCteClause` hoje só trata **uma** CTE (nada após o `)`). Estender para lista separada por
vírgula no nível do `with`.
- **Layout decidido (usuário, 2026-07-15)**: a partir da 2ª CTE, o nome recua para a **coluna do
  `with`** (não sob o 1º nome); a vírgula fica **depois do `)`** da CTE anterior. `)` de cada CTE
  alinha sob o `with`:
```
  with a as (
    select id
      from orders
  ),
  b as (
    select id
      from customers
  )
select …
```
- **Cuidado**: idempotência com `detectBaseIndent` (mínimo) quando o corpo interno indenta.

### Arquivos Fase 6
`layout.ts` (`renderCteClause` — loop sobre CTEs), talvez `segmenter.ts`.

---

## Fase 7 — `case` aninhado e `case` fora do select (C1, C3) ✅ CONCLUÍDA

### 7a. C1 — `case` aninhado (recursivo) 🟡 (layout travado)
`renderCase`: quando um segmento (`when … then <case…end>` ou `else <case…end>`) contém um case,
expandi-lo recursivamente. Coluna do case interno = **onde ele começa na linha** (depois do
`then `), com `when`/`else`/`end` internos alinhados aí. (Se na prática ficar fundo demais, ok
propor indentar mais raso — mas o alvo aprovado é este.)
```
select case
       when priority = 1 then case
                              when is_paid then 'a'
                              else 'b'
                              end
       else 'c'
       end as label
  from orders
```

### 7b. C3 — `case` fora da lista do select (where/having) 🟡 (layout travado)
Integrar `parseCase`/`renderCase` no render booleano (`renderBoolClause`/`emitTerm`) para
`where`/`having`. Coluna do case = onde o `case` aparece na linha do termo (`where case` → `case`
na coluna do operando; `when`/`else`/`end` alinhados aí); o que vem depois do `end` (ex.: `> 100`)
segue na linha do `end`. (`order by`/`group by` já passam por `renderItemLines`, então C3 lá já
deve funcionar — confirmar com um caso.)
```
select id
  from orders
 where case
       when status_id = 1 then total
       else 0
       end > 100
```

### Arquivos Fase 7
`layout.ts` (`renderCase` recursivo; `emitTerm`/`renderBoolClause` reconhecendo case).

---

## Fase 8 — Quebrar `when … then …` longo (C2) ✅ CONCLUÍDA

Quando `when <cond> then <result>` passa da largura, **quebrar antes do `then`**: `when <cond>` numa
linha e `then <result>` na linha seguinte, ambos alinhados na coluna do case:
```
select case
       when customer_lifetime_value > 100000 and region_code = 'LATAM'
       then 'platinum-latam-priority-segment'
       else 'std'
       end as seg
  from customers
```

### Arquivos Fase 8
`layout.ts` (`renderCase`).

---

## Fase 9 — Decisões estéticas (D1 ✅, D2 ✅ normalizar, D3 fora) ✅ CONCLUÍDA

- **D1 — unificar BLOCK vs RIVER dentro de parênteses.** Decisão (usuário, 2026-07-15): **única
  mudança** = conectores dentro do grupo `( )` passam a ser **right-aligned (RIVER)**, iguais ao
  topo. O `)` de fechamento **continua alinhado com o `(` de abertura** (os dois parênteses na
  mesma coluna, como já é hoje). Muda o **golden** existente — atualizar o golden e os testes
  afetados junto. Impl só em `renderBoolBlock` (conectores); **não** mexer no ponto onde o `)` do
  grupo é emitido em `emitTerm`. Alvo:
  ```
   where (
           status_id = 1
        or status_id = 2
        or status_id = 3
         )
     and total_amount > 0
  ```
  ✅ **CONCLUÍDA** (2026-07-16, Phase 9). Implementado em `renderBoolBlock`: `connEnd = blockIndent
  - 1`, operandos em `blockIndent`, conectores right-aligned. `)` intocado (`emitTerm`).
- **D2 — normalizar indentação base.** ✅ **DECIDIDO: sempre coluna 0** (usuário, 2026-07-16, após
  preview — mudou da escolha inicial de preservar). `base = 0` constante em `format()`;
  `detectBaseIndent` removido. Idempotência mantida (cláusula mais larga na col 0). Golden re-gerado.
- **D3 — fixar `maxLineLength` default.** **Decidido: fica como está** (`null → editor.rulers[0] →
  80`). Conversar sobre um default explícito depois — fora de escopo agora.

### Arquivos Fase 9
D1: `layout.ts` (`renderBoolBlock`). D2: `format.ts` (`base = 0`; `detectBaseIndent` removido).
D3: `types.ts` (`DEFAULT_OPTIONS`), talvez `extension.ts` — não mexido (fora de escopo).

---

## Ordem sugerida
**5 → 7 → 6 → 8 → 9.** (5 destrava B1 e reusa a máquina de subquery; 7 estende case reusando
parse/render; 6 e 8 precisam de decisão de layout via preview; 9 é estética/decisão pura.)
Cada fase: 1 commit próprio, docs atualizados, testes verdes + idempotentes.
