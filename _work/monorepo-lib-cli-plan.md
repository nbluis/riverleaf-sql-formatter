# Plano — monorepo com biblioteca npm + CLI

> Documento de trabalho, escrito em **2026-07-17**. Idioma de código/doc/testes: **inglês**
> (regra de ouro); este rascunho fica em PT. Exemplos de SQL (README, testes) usam o **dicionário
> de astronomia** (`.claude/rules/example-dictionary.md`).

## Status (atualizado 2026-07-20)

- **Fase 0 — decisões: TRAVADAS.** (1) lib npm `riverleaf-sql-formatter` sem escopo, extensão
  `nbluis.riverleaf-sql-formatter`; (2) bin `riverleaf`; (3) **ESM-only** + `.d.ts`; (4) build
  **tsc + esbuild** (sem dep nova); (5) versões **sincronizadas** (ambas `0.0.1`); (6) flags do CLI =
  conjunto completo (`--write/-w`, `--check`, `--keyword-case`, `--indent-size`, `--stdin`,
  `--help/-h`, `--version/-v`).
- **Fase 1 — workspaces: FEITA.** 341 testes verdes do novo layout, `tsc`/`lint`/`build:vscode`
  limpos. **Descoberta importante:** os nomes de (1) colidem (lib npm e id de marketplace querem ambos
  `riverleaf-sql-formatter`) e npm workspaces proíbem dois workspaces com o mesmo `name`. Resolução:
  **só `packages/core` é workspace npm**; `packages/vscode` é um pacote-irmão (não-workspace) cujo
  tooling de build/lint é *hoisted* da raiz. Assim ambos mantêm o nome `riverleaf-sql-formatter` (um no
  npm, outro via `publisher.name` no Marketplace) sem conflito. `workspaces: ["packages/core"]` (lista
  explícita, não glob `packages/*`).
- **Fase 2 — lib publicável: FEITA.** `packages/core/src/index.ts` reexporta `format`/`FormatOptions`/
  `DEFAULT_OPTIONS`. Build ESM-only: `build:js` (esbuild bundle → `dist/index.js`) + `build:types`
  (`tsc -p tsconfig.build.json --emitDeclarationOnly` → `dist/index.d.ts` + `dist/formatter/*.d.ts`).
  `package.json` do core: `type: module`, `exports` (`types`+`import`), `files: ["dist"]`,
  `sideEffects: false`, `engines.node >=16`, **zero `dependencies`**. Smoke test OK: `import { format }
  from 'riverleaf-sql-formatter'` resolve pelo symlink do workspace → `dist` e formata. Root ganhou
  `build`/`build:core`. `dist/` está no `.gitignore`.
- **Fase 3 — CLI: FEITA.** `packages/core/src/cli.ts` (shebang, zero-dep, parse de args na mão; globs
  ficam a cargo do shell). Flags: `-w/--write`, `--check`, `--keyword-case`, `--indent-size`, `--stdin`,
  `-h/--help`, `-v/--version`, mais `--flag=value` e `--` (resto vira arquivo). Modos: stdin→stdout,
  arquivos→stdout, `--write` in-place (só reescreve se mudou), `--check` (exit 1 se algo não formatado).
  Exit codes: 0 ok / 1 check falhou / 2 uso ou I/O. `bin.riverleaf → ./dist/cli.js`; build passou a
  bundlar 2 entries com `--splitting` (chunk compartilhado; shebang e `+x` preservados no `cli.js`).
  `version` lida de `../package.json` via `import.meta.url`. Testável sem build: `run`/`parseArgs`
  exportados, `readInput` injetável, auto-exec sob guarda `isMain`. **16 testes** novos
  (`test/cli.test.ts`) → suíte agora **357**. `npm pack --dry-run` mostra tarball limpo (só `dist/` +
  `package.json`). **Mudança de config:** `tsconfig.base.json` passou de `module: commonjs` para
  `module: esnext` + `moduleResolution: bundler` (necessário pro `import.meta`; mantém imports sem
  extensão do core; ambos os pacotes são bundlados por esbuild, então não afeta runtime).
- **Fase 4 — extensão consome o core: FEITA (falta só verificar no editor real — passo do usuário).**
  `extension.ts` importa `format` de `'riverleaf-sql-formatter'` (nome do pacote), resolvido pra
  `packages/core/src/index.ts` por **alias do esbuild** + **`paths` do tsconfig** (fonte, não `dist` —
  sem acoplamento de ordem de build; `git clone && npm install && build:vscode` funciona sem
  `build:core`). Bundle self-contained confirmado (0 refs bare ao pacote, lógica do formatter presente,
  buildado do zero). `icon.png` e `.vscodeignore` movidos pra `packages/vscode` (o `.vscodeignore` foi
  reescrito pro novo root do pacote). **README dividido:** o antigo README (listing da extensão) virou
  `packages/vscode/README.md` (hero via URL absoluta do GitHub raw, snippet de build local ajustado,
  seções de dev/contrib apontam pro repo); novo `README.md` na raiz = overview do monorepo (2 pacotes,
  uso lib/CLI/extensão, dev, contributing). `vsce ls` mostra o vsix limpo: `package.json` + `README.md`
  + `out/extension.js` + `assets/icon.png`. **Removido `baseUrl`** do tsconfig da vscode (deprecado no
  TS 6; `paths` funciona sem ele sob `moduleResolution: bundler`).
