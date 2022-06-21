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

interface symbolInfo {
  name: string;
  icon: string;
  short_name: string;
}

const symbolKind2Info: Record<number, symbolInfo> = {
  1: { name: 'File', icon: '', short_name: 'F' },
  2: { name: 'Module', icon: '', short_name: 'M' },
  3: { name: 'Namespace', icon: '', short_name: 'N' },
  4: { name: 'Package', icon: '', short_name: 'P' },
  5: { name: 'Class', icon: '', short_name: 'C' },
  6: { name: 'Method', icon: '', short_name: 'f' },
  7: { name: 'Property', icon: '襁', short_name: 'p' },
  8: { name: 'Field', icon: '料', short_name: 'm' },
  9: { name: 'Constructor', icon: '', short_name: 'c' },
  10: { name: 'Enum', icon: '', short_name: 'E' },
  11: { name: 'Interface', icon: '', short_name: 'I' },
  12: { name: 'Function', icon: 'ƒ', short_name: 'f' },
  13: { name: 'Variable', icon: '', short_name: 'v' },
  14: { name: 'Constant', icon: '', short_name: 'C' },
  15: { name: 'String', icon: '', short_name: 'S' },
  16: { name: 'Number', icon: '', short_name: 'n' },
  17: { name: 'Boolean', icon: '', short_name: 'b' },
  18: { name: 'Array', icon: '', short_name: 'a' },
  19: { name: 'Object', icon: '', short_name: 'O' },
  20: { name: 'Key', icon: '', short_name: 'K' },
  21: { name: 'Null', icon: 'ﳠ', short_name: 'n' },
  22: { name: 'EnumMember', icon: '', short_name: 'm' },
  23: { name: 'Struct', icon: 'פּ', short_name: 'S' },
  24: { name: 'Event', icon: '鬒', short_name: 'e' },
  25: { name: 'Operator', icon: 'Ψ', short_name: 'o' },
  26: { name: 'TypeParameter', icon: '', short_name: 'T' },
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
        let info = symbolKind2Info[s.kind];
        symList.push({
          name: s.name,
          short_name: info.short_name,
          detail: s.detail,
          kind: info.name,
          icon: info.icon,
        });
        slist = s.children;
        ok = true;
        break;
      }
    }
  }
  return symList;
}
