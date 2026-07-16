# Plano — quebra por regra, não por largura (mudança estrutural)

> Documento de trabalho, escrito em **2026-07-16** após concluir as fases 1–12 (`main` em `a406f4b`,
> 144 testes). **Será implementado em outra sessão.** Idioma de código/doc/testes: **inglês**;
> este rascunho pode ficar em PT.
>
> ## ✅ DECISÕES TRAVADAS com o usuário (2026-07-16, via preview)
> - **D-a + D-b** — **todas** as listas de cláusula quebram uma por linha quando há **>1 item**:
>   `select`, `group by`, `order by`, `from` (com vírgula). 1 item → inline.
> - **D-c** — `where`/`having` sempre quebram quando há **>1 condição** (RIVER); um grupo `( )` com
>   >1 termo **sempre expande** (BLOCK). 1 condição → inline.
> - **D-d** — 1 item / 1 condição **sempre fica inline** (nada a quebrar).
> - **D-e**:
>   - **B1** (lista de colunas do `insert`) → **sempre quebra >1** (são colunas).
>   - **B2** (valores dentro de uma tupla `values`) → **cresce** (1 linha; **remover** o wrap B2 da
>     fase 12). Multi-row continua quebrando 1 tupla por linha.
>   - **C2** (`when ... then` longo) → **cresce** (1 linha; **remover** o wrap C2 da fase 8).
> - **D-f / F** — **remover completamente** `fits()` / `maxWidth` do `layout.ts` **e** a setting
>   `riverleaf.maxLineLength` + fallback `editor.rulers` (`types.ts`, `extension.ts`, `package.json`,
>   `format.ts`). A largura deixa de existir no formatter.
>
> Regra geral: **quebra por contagem (>1), nunca por largura**; nível de expressão só cresce.

## Objetivo (pedido do usuário)

Mudar a filosofia do formatter:

- Hoje: uma lista/condição **fica em uma linha se couber** (`maxLineLength`) e só **quebra quando
  não cabe**.
