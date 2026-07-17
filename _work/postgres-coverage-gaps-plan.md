# Plano — lacunas de cobertura PostgreSQL (round 3)

> Documento de trabalho, escrito em **2026-07-16**. Idioma de código/doc/testes: **inglês**
> (regra de ouro); este rascunho fica em PT. Todos os alvos de exemplo usam o **dicionário de
> astronomia** (`.claude/rules/example-dictionary.md`) — os snippets abaixo já estão reescritos
> nele; nas sondagens usei vocabulário antigo (orders/customers) só para não travar a investigação.
>
> **Método (igual ao caso LATERAL):** rodei `format()` empiricamente sobre ~65 construtos do
> PostgreSQL e li a saída real, não a doc. O objetivo era achar o que **corrompe** ou fica **fora
> de escopo** — como os LATERAL joins estavam. Suíte atual: **80 casos** em 5 arquivos.

## Sumário executivo

A maioria das lacunas cai em **duas causas-raiz** que corrompem SQL muito comum, mais um conjunto
de features que **já formatam bem mas não têm nenhum teste** (risco de regressão silenciosa).

1. **Operadores multi-caractere são fatiados pelo tokenizer** (causa-raiz nº 1). `src/formatter/
   tokenizer.ts` tem uma lista **fixa e curta** de operadores (`MULTI_CHAR_OPERATORS` = `->>`,
   `->`, `<=`, `>=`, `<>`, `!=`, `||`, `::`, `:=`, `=>`). Qualquer operador fora dela vira vários
   tokens de 1 char e o `needsSpace` (render.ts) enfia espaços **dentro** do operador. Corrompe
   JSON/JSONB (`@>`, `<@`, `#>`, `#>>`, `?`, `?|`, `?&`, `@?`, `@@`), regex (`~*`, `!~`, `!~*`),
   arrays (`&&`), bit-shift (`<<`, `>>`). Isso é o achado mais forte — JSONB está em toda query PG
   moderna.
2. **Palavras-chave de continuação viram âncoras de cláusula** (causa-raiz nº 2). `UPDATE`/`FROM`
   dentro de um contexto onde não iniciam cláusula (`FOR UPDATE`, `ON CONFLICT DO UPDATE`,
   `IS DISTINCT FROM`, `WITH ORDINALITY`, `MERGE ... WHEN ... THEN UPDATE/INSERT`) são cortadas
   como se abrissem cláusula → quebra e mangling.
3. **Features que já funcionam mas sem cobertura** — janelas (`OVER`/`WINDOW`), `FILTER`,
   `WITHIN GROUP`, set ops (`UNION`/`INTERSECT`/`EXCEPT`), `WITH RECURSIVE`, `ROLLUP`/`CUBE`/
   `GROUPING SETS`, `NULLS FIRST/LAST`, `FETCH FIRST`, `JOIN USING`/`NATURAL`/`CROSS`/`FULL OUTER`,
   funções set-returning no `FROM`, `CAST`/`::`/`EXTRACT`/`SUBSTRING FROM FOR`, `ARRAY`/`ROW`,
   `AT TIME ZONE`, `UPDATE ... FROM`, `DELETE ... USING`, window frame, `CREATE VIEW AS`,
   `TABLESAMPLE`. São o guard-rail que falta.

## Regra inegociável — todo cenário vira caso de regressão no YAML

**Nada nesta lista é "resolvido" sem um caso YAML que o trave.** Para *cada* construto tocado —
seja uma correção de corrupção (A1–A6) ou uma feature que já funciona (B1–B16) — **é obrigatório
adicionar um ou mais cenários** em `test/cases/*.yaml`, com `expected` gerado pela skill
`regen-format-cases` (nunca contado à mão) e revisado. O runner então garante que aquilo **nunca
mais regride silenciosamente** — que é exatamente o que faltava quando os LATERAL joins quebraram.
Regras:
- **Antes** de mudar código (A1–A6): caso que **falha** primeiro (TDD, skill `add-formatter-behavior`).
- Para features que já funcionam (B1–B16): capturar o golden atual **é** o trabalho da Fase 4.
- Cobrir também os **vizinhos** do bug: ao consertar `@>`, incluir `<@`, `#>`, `#>>`, `?`, `&&` etc.,
  e reafirmar que os que já funcionavam (`::`, `->`, `->>`, `||`, `<>`, `>=`) continuam — para que a
  mudança de lexer não regrida nenhum.
