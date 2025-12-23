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
import { getcfg } from './config';
import path from 'path';
import { Nullable, OpenOptions, CocExtFloatConfig } from './types';
import { TextEncoder } from 'util';
import { logger } from './logger';

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
    let res = await workspace.nvim.call('lib#common#visual_selection', [
      escape ? 1 : 0,
    ]);
    return res ? res.toString().trim() : '';
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

async function winid2bufnr(winid: number): Promise<number> {
  let { nvim } = workspace;
  let winnr = await nvim.call('win_id2win', winid);
  if (!winnr) {
    return -1;
  }
  let bufnr = await nvim.call('winbufnr', [winnr]);
  if (!bufnr) {
    return -1;
  }
  return bufnr as number;
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
  if (!cfg) {
    cfg = defauleFloatWinConfig();
  }
  const doc = [
    {
      content: title && title.length != 0 ? `${title}\n\n${content}` : content,
      filetype: 'text',
    },
  ];
  const win = window.createFloatFactory(cfg);
  await win.show(doc);

  if (!win.window || !filetype) {
    return;
  }
  let bufnr = await winid2bufnr(win.window.id);
  if (bufnr == -1) {
    return;
  }
  await workspace.nvim.call('setbufvar', [bufnr, '&filetype', filetype]);
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

export function countTextWidth(text: string) {
  let w = 0;
  for (const ch of text) {
    const code = ch.codePointAt(0)!; // 取第一个码点
    if (code <= 0x7f) {
      w += 1;
    } else {
      w += 2;
    }
  }
  return w;
}

interface ScratchWinConf {
  ver?: boolean;
  name?: string;
  filetype?: string;
  lines: string[];
}
interface ScratchWinResult {
  ori_winnr: number;
  ori_winid: number;
  new_winnr?: number;
  new_winid?: number;
  new_bufnr?: number;
}
export async function newScratchWindow(conf: ScratchWinConf) {
  let { nvim } = workspace;
  let res = (await nvim.call('coc_ext#newScratchWindow', [
    conf.ver ? 1 : 0,
  ])) as ScratchWinResult;
  // logger.debug(res);
  if (!res.new_winnr || !res.new_winid || !res.new_bufnr) {
    return Error('create scratch window fail');
  }

  await nvim.call('coc#compat#buf_set_lines', [
    res.new_bufnr,
    0,
    -1,
    conf.lines,
  ]);
  if (conf.name) {
    await nvim.exec(`execute 'file [${conf.name}]'`);
  }
  if (conf.filetype) {
    await nvim.call('setbufvar', [res.new_bufnr, '&filetype', conf.filetype]);
  }
  return res.new_winid;
}

export class ScratchWindow {
  private winid: number;

  constructor(
    readonly name: string,
    readonly filetype: string,
  ) {
    this.winid = -1;
  }

  public async open(lines: string[]) {
    if (this.winid != -1) {
      let { nvim } = workspace;
      let bufnr = (await nvim.call('winbufnr', [this.winid])) as number;
      if (bufnr != -1) {
        await nvim.call('coc#compat#buf_set_lines', [bufnr, 0, -1, lines]);
        await nvim.call('win_gotoid', [this.winid]);
        return;
      }
    }

    let winid = await newScratchWindow({
      name: this.name,
      filetype: this.filetype,
      lines,
    });
    if (!(winid instanceof Error)) {
      this.winid = winid;
    }
  }
}

interface AlignList {
  align: 'L' | 'R';
  maxWidth: number;
  strList: {
    word: string;
    width: number;
  }[];
}
export class StringAlignHelper {
  private alignList: AlignList[];

  constructor(readonly align: string) {
    this.alignList = [];
    for (let i of align) {
      let a: 'L' | 'R' = i == 'L' ? 'L' : 'R';
      this.alignList.push({
        align: a,
        maxWidth: 0,
        strList: [],
      });
    }
  }

  public put(...items: string[]) {
    if (items.length != this.align.length) {
      return -1;
    } else {
      for (let i = 0; i < this.align.length; ++i) {
        let w = countTextWidth(items[i]);
        if (this.alignList[i].maxWidth < w) {
          this.alignList[i].maxWidth = w;
        }
        this.alignList[i].strList.push({
          word: items[i],
          width: w,
        });
      }
      return 0;
    }
  }

  public get(row: number, col: number): string {
    if (
      col >= this.alignList.length ||
      row >= this.alignList[col].strList.length
    ) {
      return '';
    }
    let spaces = ' '.repeat(
      this.alignList[col].maxWidth - this.alignList[col].strList[row].width,
    );
    return this.alignList[col].align == 'L'
      ? `${this.alignList[col].strList[row].word}${spaces}`
      : `${spaces}${this.alignList[col].strList[row].word}`;
  }
}
