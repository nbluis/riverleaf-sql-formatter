# Plano — atacar as Known Limitations

> Documento de trabalho para retomar o desenvolvimento. Escrito ao fim da sessão de
> **2026-07-14**. Baseline: `main` em `336e69c`, `npm test` = **46 passando**, lint + tsc limpos.
> Idioma do código/doc/testes: **inglês** (regra de ouro do projeto). Este arquivo de trabalho
> pode ficar em PT — é rascunho interno em `_work/`.

## Onde estamos (contexto)

Nesta sessão já entregamos e publicamos na `main`:

1. **JOINs com >1 condição no ON sempre quebram** (`and`/`or` alinhados sob o `on`).
2. **Comentários por associação** (fim do passthrough amplo):
   - `token.newlineBefore` no tokenizer distingue **inline** (código antes na mesma linha) de
     **standalone** (sozinho na linha).
   - Standalone: `commentsBefore` de cláusula / item / `BoolTerm`, e `trailingComments` do
     statement. Inline: preso ao último token da linha.
   - Alinhamento: comentário de topo na **margem base**; demais standalone na **coluna do
     conteúdo** (`riverEnd + 1`). Comentário depois do `;` final **cola** sob o statement.
   - `where`/`having`: inline e standalone entre condições já refluem (`processRawTerms` →
     `BoolTerm.comment` / `BoolTerm.commentsBefore`).

### Ainda em passthrough (o que este plano ataca no item "Comentários")
- comentário **dentro de grupo** `( ... )`;
- comentário **antes da 1ª condição** do `where`/`having`;
- comentário **dentro do `ON`** de um join.

## Arquitetura (mapa rápido)

Núcleo puro (sem `vscode`), consumido pela extensão fina.

- `src/formatter/types.ts` — `Token` (tem `newlineBefore`), `FormatOptions`, `DEFAULT_OPTIONS`.
- `src/formatter/keywords.ts` — conjuntos de keywords (`CLAUSE_STARTERS`, `JOIN_STARTERS`, ...).
- `src/formatter/tokenizer.ts` — `tokenize`.
- `src/formatter/render.ts` — `renderTokens`, casing, `needsSpace`.
- `src/formatter/segmenter.ts` — `splitStatements`, `segmentClauses`, `parseBoolExpr`,
  `processRawTerms`, `boolCommentsReflowable`, `splitListItems`, `splitCommaList`.
- `src/formatter/layout.ts` — `Layout`: motor de alinhamento (river, RIVER/BLOCK, quebras).
  **A parte difícil.**
- `src/formatter/format.ts` — `format()`, `detectBaseIndent`, `isCommentSafe`, passthrough.
- `src/extension.ts` — providers do VS Code.

Leitura obrigatória antes de mexer no layout/segmenter:
`.claude/rules/formatting-spec.md`. Regras de teste: `.claude/rules/testing.md`
(data-driven, YAML em `test/cases/*.yaml`, gerar `expected` a partir do formatter — nunca contar
espaços na mão; script descartável no scratchpad).

## Decisões travadas com o usuário (não reabrir sem perguntar)

- **Comentários restantes** → estender a **mesma regra** aos 3 casos (grupo, antes-da-1ª, join ON).
- **Subquery/CTE** → **expandir sempre** (quando há estrutura), recalculando o river interno; o
  **`)` de fechamento alinha no início do carro** (coluna base; coluna 0 no exemplo de base 0).
- **`case when`** → **expandir sempre**; `case` / `when` / `else` / `end` **na mesma coluna à
  esquerda** (a coluna onde o `case` começa).
- **DML** → formatar **como o select** (`set`/`values` como listas; `where` com river).
- **Antes da 1ª condição do where** → **opção (b)**: o `where` fica **sozinho na linha** e a 1ª
  condição **desce** para baixo do comentário.
- **Ordem de execução** → **1 → 2 → 3 → 4** (abaixo).
- Gatilho de expansão (subquery/CTE e case) → **sempre** (não depende da largura).

## Fluxo por fase (repetir em cada uma)

