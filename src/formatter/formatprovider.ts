import {
  DocumentFormattingEditProvider,
  DocumentRangeFormattingEditProvider,
  TextDocument,
  FormattingOptions,
  CancellationToken,
  Range,
  TextEdit,
  ProviderResult,
  window,
} from 'coc.nvim';
import { logger } from '../utils/logger';
// import getcfg from '../utils/config';
import { FormatterSetting } from '../utils/types';
import { BaseFormatter } from '../formatter/baseformatter';
import { ClfFormatter } from '../formatter/clfformatter';
import { PrettierFormatter } from '../formatter/prettierformatter';

export class FormattingEditProvider
  implements
    DocumentFormattingEditProvider,
    DocumentRangeFormattingEditProvider
{
  private formatter: BaseFormatter | null;

  constructor(setting: FormatterSetting) {
    if (setting.provider == 'clang-format') {
      this.formatter = new ClfFormatter(setting);
    } else if (setting.provider == 'prettier') {
      this.formatter = new PrettierFormatter(setting);
    } else {
      this.formatter = null;
    }
  }

  private async _provideEdits(
    document: TextDocument,
    options: FormattingOptions,
    token: CancellationToken,
    range?: Range,
  ): Promise<TextEdit[]> {
    if (!this.formatter) {
      logger.error('formatter was null');
      window.showMessage('formatter was null');
      return [];
    }
    return this.formatter.formatDocument(document, options, token, range);
  }

  provideDocumentFormattingEdits(
    document: TextDocument,
    options: FormattingOptions,
    token: CancellationToken,
  ): ProviderResult<TextEdit[]> {
    return this._provideEdits(document, options, token);
  }

  provideDocumentRangeFormattingEdits(
    document: TextDocument,
    range: Range,
    options: FormattingOptions,
    token: CancellationToken,
  ): ProviderResult<TextEdit[]> {
    return this._provideEdits(document, options, token, range);
  }
}