- **Novo**: o **tamanho da linha não importa mais**. O código **quebra quando a *regra* manda** (ex.:
  >1 coluna no `select` → sempre quebra, uma por linha) e **só cresce quando o encadeamento é grande
  de verdade** (uma expressão/condição única e longa fica numa linha e cresce — não há mais "wrap
  para caber").

Pedido explícito: **colunas do `select` sempre quebram** (não só quando não cabem). O resto da
estrutura deve ser revisto para seguir a mesma lógica de "quebra por regra".

## Onde a largura decide HOJE (tudo em `layout.ts`, via `fits()`)

`fits(line) = line.length <= maxWidth`, `maxWidth = options.maxLineLength` (default 80, ou
`editor.rulers[0]`). Seis pontos:

1. **L230 `renderListClause`** — lista (`select`/`from`/`group by`/`order by`) fica inline se
   `items.length === 1 || (!alwaysBreak && fits(full))`. `set`/`values` já passam `alwaysBreak`.
2. **L508 `renderBoolClause`** — `where`/`having`: inline se `!...&& fits(full)`; senão RIVER.
3. **L187 `emitTerm`** — grupo `( ... )` booleano fica inline se `!nodeHasComments && fits(inline)`;
   senão expande em BLOCK. (Um grupo só existe quando tem **>1 termo** — `parseBoolExpr`.)
4. **L420 `renderCaseSegment`** — `when ... then` quebra antes do `then` só se `!fits` (C2, fase 8).
5. **L302 `tupleNeedsWrap`** / **L596 `renderInsertClause`** — tupla `values` larga e lista de
   colunas do `insert` quebram só se `!fits` (B1/B2, fase 12).

Config: `types.ts` (`maxLineLength: 80`), `extension.ts` (resolve de `riverleaf.maxLineLength` →
`editor.rulers[0]` → 80), `format.ts` passa `opts.maxLineLength` ao `Layout`, `Layout.maxWidth`.

## Modelo NOVO proposto (três categorias)

1. **Listas de cláusula (vírgula no nível 0)** → **quebram uma por linha quando há >1 item**;
   1 item fica inline. (`select`, `group by`, `order by`, `from` com vírgula.) Estilo de quebra já
   existe (`alwaysBreak`): 1º item na linha da keyword, resto alinhado no `operandCol`, vírgula à
   direita.
2. **Listas de condição booleana** → **quebram uma por linha quando há >1 condição** (RIVER);
   1 condição fica inline. (`where`/`having`; `join` ON já faz isso; grupo `( )` com >1 termo sempre
   expande em BLOCK.)
3. **Nível de expressão (dentro de um item/condição)** → **nunca quebra por regra; só cresce**.
   (args de função `coalesce(a,b,c)`, lista `in (1,2,3)`, uma coluna/condição longa, e — conforme a
   decisão E2/E3 abaixo — a lista de colunas do `insert`, os valores de uma tupla `values`, e um
   `when ... then` longo.)

`maxLineLength` / `fits()` / `maxWidth` **saem das decisões de quebra**. (Ver decisão F sobre remover
de vez ou manter como no-op.)

## Construção-por-construção (ANTES real → DEPOIS proposto)

> "ANTES" gerado com o formatter atual (2026-07-16). "DEPOIS" é a proposta — **a travar** (ver
> Decisões). Todos os exemplos assumem que hoje "cabem" em 80, por isso ficam inline hoje.

### select (PEDIDO — sempre quebra >1) 🔒 travar D-a
ANTES:
```
select first_name, last_name, email
  from customers
```
DEPOIS:
```
select first_name,
       last_name,
       email
  from customers
```
`select id from orders` (1 coluna) **continua** `select id` (nada a quebrar).

### group by / order by (recomendo: sempre quebra >1) 🔒 D-b
ANTES `group by dept, region` → DEPOIS:
```
 group by dept,
          region
```

### from com vírgula (recomendo: sempre quebra >1) 🔒 D-b
ANTES `from orders a, customers b` → DEPOIS:
```
  from orders a,
       customers b
```

### where / having (recomendo: sempre quebra >1 condição) 🔒 D-c
ANTES:
```
 where status_id = 1 and total > 0
```
DEPOIS:
```
 where status_id = 1
   and total > 0
```
`where status_id = 1` (1 condição) **continua** inline.

### grupo booleano `( )` (recomendo: sempre expande, pois só existe com >1 termo) 🔒 D-c
ANTES:
```
 where (status_id = 1 or status_id = 2) and total > 0
```
DEPOIS:
```
 where (
         status_id = 1
      or status_id = 2
       )
   and total > 0
```

### insert lista de colunas (B1) ✅ TRAVADO — sempre quebra >1
```
insert into t (a,
               b,
               c)
values (1, 2, 3)
```
(São colunas → mesma regra do select. Mantém/adapta `renderInsertClause`: quebra por contagem, não
por `fits`.)

### values (B2) ✅ TRAVADO — cresce (remover wrap)
Multi-row **já** quebra 1 tupla por linha (regra: >1 linha) — isso fica. O **interior de uma tupla**
é nível de expressão → **não quebra**: `values (1, 2, 3)` fica em 1 linha e cresce.
**Remover** `tupleNeedsWrap`/`renderTupleBroken` (parte da tupla) e o `hasWideTuple` do
`renderListClause` (fase 12/B2).

### case `when ... then` longo (C2) ✅ TRAVADO — cresce (remover wrap)
`when ... then ...` fica em 1 linha e cresce. **Remover** o ramo de wrap por largura em
`renderCaseSegment` + o helper `findThen` (fase 8/C2).

### Não muda
`join` (cada join já é uma cláusula; ON multi-condição já quebra), múltiplas CTEs (já expandem),
`case` na lista (já expande), subqueries (já expandem), comentários (placement já é por regra),
`set` (já `alwaysBreak`).

## Decisões (TRAVADAS 2026-07-16)

| id | Decisão | ✅ Travado |
|----|---------|-----------|
| D-a | `select` sempre quebra >1 coluna (1 coluna inline) | **Sim** |
| D-b | `group by`/`order by`/`from`(vírgula) sempre quebram >1 | **Sim** |
| D-c | `where`/`having` sempre quebram >1 condição; grupo `( )` sempre expande | **Sim** |
| D-d | 1 item/condição **sempre fica inline** (nunca quebra sozinho) | **Sim** |
| D-e | B1 lista de colunas do `insert` | **Sempre quebra >1** |
| D-e | B2 valores dentro de uma tupla `values` | **Cresce** (remover wrap) |
| D-e | C2 `when ... then` longo | **Cresce** (remover wrap) |
| D-f/F | `maxLineLength`/`fits()`/`maxWidth` + setting | **Remover tudo** |

## Config (`maxLineLength`) — F ✅ TRAVADO: remover tudo

- Remover `fits`/`maxWidth` do `Layout` (o construtor deixa de receber largura → `new Layout(opts)`).
- Remover a **setting** `riverleaf.maxLineLength` + fallback `editor.rulers[0]`: `types.ts`
  (`FormatOptions.maxLineLength` e o default), `extension.ts` (`resolveMaxLineLength`, leitura de
  `rulers`), `package.json` (`contributes.configuration` → `riverleaf.maxLineLength`), `format.ts`
  (não passa mais largura). A largura deixa de existir no formatter.

## Impacto nos testes (o que muda)

Vão mudar **vários** goldens. Mapear e regerar (gerador no diretório do projeto, revisar contra o
layout travado):
- `postgres.yaml`: **"short select stays on one line"** (vira multi-linha), **"long select breaks"**
  (remover `maxLineLength: 30`; segue quebrando), **golden** `maxLineLength: 100` (remover opção;
  select é 1 coluna → inalterado; where/join já quebravam), **D1** `maxLineLength: 40` (remover
  opção; grupo já expande por regra), **"leading comment + long select"** `maxLineLength: 60`
  (remover opção; segue quebrando), **"inline comment on last where condition stays inline when it
  fits"** (agora com 2 condições **sempre quebra** — reescrever), o titulo "even when it fits" do
  join multi-condição (texto).
- `case.yaml`: **"long when ... then breaks"** e **"only the long when wraps"** (dependem de C2 —
  mudam conforme D-e).
- `dml.yaml`: **B1/B2** (`test/cases/dml.yaml` fases 12) mudam conforme D-e; "single tuple stays" /
  "single assignment stays" continuam (1 item).
- Qualquer caso com 2+ colunas/condições que hoje cabe em 80 vira multi-linha.
- **Remover `maxLineLength` do schema de `options`** dos casos (se F=remover) — buscar todos.

## Idempotência
Fica **mais fácil**: quebra é determinística pela estrutura (contagem), sem depender de largura. O
runner já checa `format(format(x)) === format(x)` por caso. Revalidar todos.

## Esboço de implementação
1. `layout.ts`:
   - `renderListClause`: quebra quando `items.length > 1` (some o ramo `fits`); `alwaysBreak` deixa
     de ser necessário como distinção (todas as listas quebram) — simplificar a assinatura.
   - `renderBoolClause`: quebra quando `terms.length > 1` (some `fits`); 1 termo inline.
   - `emitTerm`: grupo sempre expande (remove o ramo inline por `fits`).
   - `renderCaseSegment` / `tupleNeedsWrap` / `renderInsertClause`: conforme D-e (remover os ramos
     `fits`, ou trocar por contagem).
   - Remover `fits` e `maxWidth` (e o parâmetro do construtor).
2. `format.ts`: `new Layout(opts)` sem largura.
3. `types.ts` / `extension.ts` / `package.json`: conforme decisão F.
4. Regerar/atualizar todos os goldens afetados; `npx tsc --noEmit` + `npm test` + `npm run lint`.
5. Docs: `README.md`, `.claude/rules/roadmap.md`, `formatting-spec.md`, `CLAUDE.md`, este plano.
   - Em especial: reescrever a seção "The river" / "List clauses" / "RIVER vs BLOCK" para descrever
     a regra por contagem, e a seção de config; remover menções a `maxLineLength`/"fits"/"width".

## Progresso da implementação

- **R1 — listas por contagem + B1** ✅ (feito). `renderListClause` quebra quando `items.length > 1`
  (removidos o ramo `fits` e o parâmetro `alwaysBreak`; `set`/`values` são listas comuns).
  `renderInsertClause` quebra a lista de colunas por contagem (`cols.length > 1`, sem `fits`).
  Goldens regenerados: `postgres.yaml` (select/from/group by multi-item quebram, +2 casos novos:
  single-column inline e from com vírgula, removida a duplicata `maxLineLength: 60`), `dml.yaml`
  (colunas do insert quebram nos 5 casos), `subquery.yaml` (selects internos multi-coluna quebram).
  `tupleNeedsWrap`/`hasWideTuple` (B2) e `renderCaseSegment`/`findThen` (C2) ainda ativos até R3;
  `fits`/`maxWidth`/config `maxLineLength` ainda presentes até R3. 146 testes.
- **R2 — booleanos por contagem** ✅ (feito). `renderBoolClause` quebra quando `terms.length > 1`
  (removido o ramo `fits`); 1 condição fica inline, mas um grupo (`hasGroup`) ou um atom com
  `case`/subquery força a expansão. `emitTerm` sempre expande o grupo (removido o ramo inline por
  `fits`). `renderOn` também expande um único grupo em ON (`hasGroup`). Goldens: `dml.yaml` (update
  where 2 condições quebra), `postgres.yaml` (comentário na última condição quando o where quebra;
  +2 casos: where 1 condição inline, where só-grupo expande). `fits`/`maxWidth`/config ainda
  presentes até R3. 150 testes.

## Ordem sugerida (fases, 1 commit cada)
1. **Fase R1** — listas por contagem: `select`/`group by`/`order by`/`from` quebram >1 (D-a/D-b).
   Remover o ramo `fits` do `renderListClause` (quebra quando `items.length > 1`); `alwaysBreak` deixa
   de distinguir (todas quebram) — simplificar. B1: `renderInsertClause` quebra por contagem.
2. **Fase R2** — booleanos por contagem: `where`/`having` quebram >1 (D-c) e o grupo `( )` sempre
   expande (só existe com >1 termo). Remover `fits` de `renderBoolClause` e do ramo de grupo em
   `emitTerm`.
3. **Fase R3** — remover os wraps por largura que agora "crescem": B2 (`tupleNeedsWrap`/
   `renderTupleBroken`+`hasWideTuple`) e C2 (`renderCaseSegment` wrap + `findThen`). Depois remover
   `fits`/`maxWidth` do `Layout` e a config `maxLineLength` (D-f/F: `types.ts`, `extension.ts`,
   `package.json`, `format.ts`).
4. **Fase R4** — varredura final: regerar todos os goldens afetados, remover `maxLineLength` dos
   `options` dos casos, docs (5 arquivos), revalidar idempotência + `tsc`/`lint`, re-package vsix.

## Regras do processo (iguais às fases anteriores)
1. Decisões (D-a…D-f, F) **já travadas** (2026-07-16, ver topo). Implementar direto na próxima sessão.
2. YAML-first; gerar `expected` via gerador no diretório do projeto (js-yaml 5.x `import { dump }`),
   revisar contra o layout travado, colar, apagar o gerador.
3. Implementar mantendo idempotência; nunca corromper.
4. `npx tsc --noEmit` + `npm test` + `npm run lint`.
5. Docs (os 5 arquivos). 6. Branch → commit (rodapé Co-Authored-By) → `--ff-only` main → push via
   `git -c credential.helper='!gh auth git-credential' push https://github.com/nbluis/riverleaf-sql-formatter.git main`.
7. Runtime mudou → re-package + re-install o vsix (`build-install-vsix`).