- Todo caso novo carrega a asserção de **idempotência** do runner por padrão (não desligar sem motivo).
- Exemplos sempre no **dicionário de astronomia**.

Cada fase abaixo lista os casos que precisa criar; a definição de "concluída" inclui esses casos
verdes.

## Inventário (verificado rodando o formatter, 2026-07-16)

| # | Construto | Hoje | Classe | Fase |
|---|-----------|------|--------|------|
| A1 | Operadores multi-char PG (`@>`,`<@`,`#>`,`#>>`,`?`,`?|`,`?&`,`@@`,`~*`,`!~`,`&&`,`<<`,`>>`) | ✅ **resolvido** (maximal-munch, Fase 1) | corrupção | **1** ✅ |
| A2 | `IS [NOT] DISTINCT FROM` | ✅ **resolvido** (guard no `FROM`, Fase 2) | corrupção | **2** ✅ |
| A3 | `FOR UPDATE`/`FOR SHARE`/`FOR NO KEY UPDATE` (+`OF`/`NOWAIT`/`SKIP LOCKED`) | ✅ **resolvido** (cláusula `for` no rio, Fase 2) | corrupção | **2** ✅ |
| A4 | `INSERT ... ON CONFLICT ... DO UPDATE/NOTHING` | ✅ **resolvido** (cláusula `on conflict` no rio, Fase 3) | corrupção | **3** ✅ |
| A5 | `WITH ORDINALITY` (from-item) | ✅ **resolvido** (guard no `WITH`, Fase 2) | corrupção leve | **2** ✅ |
| A6 | `MERGE ... WHEN MATCHED THEN ...` (PG 15+) | **corrompe** total | corrupção (grande) | **6** (opcional) |
| B1 | `SELECT DISTINCT` / `DISTINCT ON (...)` | ✅ ok | ✅ testado (Fase 4) | 4 ✅ |
| B2 | window `OVER (...)` + cláusula `WINDOW w AS (...)` | ✅ ok | ✅ testado (Fase 4) | 4 ✅ |
| B3 | `FILTER (WHERE ...)`, `WITHIN GROUP (ORDER BY ...)` | ✅ ok | ✅ testado (Fase 4) | 4 ✅ |
| B4 | set ops `UNION`/`UNION ALL`/`INTERSECT`/`EXCEPT` | ✅ **decidido: fica no rio** (Fase 5) + testado | decisão + teste | **5** ✅ |
| B5 | `WITH RECURSIVE` | ✅ ok | ✅ testado (Fase 4) | 4 ✅ |
| B6 | `GROUP BY ROLLUP`/`CUBE`/`GROUPING SETS` | ✅ ok (cosmético: `sets(` sem espaço) | ✅ testado (Fase 4) | 4 ✅ |
| B7 | `ORDER BY ... NULLS FIRST/LAST`, `USING op` | ✅ ok | ✅ testado (Fase 4) | 4 ✅ |
| B8 | `FETCH FIRST n ROWS ONLY`, `OFFSET`/`LIMIT` | ✅ ok | ✅ testado (Fase 4) | 4 ✅ |
| B9 | `JOIN USING (...)`, `NATURAL`, `CROSS`, `FULL OUTER` | ✅ ok | ✅ testado (Fase 4) | 4 ✅ |
| B10 | funções no `FROM` (`generate_series`, `unnest`, coldef `f() as x(a int)`) | ✅ ok | ✅ testado (Fase 4) | 4 ✅ |
| B11 | `CAST`/`::`/`EXTRACT`/`SUBSTRING FROM FOR`/`TRIM`/`POSITION IN` | ✅ ok | ✅ testado (Fase 4) | 4 ✅ |
| B12 | `ARRAY[...]`, subscript `col[1]`, `ROW(...)`, `AT TIME ZONE` | ✅ ok | ✅ testado (Fase 4) | 4 ✅ |
| B13 | `UPDATE ... FROM`, `DELETE ... USING` | ✅ ok | ✅ testado (Fase 4) | 4 ✅ |
| B14 | window frame `ROWS BETWEEN ... AND ...` | ✅ ok (cresce numa linha) | ✅ testado (Fase 4) | 4 ✅ |
| B15 | `CREATE VIEW ... AS SELECT`, `TABLESAMPLE`, `VALUES` standalone | ✅ ok | ✅ testado (Fase 4) | 4 ✅ |
| B16 | multi-coluna `IN` (`where (a,b) in (select ...)`) | ✅ ok | ✅ testado (Fase 4) | 4 ✅ |

