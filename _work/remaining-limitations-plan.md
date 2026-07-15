# Plano — limitações remanescentes (pós fases 1–4)

> Documento de trabalho. Escrito em **2026-07-15** após concluir as 4 Known Limitations originais
> (`main` em `aac729e`+, 90 testes passando). Idioma do código/doc/testes: **inglês** (regra de
> ouro); este rascunho de trabalho pode ficar em PT.
>
> Seleção do usuário (2026-07-15): resolver **A1, A2, A3, A4** (subqueries/CTEs), **C1, C2, C3**
> (case), e **B1** vem de graça junto com as subqueries. **B2 fica como está** (passthrough é o
> comportamento correto). Estético: **D1 sim** (RIVER + `)` sob a keyword — muda o golden),
> **D3 fica como está** (falar depois), **D2 ainda a decidir** com preview.
>
> Antes/depois revisado e aprovado pelo usuário no artifact
> `62c942b4-6fb4-4805-b055-e899dd84f7cd` (A1 e D1 ajustados conforme feedback; resto confirmado).

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

### 5a. A3 — subquery como tabela de um `join` 🟡
`renderJoinClause`: se a parte antes do `on` (tableRef) começa com uma subquery
(`findSubquery(tableRef)`), expandir `join (` … `) alias` com `ownerLeading = leading` do join; em
seguida renderizar o `on …` (inline se 1 condição; secondary river se várias) **na linha do `) alias`**.
- **Decisão**: `on` na mesma linha do `) alias` (provável) vs. `on` em nova linha. Gerar preview.

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

### 5c. A2 — subquery dentro de `where`/`having` multi-condição 🟡🔴
A mais difícil: integrar expansão de subquery no `emitTerm` (RIVER). Quando um atom contém uma
subquery, emitir o bloco expandido com `ownerLeading = lineStart` (coluna onde a linha do termo
começa — o conector fica acima). Hoje só expande quando é **condição única** (via `renderBoolClause`).
- **Decisão**: `)` alinhado sob o conector/`lineStart` (consistente com a regra "sob a keyword").
  Gerar preview com `and`/`or` em volta.

### 5d. B1 — comentário dentro de subquery (cai junto) 🟡
Hoje qualquer comentário dentro da subquery → `isCommentSafe` reprova → passthrough do statement
inteiro. Relaxar `isCommentSafe` para **não** reprovar por comentário que esteja **dentro** de uma
subquery expansível; a recursão (`renderInner` → `formatStatement`) posiciona o comentário.
- **Cuidado (idempotência + segurança)**: garantir que a segurança dos comentários do **interior**
  seja checada na recursão (hoje `renderInner` não passa por `isCommentSafe`). Opção: `renderInner`
  checar `isCommentSafe` do inner e cair para passthrough do bloco interno se inseguro.

### Arquivos Fase 5
`layout.ts` (`renderJoinClause`, `renderItemLines`, `emitTerm`), `format.ts` (`isCommentSafe`),
possível `renderInner` (checagem de segurança).

---

## Fase 6 — Múltiplas CTEs `with a as (...), b as (...)` (A1) 🔴

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

## Fase 7 — `case` aninhado e `case` fora do select (C1, C3)

### 7a. C1 — `case` aninhado (recursivo) 🟡
`renderCase`: quando um segmento (`when … then <case…end>` ou `else <case…end>`) contém um case,
expandi-lo recursivamente em vez de inline. **Decisão**: coluna do case interno (depois do `then`?
uma indentação a mais?). Preview.

### 7b. C3 — `case` fora da lista do select (where/having/order by) 🟡
Integrar `parseCase`/`renderCase` no `emitTerm`/render booleano (para `where`/`having`) e no
render de `order by`/`group by` (já usam `renderItemLines`, então C3 em order/group **já pode
funcionar** — confirmar). Foco: `case` como termo booleano no where.
- **Decisão**: coluna do case dentro do where (sob o operando? sob a keyword?). Preview.

### Arquivos Fase 7
`layout.ts` (`renderCase` recursivo; `emitTerm`/`renderBoolClause` reconhecendo case).

---

## Fase 8 — Quebrar `when … then …` longo (C2) 🟡

Quando `when <cond> then <result>` passa da largura, quebrar.
- **Decisão de layout (preview)**: quebrar antes do `then` (then numa linha alinhada) e/ou quebrar
  o `result`. Esboço a validar:
```
       when customer_lifetime_value > 100000 and region_code = 'LATAM'
       then 'platinum-latam-priority-segment'
```

### Arquivos Fase 8
`layout.ts` (`renderCase`).

---

## Fase 9 — Decisões estéticas (D1, D2, D3) — **decidir com preview**

A seleção veio contraditória; **cada item começa com um preview antes/depois** e confirmação.

- **D1 — unificar BLOCK vs RIVER dentro de parênteses.** Decisão (usuário, 2026-07-15): conectores
  dentro do grupo `( )` passam a ser **right-aligned (RIVER)**, iguais ao topo, **e o `)` de
  fechamento alinha sob a keyword da cláusula** (o `w` de `where`). Muda o **golden** existente —
  atualizar o golden e os testes afetados junto. Impl em `renderBoolBlock` (conectores) + o ponto
  onde o `)` do grupo é emitido em `emitTerm` (`pad(lineStart)` → alinhar sob o leading da cláusula).
- **D2 — normalizar indentação base.** Hoje preserva (coluna mínima). Alternativa: sempre coluna 0.
  Afeta **todos** os outputs e a idempotência — testar com cuidado. (Ainda a decidir com preview.)
- **D3 — fixar `maxLineLength` default.** **Decidido: fica como está** (`null → editor.rulers[0] →
  80`). Conversar sobre um default explícito depois — fora de escopo agora.

### Arquivos Fase 9
D1: `layout.ts` (`renderBoolBlock`). D2: `format.ts` (`detectBaseIndent`/uso do base).
D3: `types.ts` (`DEFAULT_OPTIONS`), talvez `extension.ts`.

---

## Ordem sugerida
**5 → 7 → 6 → 8 → 9.** (5 destrava B1 e reusa a máquina de subquery; 7 estende case reusando
parse/render; 6 e 8 precisam de decisão de layout via preview; 9 é estética/decisão pura.)
Cada fase: 1 commit próprio, docs atualizados, testes verdes + idempotentes.
