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

export class ShellFormatter extends BaseFormatter {
  private opts: string[];

  constructor(public readonly setting: FormatterSetting) {
    super(setting);

    this.opts = [];
    if (this.setting.shellFormatOptions) {
      for (const i of this.setting.shellFormatOptions) {
        this.opts.push(i);
      }
    }
  }

  public supportRangeFormat(): boolean {
    return false;
  }

  public async formatDocument(
    document: TextDocument,
    _options: FormattingOptions,
    _token: CancellationToken,
    range?: Range
  ): Promise<TextEdit[]> {
    if (range) {
      return [];
    }

    const exec = this.setting.exec ? this.setting.exec : 'shfmt';
    const resp = await call_shell(exec, this.opts, document.getText());
    if (resp.exitCode != 0) {
      window.showMessage(`buildifier fail, ret ${resp.exitCode}`);
      if (resp.error) {
        logger.error(resp.error.toString());
      }
    } else if (resp.data) {
      window.showMessage('buildifier ok');
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