- **Falta na Fase 4:** usuário rodar `build-install-vsix` e testar Format Document num `.sql` no editor.
- **Fase 5 — preparação de publicação: FEITA.** `packages/core/README.md` (npm: uso via `import` +
  `npx riverleaf`, tabela de flags, exemplos do dicionário). `LICENSE` copiado pra `packages/core` e
  `packages/vscode` (npm e vsce incluem automaticamente). `prepublishOnly` no core =
  `typecheck && test && build`. `npm publish --dry-run -w core`: tarball limpo de **18 arquivos**
  (`dist/` + `README.md` + `LICENSE` + `package.json`), **sem warnings**. `vsce ls` da extensão = 5
  arquivos (`package.json` + `README.md` + `LICENSE` + `out/extension.js` + `assets/icon.png`).
  **Bug pego e corrigido:** o `bin` tinha `./dist/cli.js` e o npm 11 removia o bin no publish
  (`npm pkg fix` → `dist/cli.js`); e o guard `isMain` comparava `import.meta.url` (path real) com
  `argv[1]` (o **symlink** do `.bin`), então `npx riverleaf` não fazia nada — corrigido resolvendo o
  symlink com `realpathSync` (helper puro `isEntryPoint`, +3 testes → **360**). Validado com
  pack+install real num consumidor: bin roda, `import` ESM funciona.
- **Falta pro publish de fato (passos manuais do usuário):** `npm login` + `npm publish -w
  riverleaf-sql-formatter`; publicar a extensão no Marketplace (`vsce publish`, PAT); gravar o GIF de
  demo.
- **Próxima (opcional):** Fase 6 — CI (GitHub Actions: test+lint+typecheck+build em PR; publish em
  tag/release com secrets `NPM_TOKEN`/`VSCE_PAT`).

## Objetivo

Além do plugin do VS Code, publicar o formatador como um pacote npm que dá para usar de três formas:

1. **Importando** num projeto JS/TS — `import { format } from 'riverleaf-sql-formatter'`.
2. **Via CLI / npx** — `npx riverleaf-sql-formatter query.sql --write`.
3. (continua existindo) **como extensão** do VS Code.

## Por que é barato

A parte difícil já está feita: **o core (`src/formatter/`) é puro e sem dependências de runtime** —
nenhum import de `vscode`, nenhum import externo (só relativos + `js-yaml`, que é **devDependency**,
usado só nos testes). `format(sql, options)` já é a API pública. O `esbuild.js` já bundla **só**
`src/extension.ts` com `vscode` como `external`. Logo, o trabalho é quase todo de **empacotamento e
reestruturação**, não de lógica. **Nenhuma regra de formatação muda** — os 341 testes atuais são a
rede.

## Forma-alvo (monorepo com npm workspaces)

Escolhido o monorepo (em vez de pacote único) para evitar a ambiguidade do campo `main` — o VS Code
usa `main` como entry da extensão (que importa `vscode`), o npm usa pra `require()` da lib; num pacote
só, um `require('...')` tentaria carregar `vscode` e quebrar. Separando, cada pacote tem seu manifesto
limpo. Sem tooling extra: **npm workspaces** (já usamos npm).

```
riverleaf-sql-formatter/            # raiz: workspace manager (private, não publica)
├─ package.json                     # { "private": true, "workspaces": ["packages/*"] }
├─ packages/
│  ├─ core/                         # a lib + CLI — PUBLICA no npm
│  │  ├─ src/
│  │  │  ├─ formatter/              # <- movido de src/formatter/ (inalterado)
│  │  │  ├─ index.ts                # API pública: export { format, FormatOptions, DEFAULT_OPTIONS }
│  │  │  └─ cli.ts                  # entry do bin (shebang)
│  │  ├─ test/                      # <- movido de test/ (cases/*.yaml + *.test.ts)
│  │  ├─ package.json               # name, bin, exports, types, files, dependency-free
│  │  └─ tsup.config.ts            # build ESM+CJS+.d.ts+bin
│  └─ vscode/                       # a extensão — PUBLICA no Marketplace
│     ├─ src/extension.ts           # <- movido de src/extension.ts; importa do core
│     ├─ esbuild.js                 # bundla extension.ts (core incluído no bundle)
│     └─ package.json               # manifesto de extensão (engines.vscode, contributes, ...)
├─ .claude/                         # rules + skills (paths atualizados)
└─ eslint.config.js / tsconfig.json # base compartilhada
```

