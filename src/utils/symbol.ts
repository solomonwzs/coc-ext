import { languages, workspace, CancellationTokenSource } from 'coc.nvim';
import { logger } from './logger';

export async function getDocumentSymbols(bufnr: number): Promise<any> {
  const doc = workspace.getDocument(bufnr);
  if (!doc || !doc.attached) {
    return;
  }

  // @ts-ignore
  if (!languages.hasProvider('documentSymbol', doc.textDocument)) {
    return;
  }

  // @ts-ignore
  const x = await languages.getDocumentSymbol(
    doc.textDocument,
    new CancellationTokenSource()
  );
  logger.debug(x);
}
