import {
  CancellationTokenSource,
  DocumentSymbol,
  languages,
  window,
  workspace,
} from 'coc.nvim';
import { positionInRange } from './helper';
// import { SymbolKind } from 'vscode-languageserver-protocol';
import { SimpleSymbolInfo } from './types';
// import { logger } from './logger';

const symbolKindName: Record<number, string> = {
  1: 'File',
  2: 'Module',
  3: 'Namespace',
  4: 'Package',
  5: 'Class',
  6: 'Method',
  7: 'Property',
  8: 'Field',
  9: 'Constructor',
  10: 'Enum',
  11: 'Interface',
  12: 'Function',
  13: 'Variable',
  14: 'Constant',
  15: 'String',
  16: 'Number',
  17: 'Boolean',
  18: 'Array',
  19: 'Object',
  20: 'Key',
  21: 'Null',
  22: 'EnumMember',
  23: 'Struct',
  24: 'Event',
  25: 'Operator',
  26: 'TypeParameter',
};
// const symbolKindName: Map<number, string> = new Map([
//   [SymbolKind.File, 'File'],
//   [SymbolKind.Module, 'Module'],
//   [SymbolKind.Namespace, 'Namespace'],
//   [SymbolKind.Package, 'Package'],
//   [SymbolKind.Class, 'Class'],
//   [SymbolKind.Method, 'Method'],
//   [SymbolKind.Property, 'Property'],
//   [SymbolKind.Field, 'Field'],
//   [SymbolKind.Constructor, 'Constructor'],
//   [SymbolKind.Enum, 'Enum'],
//   [SymbolKind.Interface, 'Interface'],
//   [SymbolKind.Function, 'Function'],
//   [SymbolKind.Variable, 'Variable'],
//   [SymbolKind.Constant, 'Constant'],
//   [SymbolKind.String, 'String'],
//   [SymbolKind.Number, 'Number'],
//   [SymbolKind.Boolean, 'Boolean'],
//   [SymbolKind.Array, 'Array'],
//   [SymbolKind.Object, 'Object'],
//   [SymbolKind.Key, 'Key'],
//   [SymbolKind.Null, 'Null'],
//   [SymbolKind.EnumMember, 'EnumMember'],
//   [SymbolKind.Struct, 'Struct'],
//   [SymbolKind.Event, 'Event'],
//   [SymbolKind.Operator, 'Operator'],
//   [SymbolKind.TypeParameter, 'TypeParameter'],
// ]);

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

export async function getCursorSymbolList(): Promise<
  SimpleSymbolInfo[] | null
> {
  const docSymList = await getDocumentSymbols();
  if (!docSymList) {
    return null;
  }

  const pos = await window.getCursorPosition();
  const symList: SimpleSymbolInfo[] = [];
  let slist: DocumentSymbol[] | undefined = docSymList;
  let ok = true;
  while (slist && ok) {
    ok = false;
    for (const s of slist) {
      // logger.debug([s.name, s.range, pos]);
      if (positionInRange(pos, s.range)) {
        symList.push({
          name: s.name,
          detail: s.detail,
          // kind: symbolKindName.get(s.kind) as string,
          kind: symbolKindName[s.kind],
        });
        slist = s.children;
        ok = true;
        break;
      }
    }
  }
  return symList;
}
