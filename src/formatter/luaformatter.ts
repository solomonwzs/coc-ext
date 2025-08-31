import {
  TextDocument,
  FormattingOptions,
  CancellationToken,
  Range,
  TextEdit,
} from 'coc.nvim';
import { FormatterSetting } from '../utils/types';
import { BaseFormatter } from './baseformatter';

export class LuaFormatter extends BaseFormatter {
  private opts: string[];
  private opts_has_indent_width: boolean;
  private opts_has_usetab: boolean;

  constructor(public readonly setting: FormatterSetting) {
    super(setting);

    this.opts = [];
    this.opts_has_indent_width = false;
    this.opts_has_usetab = false;
    if (this.setting.args) {
      for (const i of this.setting.args as string[]) {
        this.opts.push(i);

        if (i.search('indent-width') != -1) {
          this.opts_has_indent_width = true;
        } else if (i.search('use-tab') != -1) {
          this.opts_has_usetab = true;
        }
      }
    }
  }

  public supportRangeFormat(): boolean {
    return false;
  }

  public async formatDocument(
    doc: TextDocument,
    options: FormattingOptions,
    _token: CancellationToken,
    range?: Range,
  ): Promise<TextEdit[]> {
    if (range) {
      return [];
    }

    let opts: string[] = [];
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
    let exec = this.setting.exec ? this.setting.exec : 'lua-format';
    return this.callShellFormatDocment(exec, this.opts.concat(opts), doc);
  }
}
