import {
  workspace,
  FloatWinConfig,
  Range,
  window,
  FloatFactory,
  MapMode,
} from 'coc.nvim';
import getcfg from './config';
import { Nullable } from './types';
// import { logger } from './logger';

function defauleFloatWinConfig(): FloatWinConfig {
  return {
    autoHide: true,
    border: getcfg<boolean>('window.enableBorder', false)
      ? [1, 1, 1, 1]
      : [0, 0, 0, 0],
    close: false,
    maxHeight: getcfg<any>('window.maxHeight', undefined),
    maxWidth: getcfg<any>('window.maxWidth', undefined),
  };
}

export async function getText(mode: MapMode): Promise<string> {
  const doc = await workspace.document;
  let range: Nullable<Range> = null;
  if (mode === 'v') {
    // range = await workspace.getSelectedRange('v', doc);
    const text: string = (
      await workspace.nvim.call('lib#common#visual_selection', 1)
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

export async function popup(
  content: string,
  filetype?: string,
  cfg?: FloatWinConfig,
): Promise<void> {
  if (content.length == 0) {
    return;
  }
  if (!filetype) {
    filetype = 'markdown';
  }
  if (!cfg) {
    cfg = defauleFloatWinConfig();
  }
  const doc = [
    {
      content: content,
      filetype: filetype,
    },
  ];
  const win = new FloatFactory(workspace.nvim);
  await win.show(doc, cfg);
}
