# Prompt — reescrever todos os exemplos usando o dicionário de astronomia

> Cole o bloco abaixo (a partir de "TAREFA") numa nova sessão do Claude Code, no repositório
> `riverleaf-sql-formatter`. Objetivo: trocar **todos** os exemplos de SQL do repo por nomes do
> dicionário astronômico, sem mudar nem a estrutura dos exemplos nem o comportamento do formatter.

---

TAREFA: reescrever **todos os exemplos de SQL do projeto** usando exclusivamente o dicionário
astronômico, de forma que nomes reais (orders, products, customers, order_items, payments,
employees, salon, organization, staging_*, monthly_*_summaries, vip_customers, etc.) **sumam
completamente do código**. Isto é um refactor **só de nomes/literais** — a estrutura de cada exemplo
e o comportamento do formatter não mudam.

LEIA PRIMEIRO (nesta ordem):
1. `.claude/rules/example-dictionary.md` — o vocabulário. É a fonte única de nomes.
2. `.claude/rules/testing.md` — fluxo de testes e a regra "gere `expected` pelo formatter, nunca
   conte espaços à mão". Skill útil: `regen-format-cases`.
3. `CLAUDE.md` e `.claude/rules/formatting-spec.md` — para entender o layout (necessário ao revisar
   os `expected` regenerados).

ESCOPO (todos os arquivos com SQL de exemplo):
- `test/cases/postgres.yaml`, `test/cases/case.yaml`, `test/cases/dml.yaml`,
  `test/cases/subquery.yaml`, `test/cases/lateral.yaml` — inputs **e** expected.
- `README.md` — os blocos "Before/After", os trechos em "Rules", o exemplo de caso YAML na seção
  "Adding formatting cases", e a seção "Known limitations".
- Markdowns com SQL embutido: `.claude/rules/formatting-spec.md`, `CLAUDE.md`,
  `.claude/rules/roadmap.md`, `.claude/rules/testing.md` (o exemplo de schema de caso). Troque
  qualquer identificador real citado em prosa/exemplo por um nome do dicionário; mantenha os nomes
  de símbolos do código (funções/métodos como `renderListClause`, flags, etc.) intactos.

REGRAS DE REESCRITA:
1. **Substitua por papel, não por grafia.** Para cada objeto, identifique o papel (entidade
   principal, linhas-filhas, tabela juntada, lookup/tipo, sumário por período, medida numérica,
   contagem, texto, FK, data, flag, literal de status/classificação) e escolha a palavra do
   dicionário. Use o **primeiro nome de cada lista** como padrão e desça na lista quando precisar de
   um segundo/terceiro objeto do mesmo tipo (ex.: duas tabelas juntadas → `planet` + `star`).
2. **Mantenha a estrutura idêntica.** Mesmo número de colunas, joins, condições, CTEs, tuplas,
   aninhamento e comentários. Só mudam **nomes e literais** — nunca o que o exemplo demonstra. Não
   mude `options`, `idempotent`, nem o número de casos.
3. **Consistência global.** Reescreva tudo com o mesmo mapeamento (mesmo papel → mesmo nome/alias em
   todos os arquivos), para os exemplos parecerem um só mundo. Anote seu mapeamento papel→nome num
   arquivo do **scratchpad** (não commite) e siga-o até o fim.
4. **Aliases** vêm da seção Aliases do dicionário (`p`, `s`, `ms`, `obs`, ...). Nada de aliases sem
   significado (`a`, `b`, `t`).
5. **Comentários dentro dos exemplos** (os `-- ...` que exercitam o formatter) devem continuar
   existindo e no mesmo lugar — apenas reescreva o texto deles com vocabulário do tema.
6. **`description` de cada caso**: mantenha, só ajuste o texto se ele citar um nome real (para não
   reintroduzir nomes de negócio) — preserve o sentido do que o caso verifica.
7. **Nunca conte espaços à mão.** Para cada caso, escreva o `input` reescrito, rode o formatter para
   gerar o `expected`, **revise** contra o layout travado e cole. Gere via um script no **diretório
   do projeto** (o scratchpad não resolve `node_modules`; js-yaml 5.x usa `import { dump }`), ou use
   a skill `regen-format-cases`. Apague o gerador ao terminar. Vale para os blocos do README também
   (regenere a saída formatada a partir do input reescrito).
8. **Não toque no runtime** (`src/**`) nem nas regras de formatação. Se algum `expected` mudar de
   forma além da troca de nomes, pare e investigue — deve ser só nome/largura de coluna.

VERIFICAÇÃO (a cada fase e no fim):
- `npx tsc --noEmit` && `npm test` (todos verdes, **mesma contagem** de testes de antes; idempotência
  incluída) && `npm run lint`.
- Guard-rail final — nenhum nome real deve restar. Rode e garanta saída vazia:
  `grep -rinE "orders|order_items|order_services|products|customers|employees|payments|salon|organization|vip_customers|staging_|monthly_[a-z_]*summaries|first_name|last_name|total_amount|unit_price" test/ README.md .claude/rules/*.md CLAUDE.md`
  (a única ocorrência tolerável de "real business" é o enunciado da regra em
  `example-dictionary.md`.)

PROCESSO (uma fase por commit; sugestão de fatiar por arquivo):
1. Fase por arquivo (ou grupo pequeno): reescrever inputs → regenerar/revisar expected → verde.
2. `git checkout -b <branch>` → commit com rodapé
   `Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>`
   → `git checkout main && git merge --ff-only <branch>` → push:
   `git -c credential.helper='!gh auth git-credential' push https://github.com/nbluis/riverleaf-sql-formatter.git main`
3. **Não** precisa re-empacotar o vsix (mudança só de exemplos/docs, sem runtime).

RESULTADO ESPERADO: mesma quantidade de testes, todos verdes e idempotentes; nenhum nome real no
repo; todos os exemplos escritos no vocabulário astronômico e visualmente coerentes entre si.
