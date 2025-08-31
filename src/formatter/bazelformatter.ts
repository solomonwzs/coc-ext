import {
  TextDocument,
  FormattingOptions,
  CancellationToken,
  Range,
  TextEdit,
} from 'coc.nvim';
import { FormatterSetting } from '../utils/types';
import { BaseFormatter } from './baseformatter';

export class BazelFormatter extends BaseFormatter {
  constructor(public readonly setting: FormatterSetting) {
    super(setting);
  }

  public supportRangeFormat(): boolean {
    return false;
  }

  public async formatDocument(
    doc: TextDocument,
    _options: FormattingOptions,
    _token: CancellationToken,
    range?: Range,
  ): Promise<TextEdit[]> {
    if (range) {
      return [];
    }
    const exec = this.setting.exec ? this.setting.exec : 'buildifier';
    return this.callShellFormatDocment(exec, [], doc);
  }
}
