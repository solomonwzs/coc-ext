import {
  TextDocument,
  FormattingOptions,
  CancellationToken,
  Range,
  TextEdit,
} from 'coc.nvim';
import { FormatterSetting } from '../utils/types';

export abstract class BaseFormatter {
  protected setting: FormatterSetting;

  constructor(public readonly s: FormatterSetting) {
    this.setting = s;
  }

  public abstract formatDocument(
    document: TextDocument,
    options: FormattingOptions,
    token: CancellationToken,
    range?: Range,
  ): Promise<TextEdit[]>;

  public abstract supportRangeFormat(): boolean;
}
