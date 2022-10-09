import { CodeAction, CodeActionKind } from 'vscode-languageserver-protocol';
import {
  CancellationTokenSource,
  Document,
  diagnosticManager,
  languages,
  window,
} from 'coc.nvim';
// import { logger } from '../utils/logger';

export class Lightbulb {
  private tokenSource: CancellationTokenSource | undefined;

  async show(doc: Document, only?: CodeActionKind[]): Promise<boolean> {
    this.tokenSource?.cancel();
    this.tokenSource = new CancellationTokenSource();
    const token = this.tokenSource.token;

    const range = await window.getSelectedRange('cursor');

    if (!range) {
      return false;
    }

    const diagnostics = diagnosticManager.getDiagnosticsInRange(
      doc.textDocument,
      range
    );
    // @ts-ignore
    const context: CodeActionContext = { diagnostics };

    if (only && only.length > 0) {
      context.only = only;
    }

    // @ts-ignore
    let codeActions: CodeAction[] = await languages.getCodeActions(
      doc.textDocument,
      range,
      context,
      token
    );

    if (!codeActions || codeActions.length == 0) {
      return false;
    }
    codeActions = codeActions.filter((o) => !o.disabled);

    return codeActions.length > 0;
  }
}
