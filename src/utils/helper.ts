import {
  FloatWinConfig,
  MapMode,
  Position,
  Range,
  TextDocument,
  Uri,
  VimValue,
  window,
  workspace,
} from 'coc.nvim';
import fs from 'fs';
import getcfg from './config';
import path from 'path';
import { Nullable, OpenOptions, CocExtFloatConfig } from './types';
import { TextEncoder } from 'util';
import { logger } from './logger';

// import fs from 'fs-extra';
// import md5 from 'md5';

function defauleFloatWinConfig(): FloatWinConfig {
  let conf = getcfg<CocExtFloatConfig>('floatConfig', {});
  return {
    autoHide: true,
    border: conf.border ? [1, 1, 1, 1] : [0, 0, 0, 0],
    close: false,
    maxHeight: conf.maxHeight,
    maxWidth: conf.maxWidth,
    highlight: conf.highlight,
    borderhighlight: conf.borderhighlight,
  };
}

export function positionInRange(pos: Position, range: Range): boolean {
  return (
    (range.start.line < pos.line ||
      (range.start.line == pos.line &&
        range.start.character <= pos.character)) &&
    (pos.line < range.end.line ||
      (pos.line == range.end.line && pos.character <= range.end.character))
  );
}

export async function getText(
  mode: MapMode,
  escape: boolean = true,
): Promise<string> {
  const doc = await workspace.document;
  let range: Nullable<Range> = null;
  if (mode === 'v') {
    // range = await window.getSelectedRange('v');
    const text: string = (
      await workspace.nvim.call('lib#common#visual_selection', [escape ? 1 : 0])
    ).toString();
    return text.trim();
  } else {
    const pos = await window.getCursorPosition();
    range = doc.getWordRangeAtPosition(pos);
  }

  let text = '';
  if (!range) {
    text = (await workspace.nvim.eval('expand("<cword>")')).toString();
  } else {
    text = doc.textDocument.getText(range);
  }
  return text.trim();
}

export async function echoMessage(hl: string, msg: string) {
  const { nvim } = workspace;
  await nvim.exec(`echohl ${hl}`);
  await nvim.exec(`echo "${msg}"`);
  await nvim.exec(`echohl None`);
}

export async function popup(
  content: string,
  title?: string,
  filetype?: string,
  cfg?: FloatWinConfig,
): Promise<void> {
  if (content.length == 0) {
    return;
  }
  if (!filetype) {
    filetype = 'text';
  }
  if (!cfg) {
    cfg = defauleFloatWinConfig();
  }
  const doc = [
    {
      content: title && title.length != 0 ? `${title}\n\n${content}` : content,
      filetype: filetype,
    },
  ];
  const win = window.createFloatFactory(cfg);
  await win.show(doc);
}

export function getDocumentPath(
  document: TextDocument,
  fallbackPath?: string,
): string {
  const filepath = Uri.parse(document.uri).fsPath;
  if (fallbackPath && path.basename(filepath) === filepath) {
    return fallbackPath;
  }
  return path.dirname(filepath);
}

export function getWorkspaceUri(document: TextDocument): Uri | undefined {
  const filepath = Uri.parse(document.uri).fsPath;
  if (!filepath.startsWith(workspace.root)) return;
  return Uri.file(workspace.root);
}

export function fnvHash(data: string | Uint8Array, seed = 0): number {
  const fnvPrime = BigInt(0x811c9dc5);
  let hash = BigInt(seed);
  const func = function (x: number) {
    hash = BigInt.asUintN(32, hash * fnvPrime);
    hash ^= BigInt(x);
  };
  if (typeof data === 'string') {
    const enc = new TextEncoder();
    const bytes = enc.encode(data);
    bytes.forEach(func);
  } else if (data instanceof String) {
    const enc = new TextEncoder();
    const bytes = enc.encode(data.toString());
    bytes.forEach(func);
  } else {
    data.forEach(function (x: number) {
      hash = BigInt.asUintN(32, hash * fnvPrime);
      hash ^= BigInt(x);
    });
  }
  return Number(hash);
}

export function getTempFileWithDocumentContents(
  document: TextDocument,
): Promise<string> {
  return new Promise<string>((resolve, reject) => {
    const fsPath = Uri.parse(document.uri).fsPath;
    const ext = path.extname(fsPath);
    const fileName = `${fsPath}.${fnvHash(document.uri)}${ext}`;
    fs.writeFile(fileName, document.getText(), (ex) => {
      if (ex) {
        reject(new Error(`Failed to create a temporary file, ${ex.message}`));
      }
      resolve(fileName);
    });
  });
}

export function luacall(
  fname: string,
  args: VimValue | VimValue[] = [],
  isNotify?: boolean,
): Promise<any | null> | null {
  const { nvim } = workspace;
  // @ts-ignore
  const _args = nvim.getArgs(args) as VimValue[];
  const items = _args.map((_, index) => `_A[${index + 1}]`);
  // @ts-ignore
  return nvim.call('luaeval', [`${fname}(${items.join()})`, _args], isNotify);
}

export async function openFile(filepath: string, opts?: OpenOptions) {
  const { nvim } = workspace;
  let open = 'edit';
  let cmd = '';
  if (opts) {
    if (opts.open) {
      open = opts.open;
    }
    if (opts.key) {
      cmd = `+/${opts.key}`;
    } else if (opts.line) {
      const column = opts.column ? opts.column : 0;
      cmd = `+call\\ cursor(${opts.line},${column})`;
    }
  }
  await nvim.command(`${open} ${cmd} ${filepath}`);
}

export function sleepMs(ms: number) {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}