1. Ler `formatting-spec.md` + módulo relevante.
2. **YAML-first**: adicionar caso(s) que falham em `test/cases/*.yaml` (gerar `expected` via script
   descartável no scratchpad — ver `testing.md`; usar nomes realistas: `orders`, `customers`,
   `order_items`, `customer_id`, `total_amount`...).
3. Implementar mantendo **idempotência** (`format(format(x)) === format(x)`) e **nunca corromper**
   (na dúvida, passthrough).
4. `npm test` + `npm run lint` + `npx tsc --noEmit`.
5. Re-package + re-install do vsix (só se mudou runtime):
   `npm run build` →
   `npx @vscode/vsce package --allow-missing-repository --skip-license` →
   `code --install-extension riverleaf-sql-formatter-0.0.1.vsix --force`.
   (push do vsix não; ele é gitignored.)
6. Branch própria → commit (rodapé `Co-Authored-By: Claude Opus 4.8 (1M context)
   <noreply@anthropic.com>`) → `--ff-only` na main → push. **Push via HTTPS do gh** (o remote é
   SSH e não há chave neste ambiente):
   `git -c credential.helper='!gh auth git-credential' push https://github.com/nbluis/riverleaf-sql-formatter.git main`
7. Atualizar `README.md` (Known limitations), `.claude/rules/roadmap.md`, `formatting-spec.md`,
   `CLAUDE.md`.

---

## Fase 1 — Comentários (fechar o item 1)

Estender a máquina de comentários de `BoolTerm` (já usada no `where`/`having`) aos 3 casos.

### 1a. Dentro de grupo `( ... )` (BLOCK mode)
`parseBoolExpr` deve propagar `comment`/`commentsBefore` na **recursão** para os termos internos
do grupo; `renderBoolBlock`/`emitTerm` devem emitir as linhas de `commentsBefore` na coluna das
condições do bloco e anexar `comment` inline. Alvo:

```
 where (
         status_id = 1
         -- dentro do grupo
      or status_id = 2
       )
   and total_amount > 0
```

### 1b. Antes da 1ª condição do where — opção (b)
Hoje `processRawTerms` marca `safe = false` quando o termo 0 recebe `commentsBefore`. Mudar para
**suportar**: o `where` fica sozinho na linha; a 1ª condição desce para a coluna do conteúdo, com
o(s) comentário(s) na própria linha acima dela (mesmo padrão de `renderListClause` quando o item 0
tem `commentsBefore`). Alvo:

```
 where
       -- nota antes
       status_id = 1
   and total_amount > 0
```

### 1c. Dentro do `ON` de um join
`renderJoinClause` já reusa `parseBoolExpr`/`renderBoolRiver`; falta:
- em `isCommentSafe`, trocar o gate do join (hoje "comentário não-último → passthrough") por
  `boolCommentsReflowable(onTokens)`, exigindo que a parte antes do `on` (table ref) não tenha
  comentário;
- garantir que `renderBoolRiver` já emite `commentsBefore`/`comment` (emite — reusar).

Alvo (river secundário sob o `on`):

```
  join customers c on c.id = o.customer_id
                  and c.active = true
                      -- comentário sozinho na coluna do operando do ON
```

### Arquivos Fase 1
`segmenter.ts` (recursão de comentários no grupo; termo-0 `commentsBefore` deixa de ser unsafe),
`layout.ts` (`renderBoolBlock`/`emitTerm` com comentários; `renderBoolClause` para o caso 1b;
`renderJoinClause`), `format.ts` (`isCommentSafe` do join).

### Gotchas Fase 1
- Idempotência: reprocessar a saída deve reproduzir os mesmos `commentsBefore`.
- Não quebrar os casos já verdes (46 testes) — em especial os grupos que hoje refluem inline.

---

## Fase 2 — DML (`insert` / `update` / `delete`)

Tratar como o select.

- Reconhecer `set` como **cláusula de lista** (uma atribuição por linha quando quebrar, vírgula à
  direita); `values ( ... )` como lista; `where` reusa o river.
