import * as vscode from 'vscode';
// Phase 1: import the formatter core straight from its source in packages/core.
// Phase 4 swaps this for the published package name ('riverleaf-sql-formatter').
import { format, FormatOptions } from '../../core/src/formatter/format';

function resolveOptions(document: vscode.TextDocument): FormatOptions {
  const cfg = vscode.workspace.getConfiguration('riverleaf', document);
  const keywordCase = cfg.get<'lower' | 'upper' | 'preserve'>('keywordCase') ?? 'lower';
  const indentSize = cfg.get<number>('indentSize') ?? 2;
  return {
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
