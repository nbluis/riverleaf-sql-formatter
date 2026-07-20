#!/usr/bin/env node
// riverleaf — command-line entry for the SQL formatter.
//
// Zero runtime dependencies: arguments are parsed by hand and globs are left to
// the shell (`riverleaf src/**/*.sql`). Reads files or stdin, formats with the
// river-alignment core, and either prints to stdout, rewrites in place (--write),
// or checks formatting for CI (--check).
import { readFileSync, writeFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';
import { format, FormatOptions } from './index';

type KeywordCase = FormatOptions['keywordCase'];

const KEYWORD_CASES: readonly KeywordCase[] = ['lower', 'upper', 'preserve'];

interface CliArgs {
  files: string[];
  write: boolean;
  check: boolean;
  stdin: boolean;
  help: boolean;
  version: boolean;
  options: Partial<FormatOptions>;
}

const HELP = `riverleaf — format SQL in the river alignment style

Usage:
  riverleaf [options] [files...]
  cat query.sql | riverleaf [options]

Options:
  -w, --write             Rewrite each file in place (default: print to stdout).
      --check             Exit non-zero if any input is not already formatted (CI).
      --keyword-case <c>  Keyword case: lower | upper | preserve (default: lower).
      --indent-size <n>   Spaces per nesting level (default: 2).
      --stdin             Read SQL from stdin even when files are given.
  -h, --help              Show this help.
  -v, --version           Print the version.

With no files (and no --stdin) input is read from stdin. Globs are expanded by
your shell, e.g. \`riverleaf src/**/*.sql\`.

Exit codes: 0 = ok; 1 = --check found unformatted input; 2 = usage or I/O error.`;

export class UsageError extends Error {}

export function parseArgs(argv: string[]): CliArgs {
  const args: CliArgs = {
    files: [],
    write: false,
    check: false,
    stdin: false,
    help: false,
    version: false,
    options: {},
  };

  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    const takeValue = (inline: string | undefined): string => {
      if (inline !== undefined) return inline;
      const next = argv[i + 1];
      if (next === undefined) throw new UsageError(`option ${arg} requires a value`);
      i++;
      return next;
    };

    // Support both `--flag value` and `--flag=value`.
    const eq = arg.startsWith('--') ? arg.indexOf('=') : -1;
    const name = eq === -1 ? arg : arg.slice(0, eq);
    const inlineValue = eq === -1 ? undefined : arg.slice(eq + 1);

    switch (name) {
      case '-w':
      case '--write':
        args.write = true;
        break;
      case '--check':
        args.check = true;
        break;
      case '--stdin':
        args.stdin = true;
        break;
      case '-h':
      case '--help':
        args.help = true;
        break;
      case '-v':
      case '--version':
        args.version = true;
        break;
      case '--keyword-case': {
        const value = takeValue(inlineValue) as KeywordCase;
        if (!KEYWORD_CASES.includes(value)) {
          throw new UsageError(
            `invalid --keyword-case '${value}' (expected: ${KEYWORD_CASES.join(', ')})`,
          );
        }
        args.options.keywordCase = value;
        break;
      }
      case '--indent-size': {
        const raw = takeValue(inlineValue);
        const value = Number(raw);
        if (!Number.isInteger(value) || value < 0) {
          throw new UsageError(`invalid --indent-size '${raw}' (expected a non-negative integer)`);
        }
        args.options.indentSize = value;
        break;
      }
      case '--':
        // Everything after `--` is a file path.
        args.files.push(...argv.slice(i + 1));
        i = argv.length;
        break;
      default:
        if (arg.startsWith('-') && arg !== '-') {
          throw new UsageError(`unknown option '${arg}' (try --help)`);
        }
        args.files.push(arg);
    }
  }

  return args;
}

async function readStdin(): Promise<string> {
  const chunks: Buffer[] = [];
  for await (const chunk of process.stdin) chunks.push(chunk as Buffer);
  return Buffer.concat(chunks).toString('utf8');
}

function readVersion(): string {
  try {
    const pkgUrl = new URL('../package.json', import.meta.url);
    const pkg = JSON.parse(readFileSync(pkgUrl, 'utf8')) as { version?: string };
    return pkg.version ?? '0.0.0';
  } catch {
    return '0.0.0';
  }
}

/**
 * Runs the CLI and resolves to the intended process exit code. `readInput`
 * defaults to reading real stdin; tests inject a fake so no build/spawn is
 * needed. Never calls `process.exit` — that stays in the entry guard below.
 */
export async function run(
  argv: string[],
  readInput: () => Promise<string> = readStdin,
): Promise<number> {
  const args = parseArgs(argv);

  if (args.help) {
    process.stdout.write(HELP + '\n');
    return 0;
  }
  if (args.version) {
    process.stdout.write(readVersion() + '\n');
    return 0;
  }

  const useStdin = args.stdin || args.files.length === 0;

  if (useStdin) {
    if (args.write) throw new UsageError('--write cannot be used with stdin input');
    if (process.stdin.isTTY) {
      throw new UsageError('no input: pass file paths or pipe SQL into stdin (try --help)');
    }
    const input = await readInput();
    const output = format(input, args.options);
    if (args.check) {
      if (output !== input) {
        process.stderr.write('would reformat <stdin>\n');
        return 1;
      }
      return 0;
    }
    process.stdout.write(output);
    return 0;
  }

  // File mode.
  let changed = 0;
  let failed = 0;
  for (const file of args.files) {
    let input: string;
    try {
      input = readFileSync(file, 'utf8');
    } catch (err) {
      process.stderr.write(`error: cannot read ${file}: ${(err as Error).message}\n`);
      failed++;
      continue;
    }
    const output = format(input, args.options);
    const differs = output !== input;

    if (args.check) {
      if (differs) {
        process.stderr.write(`would reformat ${file}\n`);
        changed++;
      }
      continue;
    }
    if (args.write) {
      if (differs) {
        try {
          writeFileSync(file, output);
          changed++;
        } catch (err) {
          process.stderr.write(`error: cannot write ${file}: ${(err as Error).message}\n`);
          failed++;
        }
      }
      continue;
    }
    // Default: print to stdout.
    process.stdout.write(output);
  }

  if (failed > 0) return 2;
  if (args.check && changed > 0) return 1;
  return 0;
}

// Only drive the process when invoked as the entry point (the `riverleaf` bin),
// not when imported by tests.
const invokedPath = process.argv[1];
const isMain = invokedPath !== undefined && import.meta.url === pathToFileURL(invokedPath).href;

if (isMain) {
  run(process.argv.slice(2))
    .then((code) => process.exit(code))
    .catch((err) => {
      const message = err instanceof Error ? err.message : String(err);
      process.stderr.write(`error: ${message}\n`);
      process.exit(2);
    });
}
