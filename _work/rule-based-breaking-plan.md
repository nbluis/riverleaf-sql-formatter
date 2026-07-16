# Plano — quebra por regra, não por largura (mudança estrutural)

> Documento de trabalho, escrito em **2026-07-16** após concluir as fases 1–12 (`main` em `a406f4b`,
> 144 testes). **Será implementado em outra sessão.** Idioma de código/doc/testes: **inglês**;
> este rascunho pode ficar em PT.

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

### insert lista de colunas (B1) 🔒 D-e — decidir
- **Opção 1 (recomendo, consistente com "colunas quebram")**: sempre quebra >1 coluna.
  ```
  insert into t (a,
                 b)
  values (1, 2)
  ```
- **Opção 2**: nível de expressão → cresce (remove B1; volta a ficar em 1 linha).

### values (B2) 🔒 D-e — decidir
Multi-row **já** quebra 1 tupla por linha (regra: >1 linha) — isso fica. A dúvida é o **interior de
uma tupla**:
- **Opção 1 (recomendo)**: interior da tupla é nível de expressão → **não quebra** (remove B2);
  `values (1, 2, 3)` fica em 1 linha e cresce.
- **Opção 2**: sempre quebra os valores >1 (fica muito verboso: todo `values (1,2,3)` vira 3 linhas).

### case `when ... then` longo (C2) 🔒 D-e — decidir
Sem largura, o gatilho (fase 8) some.
- **Opção 1 (recomendo)**: remove C2 → `when ... then ...` fica em 1 linha e cresce.
- **Opção 2**: sempre quebra antes do `then` (todo when/then vira 2 linhas — muito verboso).

### Não muda
`join` (cada join já é uma cláusula; ON multi-condição já quebra), múltiplas CTEs (já expandem),
`case` na lista (já expande), subqueries (já expandem), comentários (placement já é por regra),
`set` (já `alwaysBreak`).

## Decisões a travar (no início da próxima sessão, via preview)

| id | Decisão | Recomendação |
|----|---------|--------------|
| D-a | `select` sempre quebra >1 coluna (1 coluna inline) | **Sim** (pedido) |
| D-b | `group by`/`order by`/`from`(vírgula) sempre quebram >1 | **Sim** (consistência) |
| D-c | `where`/`having` sempre quebram >1 condição; grupo `( )` sempre expande | **Sim** |
| D-d | 1 item/condição **sempre fica inline** (nunca quebra sozinho) | **Sim** |
| D-e | Destino de B1 / B2 / C2 (nível-expressão=cresce, ou always-break) | B1 = decidir; **B2 cresce**; **C2 cresce** |
| D-f | `maxLineLength`/`fits()`/`maxWidth` | **Remover** de `layout.ts`; ver config abaixo |

## Config (`maxLineLength`) — decisão F

Como "o tamanho da linha não importa mais":
- **Recomendo**: remover `fits`/`maxWidth` do `Layout` (construtor deixa de receber largura).
- Para a **setting** `riverleaf.maxLineLength` + fallback `editor.rulers[0]`: (a) remover de vez
  (`types.ts`, `extension.ts`, `package.json` contributes, `format.ts`); ou (b) manter a setting como
  **no-op deprecada** para não quebrar settings de usuários. Recomendo (a) — projeto pessoal pré-1.0.

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

## Ordem sugerida (fases, 1 commit cada)
1. **Fase R1** — `select` sempre quebra (D-a) + tornar a quebra de listas por contagem
   (`group by`/`order by`/`from`, D-b). Remover `fits` do `renderListClause`.
2. **Fase R2** — `where`/`having` + grupo `( )` por contagem (D-c). Remover `fits` do
   `renderBoolClause`/`emitTerm`.
3. **Fase R3** — B1/B2/C2 conforme D-e; remover `fits`/`maxWidth`/`maxLineLength` (D-f/F).
4. **Fase R4** — varredura final: docs, remover `maxLineLength` dos casos, revalidar idempotência.

## Regras do processo (iguais às fases anteriores)
1. **Travar as decisões (D-a…D-f, F) com o usuário via preview** antes de implementar.
2. YAML-first; gerar `expected` via gerador no diretório do projeto (js-yaml 5.x `import { dump }`),
   revisar contra o layout travado, colar, apagar o gerador.
3. Implementar mantendo idempotência; nunca corromper.
4. `npx tsc --noEmit` + `npm test` + `npm run lint`.
5. Docs (os 5 arquivos). 6. Branch → commit (rodapé Co-Authored-By) → `--ff-only` main → push via
   `git -c credential.helper='!gh auth git-credential' push https://github.com/nbluis/riverleaf-sql-formatter.git main`.
7. Runtime mudou → re-package + re-install o vsix (`build-install-vsix`).
