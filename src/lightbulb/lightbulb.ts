import { CodeAction, CodeActionKind } from 'vscode-languageserver-protocol';
import { CancellationTokenSource } from 'coc.nvim';

export class Lightbulb {
  private tokenSource: CancellationTokenSource | undefined;
}
