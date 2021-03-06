import {
  TextDocument,
  FormattingOptions,
  CancellationToken,
  Range,
  TextEdit,
  window,
} from 'coc.nvim';
import { logger } from '../utils/logger';
import { FormatterSetting } from '../utils/types';
import { BaseFormatter } from './baseformatter';
import { call_shell } from '../utils/externalexec';

export class LuaFormatter extends BaseFormatter {
  private opts: string[];
  private opts_has_indent_width: boolean;
  private opts_has_usetab: boolean;

  constructor(public readonly setting: FormatterSetting) {
    super(setting);

    this.opts = [];
    this.opts_has_indent_width = false;
    this.opts_has_usetab = false;
    if (this.setting.luaFormatOptions) {
      for (const i in this.setting.luaFormatOptions) {
        this.opts.push(this.setting.luaFormatOptions[i]);

        if (this.setting.luaFormatOptions[i].search('indent-width') != -1) {
          this.opts_has_indent_width = true;
        } else if (this.setting.luaFormatOptions[i].search('use-tab') != -1) {
          this.opts_has_usetab = true;
        }
      }
    }
  }

  public supportRangeFormat(): boolean {
    return false;
  }

  public async formatDocument(
    document: TextDocument,
    options: FormattingOptions,
    _token: CancellationToken,
    range?: Range
  ): Promise<TextEdit[]> {
    if (range) {
      return [];
    }

    const opts: string[] = [];
    if (options.tabSize !== undefined && !this.opts_has_indent_width) {
      opts.push(`--indent-width=${options.tabSize}`);
    }
    if (options.insertSpaces !== undefined && !this.opts_has_usetab) {
      if (options.insertSpaces) {
        opts.push('--no-use-tab');
      } else {
        opts.push('--use-tab');
      }
    }

    const exec = this.setting.exec ? this.setting.exec : 'lua-format';
    const resp = await call_shell(
      exec,
      this.opts.concat(opts),
      document.getText()
    );
    if (resp.exitCode != 0) {
      window.showMessage(`lua-format fail, ret ${resp.exitCode}`);
      if (resp.error) {
        logger.error(resp.error.toString());
      }
    } else if (resp.data) {
      window.showMessage('lua-format ok');
      return [
        TextEdit.replace(
          {
            start: { line: 0, character: 0 },
            end: { line: document.lineCount, character: 0 },
          },
          resp.data.toString()
        ),
      ];
    }
    return [];
  }
}