## Decisões a travar com o usuário ANTES de implementar

Estas mudam o resultado — pergunta com AskUserQuestion no início da execução:

1. **Nomes dos pacotes.** Recomendação: lib npm = `riverleaf-sql-formatter` (nome curto e disponível
   idealmente); extensão mantém id de marketplace `nbluis.riverleaf-sql-formatter` (namespace
   separado, sem conflito). Alternativa: escopar tudo em `@nbluis/…`. **Decidir.**
2. **Nome do binário (CLI).** Ex.: `riverleaf` (curto) vs `riverleaf-sql-formatter` (explícito, mas
   longo pra digitar) vs `riverleaf-sql`. **Decidir.**
3. **Formato de módulo.** Recomendação: **dual ESM + CJS** + `.d.ts` (máx. compatibilidade: `import`
   e `require`, e o CLI roda em qualquer projeto). Alternativa: só ESM (mais simples, mas fecha porta
   pra consumidores CJS). **Decidir.**
4. **Ferramenta de build da lib.** Recomendação: **tsup** (1 devDep, faz ESM+CJS+dts+bin numa config).
   Alternativa: `tsc` (só tipos) + `esbuild` (js) em dois passos, sem nova dep. **Decidir.**
5. **Versionamento.** A extensão está em `0.0.1`. Recomendação: versões **independentes** por pacote
   (a lib começa em `0.1.0`, a extensão segue no seu ritmo). Alternativa: sincronizadas. **Decidir.**
6. **Escopo de flags do CLI.** Recomendação: `[files...]` (globs) ou stdin; `--write`/`-w` (in-place),
   `--check` (falha se algo não está formatado — pra CI), `--keyword-case lower|upper|preserve`,
   `--indent-size N`, `--stdin`, `--help`, `--version`. **Confirmar o conjunto.**

## Regra inegociável — a suíte permanece verde a cada passo

Nenhuma fase é "concluída" sem `npx tsc --noEmit` + `npm test` (os 341) + `npm run lint` verdes, **e**
o core continuar **dependency-free em runtime**. Como não mexemos na lógica de formatação, qualquer
teste vermelho num passo de reestruturação = path/plumbing errado, conserta antes de seguir. Um commit
por fase; rodapé `Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>`; **perguntar
antes de push**.

## Fases (uma por vez, na ordem)

### Fase 0 — Decisões
Travar 1–6 acima (AskUserQuestion com previews onde fizer sentido: nome do bin, help do CLI). Sem
código.

### Fase 1 — Reestruturar para workspaces 🔴 (a mais delicada — é só mover + reconfigurar)
- Criar `packages/core/` e `packages/vscode/`.
- **Mover** `src/formatter/` → `packages/core/src/formatter/` e `test/` → `packages/core/test/`
  (imports internos são relativos — não mudam). Mover `src/extension.ts` →
  `packages/vscode/src/extension.ts` e `esbuild.js` → `packages/vscode/`.
- Raiz vira workspace manager (`private: true`, `workspaces: ["packages/*"]`); os scripts de topo
  passam a delegar (`npm test -ws` / por pacote).
- Ajustar **tsconfig** (base na raiz + um por pacote), **vitest** (config no core), **eslint**
  (`eslint.config.js` cobrindo `packages/*/src` e `packages/*/test`; hoje é `eslint src test`).
- Atualizar as **skills** que hardcodam caminhos: `regen-format-cases/regen.mjs` (resolve
  `src/formatter/format.ts` a partir da raiz → agora `packages/core/src/...`) e `build-install-vsix`
  (roda `vsce package` na raiz → agora em `packages/vscode`). Atualizar `.claude/rules/testing.md` e
  `CLAUDE.md` (mapa de arquivos).
- **Fim da fase:** os 341 testes verdes **de dentro do novo layout**, `tsc`/`lint` limpos. Nenhuma
  mudança de saída do formatador. Ainda **não** há lib/CLI novos — só a mesma coisa reorganizada.

### Fase 2 — Entry da biblioteca + build publicável (core)
- `packages/core/src/index.ts` reexportando `format`, `FormatOptions`, `DEFAULT_OPTIONS` (o `format.ts`
  já reexporta os tipos).
- Config de build (tsup ou tsc+esbuild) → `dist/` com ESM (`.mjs`), CJS (`.cjs`) e `.d.ts`.
- `packages/core/package.json`: `name`, `version`, `license`, `repository`, `type`, `main`/`module`/
  `types`/`exports` (mapa apontando pra `dist/`), `files: ["dist"]`, `sideEffects: false`,
  `engines.node`. **Zero `dependencies`.**
