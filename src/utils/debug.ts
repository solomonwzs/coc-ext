import { window, workspace, TextEdit } from 'coc.nvim';
import { logger } from './logger';
import { sleepMs } from './helper';
import { Lightbulb } from '../lightbulb/lightbulb';
import { getDocumentSymbols, getCursorSymbolList } from './symbol';
import { showNotification } from '../utils/notify';

export async function debugWindow(): Promise<any> {
  const id: number = await workspace.nvim.call('ui#window#new', {
    position: 'top',
  });
  const w = workspace.nvim.createWindow(id);
  logger.info(w.id);
}

export async function debugApplyEdit(): Promise<any> {
  const doc = await workspace.document;
  const ed = TextEdit.replace(
    {
      start: { line: 0, character: 0 },
      end: { line: doc.lineCount, character: 0 },
    },
    'hello world',
  );
  await doc.applyEdits([ed]);
  await workspace.nvim.command('setlocal nomodifiable');
}

export async function debugLuaEval(): Promise<any> {
  const x = await workspace.nvim.call('luaeval', [
    'print(_A[1] + _A[2])',
    [2, 3],
  ]);
  logger.debug(x);
  await workspace.nvim.call('luaeval', ['vim.notify(_A)', 'hi']);
  await workspace.nvim.call('luaeval', [
    'require("coc-ext").quickpick(_A[1], _A[2], _A[3])',
    ['hello', [1, 2, 3], 'coc.quickpick.12345'],
  ]);
}

export async function debugFloatFactory(): Promise<any> {
  const doc = [
    {
      content: '[title]\n\nabc@edf.com',
      filetype: 'markdown',
    },
  ];
  const win = window.createFloatFactory({});
  await win.show(doc);
}

export async function debugSelection(): Promise<any> {
  const doc = await workspace.document;
  logger.debug(doc.lineCount);
  // window.showMessage(`test, ${text}`);
  // workspace.nvim.command(`echo "${text}"`);
  const tt = (
    await workspace.nvim.call('lib#common#visual_selection', 1)
  ).toString();
  showNotification(`${tt}`);
}

export async function debugRange(): Promise<any> {
  const range = await window.getSelectedRange('cursor');
  logger.debug(range);
}

export async function debugLightbulb(): Promise<any> {
  const doc = await workspace.document;
  if (!doc || !doc.attached) {
    return;
  }

  const lightbulb = new Lightbulb();
  // const buffer = doc.buffer;
  if (!(await lightbulb.show(doc))) {
    return;
  }
}

export async function debugSymbol(): Promise<any> {
  const { nvim } = workspace;
  const bufnr = await nvim.call('bufnr', '%');
  // logger.debug(workspace.bufnr);
  // logger.debug(bufnr);
  const sym = await getDocumentSymbols(bufnr);
  logger.debug(sym);
}

export async function debug(cmd: string, ...args: any[]): Promise<any> {
  // const x = await getCursorSymbolList();
  // logger.debug(x);
  // await new Promise((resolve) => setTimeout(resolve, 2000));
  logger.debug(cmd);
  logger.debug(args);
  let channel = window.createOutputChannel('debug');
  channel.show();

  // let { nvim } = workspace;
  // let winid = await nvim.call('bufwinid', `debug`);
  // nvim.call('coc#compat#execute', [winid, 'setl scrolloff=3'], true);

  for (let i = 0; i < 100; ++i) {
    channel.appendLine(`=> ${i}`);
    await sleepMs(50);
  }
}