Legenda: **corrupção** = viola o invariante "never corrupt"; **sem teste** = formata certo mas não
há caso YAML (regressão poderia passar despercebida).

---

## Fase 1 — Lexer de operadores por maximal-munch (A1) 🔴 prioridade máxima ✅ CONCLUÍDA (2026-07-17)

> **Feito.** `tokenizer.ts` agora faz maximal-munch sobre o conjunto de chars de operador do PG
> (`+ - * / < > = ~ ! @ # % ^ & | ?`); `@`/`#` saíram do conjunto de chars de identificador (eram a
> causa de `@>`→`@ >`); `::`/`:=` são reconhecidos antes do munch; regra PG do `+`/`-` final aplicada
> (`x=-1` → `= - 1`, não `=- 1`). `render.ts` não mudou (o espaçamento binário padrão já cobre os
> novos operadores; só `::`/`->`/`->>` continuam colados). Travado por `test/cases/operators.yaml`
> (17 casos: containment/path/existência/regex/array/bit + regressão dos que já funcionavam). Suíte
> 215 verde, `tsc`/`lint` limpos. Nota: o espaçamento do menos **unário** (`= - 1`) é pré-existente,
> não é corrupção e ficou fora do escopo.

**Problema.** O tokenizer só conhece uma lista fixa de operadores multi-char. O PostgreSQL permite
operadores compostos de qualquer sequência dos caracteres `+ - * / < > = ~ ! @ # % ^ & | ` ?`
(inclui operadores definidos pelo usuário). Hoje `@>` vira `@` + `>`, `#>>` vira `#`+`>`+`>`, `&&`
vira `&`+`&`, `~*` vira `~`+`*` — e o `needsSpace` separa com espaço. **Corrompe silenciosamente.**

Evidência (saída real hoje):
```
 where data @ > '{"a":1}'          -- deveria ser  data @> '{"a":1}'
select data # > > '{a,b}'          -- deveria ser  data #>> '{a,b}'
 where tags & & array[1, 2]        -- deveria ser  tags && array[1, 2]
   and email ~ * 'gmail'           -- deveria ser  email ~* 'gmail'
```

