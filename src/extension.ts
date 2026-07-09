import * as vscode from 'vscode';
import { format, FormatOptions } from './formatter/format';

function resolveMaxLineLength(document: vscode.TextDocument): number {
  const cfg = vscode.workspace.getConfiguration('riverleaf', document);
  const explicit = cfg.get<number | null>('maxLineLength');
  if (typeof explicit === 'number' && explicit > 0) return explicit;

  const editorCfg = vscode.workspace.getConfiguration('editor', document);
  const rulers = editorCfg.get<Array<number | { column?: number }>>('rulers');
  if (Array.isArray(rulers) && rulers.length > 0) {
    const first = rulers[0];
    const col = typeof first === 'number' ? first : first?.column;
    if (typeof col === 'number' && col > 0) return col;
  }
  return 80;
}

function resolveOptions(document: vscode.TextDocument): FormatOptions {
  const cfg = vscode.workspace.getConfiguration('riverleaf', document);
  const keywordCase = cfg.get<'lower' | 'upper' | 'preserve'>('keywordCase') ?? 'lower';
  const indentSize = cfg.get<number>('indentSize') ?? 2;
  return {
    maxLineLength: resolveMaxLineLength(document),
    keywordCase,
    indentSize,
  };
}

function fullRange(document: vscode.TextDocument): vscode.Range {
  const last = document.lineCount - 1;
  return new vscode.Range(0, 0, last, document.lineAt(last).text.length);
}

export function activate(context: vscode.ExtensionContext): void {
  const selector: vscode.DocumentSelector = { language: 'sql' };

  const docProvider: vscode.DocumentFormattingEditProvider = {
    provideDocumentFormattingEdits(document) {
      const options = resolveOptions(document);
      const formatted = format(document.getText(), options);
      return [vscode.TextEdit.replace(fullRange(document), formatted)];
    },
  };

  const rangeProvider: vscode.DocumentRangeFormattingEditProvider = {
    provideDocumentRangeFormattingEdits(document, range) {
      const options = resolveOptions(document);
      const formatted = format(document.getText(range), options);
      // drop the trailing \n when formatting a selected range
      const trimmed = formatted.replace(/\n$/, '');
      return [vscode.TextEdit.replace(range, trimmed)];
    },
  };

  context.subscriptions.push(
    vscode.languages.registerDocumentFormattingEditProvider(selector, docProvider),
    vscode.languages.registerDocumentRangeFormattingEditProvider(selector, rangeProvider),
  );
}

export function deactivate(): void {
  // nothing to clean up
}
