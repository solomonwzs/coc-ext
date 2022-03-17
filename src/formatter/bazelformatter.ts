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
import { callShell } from '../utils/externalexec';

export class BazelFormatter extends BaseFormatter {
  constructor(public readonly setting: FormatterSetting) {
    super(setting);
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

    const exec = this.setting.exec ? this.setting.exec : 'buildifier';
    const resp = await callShell(exec, [], document.getText());
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