**Fix (recomendado):** trocar a lista fixa por **maximal munch** — ao ver um char de operador,
consumir a **maior sequência contígua** de chars do conjunto de operadores do PG como um único
token `operator`. Isso cobre todos os operadores atuais e futuros/definidos-pelo-usuário de uma vez,
sem enumerar. Cuidados (regras do PG, ver doc "Operator Precedence"/"Lexical Structure"):
- Conjunto de chars de operador: `+ - * / < > = ~ ! @ # % ^ & | ?`. (`` ` `` é raro; avaliar.)
- **Não** engolir `::`, `:=`, `=>` — hoje são tratados à parte; manter compatível (o lexer de
  munch já os produz naturalmente se `:` entrar no conjunto — cuidado, `:` **não** é char de
  operador no PG; `::` é um token especial. Manter `::`/`:=`/`=>` como casos explícitos antes do
  munch, ou tratar `:` fora do conjunto e reconhecer `::` isoladamente.)
- Comentários: `--` e `/* */` já são consumidos **antes** do estágio de operador — confirmar que o
  munch não rouba o `-` de um `--` (a ordem atual trata comentário primeiro; manter essa ordem).
- Regra PG do `+`/`-` final: um operador com múltiplos chars que termina em `+` ou `-` só é válido
  se contiver ao menos um de `~ ! @ # % ^ & | ? \``. Para um **formatter** (não um parser), o mais
  seguro e simples é **preservar o texto do operador como veio** (munch puro) e não tentar validar —
  nunca corrompe. Documentar que não validamos semântica.

**`needsSpace` (render.ts):** hoje espaça em volta de `::`, `->`, `->>`. Revisar para que **todo**
token `operator` receba o espaçamento binário padrão (um espaço de cada lado), exceto os já-especiais
(`::`, `->`, `->>` sem espaço). Operadores como `@>`, `&&`, `~*` são binários → um espaço de cada
lado (`data @> '{}'`). Conferir o unário (`-1`, `+1`) — já funciona hoje? testar.

**Alvos (astronomia):**
```
select id
  from observation
 where metadata @> '{"confirmed": true}'
   and tags && array['transit', 'eclipse']

select data #>> '{position,ra}' as right_ascension
  from observation

select name
  from star
 where spectral_class ~* '^g'
```

**Casos YAML novos:** um arquivo `operators.yaml` — containment JSONB (`@>`,`<@`), path (`#>`,`#>>`),
existência (`?`,`?|`,`?&`), regex (`~`,`~*`,`!~`,`!~*`), array (`&&`), bit (`<<`,`>>`), e confirmar
que os já-ok (`::`, `->`, `->>`, `||`, `<>`, `>=`) continuam. **Idempotência** obrigatória.

**Arquivos:** `tokenizer.ts` (munch), `render.ts` (`needsSpace`), talvez `keywords.ts` (nada).
**Risco:** médio — mexe no lexer, base de tudo. Rodar a suíte inteira (regressão).

---

## Fase 2 — Palavras que não iniciam cláusula: `IS DISTINCT FROM`, `FOR UPDATE`, `WITH ORDINALITY` (A2, A3, A5) ✅ CONCLUÍDA (2026-07-17)

> **Feito.** Guards em `isClauseBoundary` (`segmenter.ts`), estilo `pendingBetween`:
> **A2** `FROM` precedido de `DISTINCT` não abre cláusula (`is [not] distinct from` fica inteiro);
> **A5** `WITH` seguido de `ORDINALITY` não abre CTE (fica no item do `from`);
> **A3** `FOR` vira cláusula própria (kind `generic`, entra no rio como head `for`, igual `limit` —
> **decisão do usuário: opção A, no rio**), consumindo os keywords de força (`NO`/`KEY`/`UPDATE`/
> `SHARE`) para dentro do head, de modo que o `UPDATE`/`SHARE` interno nunca é reexaminado como âncora
> DML; o resto (`OF ...`, `NOWAIT`/`SKIP LOCKED`) flui no body numa linha. `keywords.ts` ganhou
> `FOR`/`OF`/`NO`/`KEY`/`SHARE`/`NOWAIT`/`SKIP`/`LOCKED`/`ORDINALITY` (casing). Casos: `locking.yaml`
> (5), `from_functions.yaml` (1, será estendido na Fase 4), 3 novos em `where.yaml`. Conferido:
> `substring(name from 1 for 3)` (FOR/FROM em depth>0 não ancoram) e casing upper. Suíte 233 verde,
> `tsc`/`lint` limpos.

Três instâncias da mesma causa-raiz: uma keyword é cortada como âncora fora de contexto. Podem ir
juntas (pequenas, no `segmenter.ts`/`keywords.ts`).

### A2 — `IS [NOT] DISTINCT FROM`
Hoje: `where a is distinct` / `from b` — o `FROM` do `DISTINCT FROM` vira cláusula. Igual à proteção
do `BETWEEN ... AND ...` (o `AND` não é conector). Proteger: quando `FROM` é precedido por
`DISTINCT` (que por sua vez segue `IS` ou `IS NOT`), **não** é clause-starter. Implementar no
`segmentClauses` (um lookback, como o `pendingBetween`). Alvo:
```
select id
  from planet
 where discovered_at is distinct from cataloged_at
```

### A3 — `FOR UPDATE` / `FOR SHARE` (locking clause)
Hoje: `where status_id = 1 for` / `update` — `UPDATE` (DML anchor) é cortado. `FOR NO KEY UPDATE`
vira `for no key` / `update`. Precisa: reconhecer a **locking clause** como cláusula trailing
própria (como `limit`/`offset`), consumindo `FOR (UPDATE | SHARE | NO KEY UPDATE | KEY SHARE)
[OF t, ...] [NOWAIT | SKIP LOCKED]` inteira; dentro dela `UPDATE`/`SHARE` **não** são âncoras.
Provável: adicionar `FOR` como clause-starter que engole a frase de lock (`renderGenericClause`,
1 linha), e blindar `UPDATE`/`SHARE` quando precedidos por `FOR`/`NO KEY`/`KEY`. Alvo:
```
select id
  from observation
 where is_confirmed = true
   for update of observation skip locked
```
(Decisão de layout a travar: o `for update ...` entra no rio como cláusula? Recomendo **sim**,
`for` como head — alinha sob o rio, igual `limit`.)

### A5 — `WITH ORDINALITY`
Hoje: `from unnest(array[...])` / `with ordinality as t(...)` — `WITH` vira CTE. `WITH ORDINALITY`
é modificador de from-item. Proteger: `WITH` seguido de `ORDINALITY` não abre CTE (fica no item do
`from`). Alvo:
```
select t.val,
       t.ord
  from unnest(array[1, 2, 3]) with ordinality as t(val, ord)
```

**Arquivos:** `segmenter.ts` (`segmentClauses` lookbacks), `keywords.ts` (`FOR`, `ORDINALITY`,
`SHARE`, `NOWAIT`, `SKIP`, `LOCKED`), `layout.ts` (locking clause via genérico). **Casos:** um
`locking.yaml`/`misc.yaml` ou dentro de `where.yaml`.

---

## Fase 3 — `INSERT ... ON CONFLICT` (upsert) (A4) ✅ CONCLUÍDA (2026-07-17)

> **Feito.** `isClauseBoundary` (`segmenter.ts`) consome `on conflict [target] [where ...] do
> (nothing | update)` como **um head só** (kind `generic`, `on` entra no rio), varrendo até o `DO`
> em depth 0 e incluindo `do` + a ação — assim o `UPDATE` interno nunca vira âncora DML, e o target
> `(cols)` + o `where` de índice parcial pegam carona na linha do `on conflict`. O `set` do
> `do update` e o `where` final do update ancoram como cláusulas de rio normais abaixo.
> **Decisão do usuário: opção A, no rio.** `keywords.ts` ganhou `CONFLICT`/`DO`/`NOTHING`/
> `CONSTRAINT` (o `DO` precisa ser keyword para a varredura; `CONFLICT` keyword dá o espaço antes do
> `(` de graça via `renderTokens`). `EXCLUDED` ficou como identificador (`excluded.col`, preservado).
> 6 casos novos em `dml.yaml` (do update / do nothing ±target / on constraint / multi-set / partial
> where + update where). Conferido: casing upper, `returning` depois (comportamento de rio
> pré-existente), e regressão do join `ON` (não-conflict). Suíte 245 verde, `tsc`/`lint` limpos.

Hoje (corrompido):
```
insert into orders (id, total)
values (1, 100) on conflict(id) do
update
   set total = excluded.total
```
`on conflict` glued como `conflict(id)`, `do update` corta `UPDATE`. Upsert é padrão em PG.

**Alvo (astronomia):**
```
insert into planet (id, mass)
values (1, 5.9)
    on conflict (id) do update
   set mass = excluded.mass

insert into planet (id)
values (1)
    on conflict do nothing
```
Precisa: `ON CONFLICT` como cláusula própria (rio: `on conflict` head), com target opcional
`(cols)` ou `ON CONSTRAINT name`, `WHERE` de índice parcial, e ação `DO NOTHING` | `DO UPDATE SET
... [WHERE ...]`. O `SET` do `DO UPDATE` reusa a lista de assignments (como o `set` do update). Um
espaço antes do `(` do conflict-target (`ON CONFLICT` é keyword, não função — mesma tática do
`renderInsertClause`). **Decisão de layout a travar com o usuário** (preview): `on conflict`/`do
update`/`set` no rio vs. bloco. Recomendo rio (consistente com DML).

**Arquivos:** `keywords.ts` (`CONFLICT`, `CONSTRAINT`, `DO`, `NOTHING`, `EXCLUDED`), `segmenter.ts`
(cláusulas `on conflict`, `do update`), `layout.ts` (render + espaço antes do target). **Casos:**
estender `dml.yaml`.

---

## Fase 4 — Cobertura das features que já funcionam (B1–B3, B5–B16) ✅ CONCLUÍDA (2026-07-17)

> **Feito (só testes, sem mudança de runtime).** Sondei as 16 features com `format()`, revisei cada
> saída (todas corretas e idempotentes) e capturei golden cases via `regen-format-cases`. Novos
> arquivos: `select.yaml` (B1 distinct/distinct on, B2 over + window, B3 filter/within group, B14
> frame), `groupby.yaml` (B6 rollup/cube/grouping sets), `limit.yaml` (B8 limit/offset/fetch),
> `expressions.yaml` (B11 cast/extract/substring/trim/position, B12 array/subscript/row/at time zone,
> B16 multi-col IN). Estendidos: `lists.yaml` (B7 nulls first/last + using op), `joins.yaml` (B9
> using/natural/cross/full outer), `from_functions.yaml` (B10 generate_series/unnest/coldef + B15
> tablesample), `dml.yaml` (B13 update…from/delete…using + B15 create view/values standalone),
> `cte.yaml` (B5 with recursive). 38 casos novos; suíte **321 verde**, `tsc`/`lint` limpos. Também
> corrigi um bug na skill `regen.mjs` (usava `.default`; js-yaml 5.x é named export). **Cosmético B6
> resolvido (decisão do usuário: uniformizar):** `SETS` virou keyword, então `grouping sets (…)` sai
> com espaço igual `rollup (…)`/`cube (…)`; golden do `groupby.yaml` atualizado (commit à parte).

**Sem mudança de código** (a não ser cosmético mínimo — ver abaixo). Só **capturar golden cases**
para travar o comportamento atual como guard-rail. Usar a skill `regen-format-cases` (gerar o
`expected` real, revisar, colar). Agrupar por assunto (a taxonomia proposta em
`_work/reorganize-examples-prompt.md`):

- `select.yaml` (novo ou dentro de alignment): `DISTINCT`, `DISTINCT ON`, window `OVER`, cláusula
  `WINDOW`, `FILTER`, `WITHIN GROUP`, window frame.
- `setops.yaml` (novo): `UNION`/`UNION ALL`/`INTERSECT`/`EXCEPT`, `WITH RECURSIVE` — **ver Fase 5**
  (decisão de rio) antes de congelar.
- `groupby.yaml` ou `lists.yaml`: `ROLLUP`/`CUBE`/`GROUPING SETS`, `NULLS FIRST/LAST`, `USING op`.
- `limit.yaml`/`misc`: `FETCH FIRST`, `OFFSET`/`LIMIT`, `TABLESAMPLE`, `FOR UPDATE` (após Fase 2).
- `joins.yaml`: `USING`, `NATURAL`, `CROSS`, `FULL OUTER`.
- `from-functions.yaml`: `generate_series`, `unnest`, `WITH ORDINALITY` (após Fase 2), coldef
  `f() as x(a int, b text)`.
- `expressions.yaml`: `CAST`/`::`, `EXTRACT`, `SUBSTRING FROM FOR`, `TRIM`, `POSITION IN`, `ARRAY`,
  subscript, `ROW`, `AT TIME ZONE`, multi-col `IN`.
- `dml.yaml`: `UPDATE ... FROM`, `DELETE ... USING`, `CREATE VIEW AS SELECT`, `VALUES` standalone.

**Cosmético opcional (decidir):** `group by grouping sets((a),(b))` sai sem espaço antes do 1º `(`
(`sets(` glued como call), enquanto `rollup (` tem espaço. Uniformizar (`GROUPING`/`SETS`/`ROLLUP`/
`CUBE` como keywords que mantêm espaço antes de `(`). Baixa prioridade.

---

## Fase 5 — Decisão: set operations e o rio (B4) ✅ CONCLUÍDA (2026-07-17)

> **Decisão do usuário: MANTER NO RIO** (rejeitada a alternativa off-river coluna 0). Os operadores
> `union`/`union all`/`intersect`/`except` continuam ancorando cláusula e participando do K, então
> `union all` fica em leading 1 (`union` no rio, `all` depois) e um `intersect` (9 chars) empurra os
> selects pra direita. **Sem mudança de runtime** — só capturei o comportamento atual como golden em
> `setops.yaml` (6 casos: union / union all / intersect / except / three-way / union com where+order).
> Suíte 333 verde, `tsc`/`lint` limpos.

Hoje `UNION`/`INTERSECT`/`EXCEPT` são clause-starters e **entram no rio**, então `intersect`
(9 chars) empurra `select`/`from` para a direita:
```
   select id
     from a
intersect
   select id
     from b
```
Isso é análogo ao que resolvemos com o `WITH` (D2/2026-07-16: `with` foi para a **coluna 0**, fora
do rio). **Proposta a travar com o usuário:** tratar os operadores de conjunto como *comandos
off-river* na **coluna 0** (como `with`), para que cada `SELECT` do union comece no seu próprio rio
(coluna 0) e o `union`/`intersect`/`except` fique solto em 0:
```
select id
  from a
union
select id
  from b
```
Precisa preview/AskUserQuestion antes de mexer. Depois, congelar em `setops.yaml`. **Arquivos** (se
aprovado): `layout.ts` (excluir set-ops do cálculo de `K`, `leading = base`), como já é feito p/ CTE.

---

## Fase 6 (opcional) — `MERGE` (A6) 🔴 grande, PG 15+

`MERGE INTO t USING src ON cond WHEN MATCHED THEN UPDATE SET ... / DELETE / WHEN NOT MATCHED THEN
INSERT (...) VALUES (...)`. Hoje sai completamente mangled. É a maior das features (várias sub-
cláusulas `WHEN ... THEN ...`) e a mais nova/menos comum. **Recomendo por último** ou fora de escopo
até haver demanda. Se for fazer, precisa: `MERGE`/`MATCHED`/`WHEN`/`THEN` como âncoras próprias,
cada `WHEN ... THEN <ação>` numa unidade, ações reusando `update set`/`insert`/`delete`.

---

## Ordem sugerida

**1 (operadores) → 2 (IS DISTINCT/FOR UPDATE/ORDINALITY) → 3 (ON CONFLICT) → 4 (cobertura) →
5 (decisão set-ops) → 6 (MERGE, opcional).**

Racional: Fase 1 tem o maior retorno (corrompe JSONB, universal) e é pré-requisito de bons testes de
expressão; 2 e 3 fecham as corrupções de keyword-como-âncora; 4 trava tudo que já funciona; 5 é uma
decisão estética isolada; 6 é grande e adiável.

## Regras do processo (iguais às fases anteriores)
1. Ler `.claude/rules/formatting-spec.md` + o módulo relevante antes de mexer.
2. **Travar o layout com o usuário** (preview/AskUserQuestion) antes de implementar cada fase que
   tenha decisão estética (2-A3, 3, 5).
3. **YAML-first, sempre — regra inegociável (ver seção acima):** todo cenário tocado, de correção
   ou de feature-que-já-funciona, **tem** de virar caso(s) de regressão em `test/cases/*.yaml`. Caso
   que falha primeiro (skill `add-formatter-behavior`); gerar `expected` via gerador no **diretório
   do projeto** (`regen-format-cases`, js-yaml 5.x → `import { dump }`), revisar contra o alvo,
   colar, apagar o gerador. **Exemplos no dicionário de astronomia.** Cobrir os vizinhos do bug e
   reafirmar os que já funcionavam. Uma fase só está "concluída" com seus casos verdes.
4. Implementar mantendo **idempotência** e **nunca corromper** (na dúvida, passthrough/inline).
5. `npx tsc --noEmit` + `npm test` + `npm run lint`.
6. Doc: `README.md` (Known limitations), `.claude/rules/roadmap.md`, `formatting-spec.md`,
   `CLAUDE.md`, este plano.
7. Branch → commit (rodapé `Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>`)
   → `--ff-only` na main → push via
   `git -c credential.helper='!gh auth git-credential' push https://github.com/nbluis/riverleaf-sql-formatter.git main`.
8. Runtime mudou (fases 1-3, 5-6) → re-package + re-install o vsix (skill `build-install-vsix`).
   Fase 4 é só testes → sem re-package. Uma fase por commit.

## Interação com os outros planos em `_work/`
- `reorganize-examples-prompt.md` (taxonomia por assunto) e `rewrite-examples-prompt.md` (dicionário)
  são **independentes**. Sugestão: reorganizar/reescrever **antes** da Fase 4, para os casos novos já
  nascerem na taxonomia final e no dicionário. As Fases 1-3 (código) independem disso.
