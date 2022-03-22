import {
  languages,
  workspace,
  CancellationTokenSource,
  DocumentSymbol,
} from 'coc.nvim';
import { logger } from './logger';

export async function getDocumentSymbols(
  bufnr0?: number
): Promise<DocumentSymbol[] | null> {
  const { nvim } = workspace;
  const bufnr = bufnr0 ? bufnr0 : ((await nvim.call('bufnr', ['%'])) as number);
  const doc = workspace.getDocument(bufnr);
  if (!doc || !doc.attached) {
    return null;
  }

  // @ts-ignore
  if (!languages.hasProvider('documentSymbol', doc.textDocument)) {
    return null;
  }

  const tokenSource = new CancellationTokenSource();
  const { token } = tokenSource;
  // @ts-ignore
  const docSymList = (await languages.getDocumentSymbol(
    doc.textDocument,
    token
  )) as DocumentSymbol[];
  return docSymList;
}
