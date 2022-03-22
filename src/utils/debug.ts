import { workspace, TextEdit, FloatFactory, window } from 'coc.nvim';
import { logger } from './logger';
import { Lightbulb } from '../lightbulb/lightbulb';
import { getDocumentSymbols } from './symbol';

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
    'hello world'
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
  const win = new FloatFactory(workspace.nvim);
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
  window.showMessage(`${tt}`);
}

export async function debugRange(): Promise<any> {
  const doc = await workspace.document;
  const range = await workspace.getSelectedRange('cursor', doc);
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

export async function debug(): Promise<any> {
  const { nvim } = workspace;
  const bufnr = await nvim.call('bufnr', '%');
  // logger.debug(workspace.bufnr);
  // logger.debug(bufnr);
  await getDocumentSymbols(bufnr);
}