import {
  TextDocument,
  FormattingOptions,
  CancellationToken,
  Range,
  TextEdit,
} from 'coc.nvim';
import { logger } from '../utils/logger';
import { FormatterSetting } from '../utils/types';
import { BaseFormatter } from './baseformatter';
import { callShell } from '../utils/externalexec';
import { showNotification } from '../utils/notify';

export class ShellFormatter extends BaseFormatter {
  private opts: string[];

  constructor(public readonly setting: FormatterSetting) {
    super(setting);

    this.opts = [];
    if (this.setting.args) {
      this.opts.push(...(this.setting.args as string[]));
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
    const resp = await callShell(exec, this.opts, document.getText());
    if (resp.exitCode != 0) {
      showNotification(`shfmt fail, ret ${resp.exitCode}`, 'formatter');
      if (resp.error) {
        logger.error(resp.error.toString());
      }
    } else if (resp.data) {
      showNotification('shfmt ok', 'formatter');
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