- Confirmar em `keywords.ts` que `SET`, `VALUES`, `INTO`, `UPDATE`, `DELETE`, `INSERT` são tratados
  (clause starters onde aplicável) e ajustar `clauseKind` no `segmenter.ts`.
- Rotear `set`/`values` para `renderListClause` no `layout.ts`.

Alvos:

```
update orders
   set status_id = 2,
       updated_at = now()
 where id = 42
   and status_id = 1
```
```
insert into orders (customer_id, total_amount)
values (42, 100)
```
```
delete from orders
 where status_id = 0
```

### Gotchas Fase 2
- `values` com múltiplas tuplas: `values (..), (..), (..)` — decidir quebra por tupla.
- Não confundir `SET` de UPDATE com outros usos.
- Sem casos golden ainda → gerar `expected` e **revisar** antes de fixar.

---

## Fase 3 — Subqueries / CTEs (maior mudança arquitetural)

Formatação **recursiva**. Quando um `( select ... )` aparece num corpo de cláusula
(`from (...)`, corpo de CTE, subquery em `where ... in (select ...)`), rodar o pipeline de novo
para o interior e indentar, com **`)` no início do carro** (coluna base). Expandir **sempre**.

Alvo (base 0; **finalizar a indentação interna exata gerando preview** — o usuário só fixou o
`)` na coluna base):

```
select x.id, x.total
  from (
         select id, sum(amount) as total
           from orders
          group by id
) x
 where x.total > 100
```

CTE (`with`): corpo como bloco próprio; melhorar o `with` (hoje cai no genérico, coluna 2):

```
  with recent as (
         select id
           from orders
          where created_at > now() - interval '7 days'
)
select id
  from recent
```

### Abordagem
- Detectar subquery parentizada nos tokens de uma cláusula (achar `(` ... `)` cujo primeiro token
  interno relevante seja `select`/`with`).
- Recursão: chamar o `Layout`/`format` sobre os tokens internos com um `base` aumentado; costurar
  as linhas com `(` no fim da linha de abertura e `)` na coluna base.
- Idempotência é o maior risco aqui — testar reprocessamento com cuidado.

### Arquivos Fase 3
Principalmente `layout.ts` (novo renderer de bloco parentizado recursivo), `segmenter.ts`
(detecção de subquery/CTE), possível ajuste em `format.ts`.

### Aberto p/ finalizar no início da fase
- Indentação exata do bloco interno (só o `)` foi fixado na coluna base).
- Onde fica o alias (` x`) após o `)`.

---

## Fase 4 — `case when ... end`

Expandir **sempre** (case com qualquer `when` quebra). `case`/`when`/`else`/`end` **na mesma
coluna** (a coluna onde `case` começa).

Alvo:

```
select case
       when status_id = 1 then 'paid'
       when status_id = 2 then 'pending'
       else 'other'
       end as label
  from orders
```

### Abordagem
- Parser de expressão `case` (em itens do select e em condições booleanas).
- Renderer: um `when ... then ...` por linha, todos alinhados na coluna do `case`; `else` e `end`
  na mesma coluna.
- Integrar no `renderListClause` (itens do select) e nos renderers booleanos quando um termo é um
  `case`.

### Aberto p/ finalizar no início da fase
- `when X then Y` muito longo: quebra o `then`? (decidir gerando preview).
- Múltiplos `case` no mesmo item / `case` aninhado.

---

## Decisões estéticas em aberto (fora deste escopo, do roadmap)

Não são limitações técnicas; são escolhas suas ainda não decididas (ver `roadmap.md`):
- BLOCK vs RIVER dentro de parênteses (mantido como está, casa com o golden).
- Preservação da indentação base.
- `maxLineLength` padrão (`null` → `editor.rulers[0]` → 80).

## Comandos úteis

```bash
npm test
npm run lint
npx tsc --noEmit
npm run build
npx @vscode/vsce package --allow-missing-repository --skip-license
code --install-extension riverleaf-sql-formatter-0.0.1.vsix --force
```