- Smoke test de consumidor: um script no scratchpad que faz `import { format } from` (ESM) e
  `require` (CJS) do pacote buildado e formata uma query do dicionário (`select id from planets ...`).
- **Fim da fase:** `npm run build -w core` gera `dist/` com tipos; import ESM e CJS funcionam.

### Fase 3 — CLI (`npx`)
- `packages/core/src/cli.ts` com shebang `#!/usr/bin/env node`: lê de `[files...]`/globs ou stdin,
  aplica `format` com as flags (item 6), escreve stdout ou in-place (`--write`), `--check` retorna
  exit code ≠ 0 se houver diferença. Zero-dep (parse de args na mão) se possível.
- `bin` no `package.json` do core apontando pro CLI buildado.
- Testes do CLI (spawnar o bin ou chamar a função de entrada): stdin→stdout, `--write`, `--check`,
  cada flag de opção, `--help`/`--version`, exit codes. Exemplos no dicionário de astronomia.
- **Fim da fase:** `node packages/core/dist/cli.cjs …` e `npx` (via `npm link`/pack local) formatam.

### Fase 4 — Extensão consome o core
- `packages/vscode` declara `dependency`/`workspace:*` no core; `extension.ts` importa `format` do
  pacote (em vez do caminho relativo antigo). O `esbuild.js` continua bundlando `extension.ts` (o core
  entra no bundle; `vscode` continua `external`).
- Re-package + re-install do `.vsix` (skill `build-install-vsix`) e **verificar no editor real**
  (Format Document numa `.sql`).
- **Fim da fase:** extensão funciona idêntica, agora consumindo o core compartilhado.

### Fase 5 — Preparação de publicação
- README do core pro npm (uso: `npx` + `import`, exemplos no dicionário), `keywords`, badge.
- `prepublishOnly` no core rodando `tsc --noEmit && vitest run && lint && build`; `.npmignore`/`files`
  garantindo que só `dist/` + README + LICENSE vão pro tarball.
- `npm publish --dry-run -w core` pra conferir o conteúdo do pacote. (Publicar de fato = passo manual
  do usuário, com `npm login`.)
- Conferir `repository`/`bugs`/`homepage` e `LICENSE` em cada pacote.
- **Fim da fase:** `npm pack -w core` produz um tarball limpo (só `dist` + docs), sem cruft de
  extensão.

### Fase 6 (opcional) — CI
- GitHub Actions: `test + lint + typecheck + build` em PR; publicar a lib no npm e a extensão no
  Marketplace em tag/release. Requer secrets (`NPM_TOKEN`, `VSCE_PAT`). Só se houver demanda.

## Ordem sugerida
**0 (decisões) → 1 (workspaces) → 2 (lib) → 3 (CLI) → 4 (extensão) → 5 (publish) → 6 (CI, opcional).**
Racional: a Fase 1 é o pré-requisito de tudo e a de maior risco de plumbing (mover arquivos), então
vem cedo e com a suíte inteira como rede; 2 e 3 são a entrega nova (lib + CLI); 4 religa a extensão;
5 deixa pronto pra publicar; 6 automatiza.

## Riscos / pontos de atenção
- **Plumbing de paths** (o maior risco): tsconfig references, vitest, eslint globs, e as duas skills
  que hardcodam `src/formatter/...` e `vsce package` na raiz. Mitigação: a suíte de 341 tem de passar
  no fim da Fase 1 rodando do novo layout.
- **`@types/vscode`** só faz sentido em `packages/vscode`; **`js-yaml`** (devDep dos testes) fica em
  `packages/core`. Dividir as devDeps por pacote.
- **Dual ESM/CJS**: o shebang do CLL e o `exports` map precisam estar certos pra `npx` e pra `import`/
  `require`. tsup resolve; se for tsc+esbuild, exige cuidado no `exports`.
- **Zero-dep em runtime** é um selling point — não introduzir dep de arg-parsing no CLI sem
  necessidade.
- **Nada disso toca o formatador** — se algum teste de formatação mudar de saída, é bug de
  reestruturação, não de feature.

## Regras do processo (iguais às fases anteriores)
1. Ler `.claude/rules/formatting-spec.md`/`testing.md` e o módulo relevante antes de mexer.
2. **Travar as decisões com o usuário** (Fase 0) antes de implementar.
3. Suíte inteira verde + `tsc` + `lint` a cada fase; core dependency-free.
4. Exemplos no **dicionário de astronomia**; tudo em **inglês**.
5. Um commit por fase; **perguntar antes de push**.
6. Runtime mudou (Fase 4) → re-package + re-install o vsix e verificar no editor.
