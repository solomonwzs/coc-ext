import {
  FloatFactory,
  FloatWinConfig,
  Neovim,
  Range,
  window,
  workspace,
} from 'coc.nvim';
import { getcfg } from './config';
import { ActionMode, KeymapMode, Nullable } from './types';
import { showNotification } from '../utils/notify';

// import { logger } from './logger';

export default class Manager {
  private keymapMode: KeymapMode;
  private actionMode: ActionMode;
  private floatwin: FloatFactory;
  private fileType: string;

  constructor(private nvim: Neovim) {
    this.floatwin = window.createFloatFactory(this.floatWinConfig);
    this.fileType = 'markdown';
  }

  public setFileType(type: string): Manager {
    this.fileType = type;
    return this;
  }

  public setKeymapMode(mode: KeymapMode): Manager {
    this.keymapMode = mode;
    return this;
  }

  public setActionMode(mode: ActionMode): Manager {
    this.actionMode = mode;
    return this;
  }

  public async show(text?: string): Promise<void> {
    if (text == undefined || !(text.trim().length > 0)) {
      text = await this.getText();
    }
    if (!text) {
      return;
    }
    switch (this.actionMode) {
      case 'popup':
        await this.popup(text);
        break;
      case 'echo':
        await this.echo(text);
        break;
      case 'replace':
        await this.replace(text);
        break;
      default:
        break;
    }
  }

  public async getText(): Promise<string> {
    const doc = await workspace.document;
    let range: Nullable<Range> = null;
    if (this.keymapMode === 'n') {
      const pos = await window.getCursorPosition();
      range = doc.getWordRangeAtPosition(pos);
    } else {
      range = await window.getSelectedRange('v');
    }
    let text = '';
    if (!range) {
      text = (await workspace.nvim.eval('expand("<cword>")')).toString();
    } else {
      text = doc.textDocument.getText(range);
    }
    return text.trim();
  }

  private async popup(content: string): Promise<void> {
    if (content.length == 0) {
      return;
    }
    const docs = [
      {
        content: content,
        filetype: this.fileType,
      },
    ];
    await this.floatwin.show(docs);
  }

  private async echo(content: string): Promise<void> {
    workspace.nvim.call(
      'coc#util#echo_messages',
      ['MoreMsg', content.split('\n')],
      true,
    );
  }

  private async replace(content: string): Promise<void> {
    if (content.length == 0) {
      showNotification('No paraphrase for replacement');
    }
    this.nvim.pauseNotification();
    this.nvim.command('let reg_tmp=@a', true);
    this.nvim.command(`let @a='${content}'`, true);
    this.nvim.command('normal! viw"ap', true);
    this.nvim.command('let @a=reg_tmp', true);
    await this.nvim.resumeNotification();
  }

  private get floatWinConfig(): FloatWinConfig {
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
}
