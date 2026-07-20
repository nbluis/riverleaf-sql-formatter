import { describe, it, expect, vi, afterEach } from 'vitest';
import { mkdtempSync, writeFileSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { run, parseArgs, UsageError } from '../src/cli';

// Capture everything a run() writes to stdout/stderr without touching the real
// streams, so assertions stay hermetic.
function capture() {
  let out = '';
  let err = '';
  const outSpy = vi.spyOn(process.stdout, 'write').mockImplementation((chunk) => {
    out += String(chunk);
    return true;
  });
  const errSpy = vi.spyOn(process.stderr, 'write').mockImplementation((chunk) => {
    err += String(chunk);
    return true;
  });
  return {
    get out() {
      return out;
    },
    get err() {
      return err;
    },
    restore() {
      outSpy.mockRestore();
      errSpy.mockRestore();
    },
  };
}

const tmpDirs: string[] = [];
function tmpFile(name: string, contents: string): string {
  const dir = mkdtempSync(join(tmpdir(), 'riverleaf-cli-'));
  tmpDirs.push(dir);
  const file = join(dir, name);
  writeFileSync(file, contents);
  return file;
}

afterEach(() => {
  vi.restoreAllMocks();
  while (tmpDirs.length) rmSync(tmpDirs.pop()!, { recursive: true, force: true });
});

const stdinOf = (sql: string) => () => Promise.resolve(sql);

describe('parseArgs', () => {
  it('defaults to no flags and empty options', () => {
    const a = parseArgs([]);
    expect(a).toMatchObject({ files: [], write: false, check: false, stdin: false, options: {} });
  });

  it('collects file positionals and boolean flags', () => {
    const a = parseArgs(['-w', 'a.sql', '--check', 'b.sql', '--stdin']);
    expect(a.files).toEqual(['a.sql', 'b.sql']);
    expect(a.write).toBe(true);
    expect(a.check).toBe(true);
    expect(a.stdin).toBe(true);
  });

  it('reads option values as separate args and inline (=)', () => {
    expect(parseArgs(['--keyword-case', 'upper']).options.keywordCase).toBe('upper');
    expect(parseArgs(['--keyword-case=preserve']).options.keywordCase).toBe('preserve');
    expect(parseArgs(['--indent-size', '4']).options.indentSize).toBe(4);
    expect(parseArgs(['--indent-size=0']).options.indentSize).toBe(0);
  });

  it('treats everything after `--` as files', () => {
    expect(parseArgs(['--', '--weird-name.sql', '-x.sql']).files).toEqual([
      '--weird-name.sql',
      '-x.sql',
    ]);
  });

  it('rejects unknown options, bad values, and missing values', () => {
    expect(() => parseArgs(['--bogus'])).toThrow(UsageError);
    expect(() => parseArgs(['--keyword-case', 'sideways'])).toThrow(UsageError);
    expect(() => parseArgs(['--indent-size', 'x'])).toThrow(UsageError);
    expect(() => parseArgs(['--indent-size', '-1'])).toThrow(UsageError);
    expect(() => parseArgs(['--keyword-case'])).toThrow(UsageError);
  });
});

describe('run — help and version', () => {
  it('--help prints usage and exits 0', async () => {
    const cap = capture();
    const code = await run(['--help']);
    cap.restore();
    expect(code).toBe(0);
    expect(cap.out).toContain('Usage:');
    expect(cap.out).toContain('riverleaf');
  });

  it('--version prints a semver-ish string and exits 0', async () => {
    const cap = capture();
    const code = await run(['--version']);
    cap.restore();
    expect(code).toBe(0);
    expect(cap.out.trim()).toMatch(/^\d+\.\d+\.\d+/);
  });
});

describe('run — stdin', () => {
  it('formats stdin to stdout', async () => {
    const cap = capture();
    const code = await run([], stdinOf('select id, name from planets where mass > 1'));
    cap.restore();
    expect(code).toBe(0);
    expect(cap.out).toBe('select id,\n       name\n  from planets\n where mass > 1\n');
  });

  it('applies --keyword-case and --indent-size', async () => {
    const cap = capture();
    const code = await run(['--keyword-case', 'upper'], stdinOf('select id from stars'));
    cap.restore();
    expect(code).toBe(0);
    expect(cap.out).toBe('SELECT id\n  FROM stars\n');
  });

  it('--check exits 0 when already formatted, 1 otherwise', async () => {
    const formatted = 'select id\n  from stars\n';
    const capOk = capture();
    const okCode = await run(['--check'], stdinOf(formatted));
    capOk.restore();
    expect(okCode).toBe(0);

    const capBad = capture();
    const badCode = await run(['--check'], stdinOf('select id from stars'));
    capBad.restore();
    expect(badCode).toBe(1);
    expect(capBad.err).toContain('would reformat <stdin>');
  });

  it('rejects --write with stdin', async () => {
    await expect(run(['--write'], stdinOf('select 1'))).rejects.toThrow(UsageError);
  });
});

describe('run — files', () => {
  it('prints formatted output to stdout by default', async () => {
    const file = tmpFile('q.sql', 'select id,name from planets');
    const cap = capture();
    const code = await run([file]);
    cap.restore();
    expect(code).toBe(0);
    expect(cap.out).toBe('select id,\n       name\n  from planets\n');
    // Default mode must not touch the file.
    expect(readFileSync(file, 'utf8')).toBe('select id,name from planets');
  });

  it('--write rewrites the file in place', async () => {
    const file = tmpFile('q.sql', 'select id,name from planets');
    const cap = capture();
    const code = await run(['--write', file]);
    cap.restore();
    expect(code).toBe(0);
    expect(readFileSync(file, 'utf8')).toBe('select id,\n       name\n  from planets\n');
  });

  it('--check reports and fails on unformatted, passes on formatted', async () => {
    const file = tmpFile('q.sql', 'select id,name from planets');
    const cap1 = capture();
    const code1 = await run(['--check', file]);
    cap1.restore();
    expect(code1).toBe(1);
    expect(cap1.err).toContain('would reformat');

    await run(['--write', file]);

    const cap2 = capture();
    const code2 = await run(['--check', file]);
    cap2.restore();
    expect(code2).toBe(0);
    expect(cap2.err).toBe('');
  });

  it('formats multiple files to stdout in order', async () => {
    const a = tmpFile('a.sql', 'select id from planets');
    const b = tmpFile('b.sql', 'select name from stars');
    const cap = capture();
    const code = await run([a, b]);
    cap.restore();
    expect(code).toBe(0);
    expect(cap.out).toBe('select id\n  from planets\nselect name\n  from stars\n');
  });

  it('returns 2 and reports when a file cannot be read', async () => {
    const cap = capture();
    const code = await run([join(tmpdir(), 'riverleaf-does-not-exist.sql')]);
    cap.restore();
    expect(code).toBe(2);
    expect(cap.err).toContain('cannot read');
  });
});
