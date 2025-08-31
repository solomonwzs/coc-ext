import {
  TextDocument,
  FormattingOptions,
  CancellationToken,
  Range,
  TextEdit,
  Uri,
} from 'coc.nvim';
import { BaseFormatter } from './baseformatter';
import { FormatterSetting } from '../utils/types';

export class CmakeFormatter extends BaseFormatter {
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
    let filepath = Uri.parse(doc.uri).fsPath;
    let exec = this.setting.exec ? this.setting.exec : 'cmake-format';
    let args = [filepath];
    return this.callShellFormatDocment(exec, args, doc);
  }
}
