import {
  DocumentFormattingEditProvider,
  DocumentRangeFormattingEditProvider,
  TextDocument,
  FormattingOptions,
  CancellationToken,
  Range,
  TextEdit,
  ProviderResult,
} from 'coc.nvim';
import { logger } from '../utils/logger';
// import getcfg from '../utils/config';
import { FormatterSetting } from '../utils/types';
import { BaseFormatter } from '../formatter/baseformatter';
import { ClfFormatter } from '../formatter/clfformatter';
import { PrettierFormatter } from '../formatter/prettierformatter';
import { BazelFormatter } from '../formatter/bazelformatter';
import { LuaFormatter } from '../formatter/luaformatter';
import { ShellFormatter } from '../formatter/shellformatter';
import { showNotification } from '../utils/notify';

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
    } else if (setting.provider == 'bazel-buildifier') {
      this.formatter = new BazelFormatter(setting);
    } else if (setting.provider == 'lua-format') {
      this.formatter = new LuaFormatter(setting);
    } else if (setting.provider == 'shfmt') {
      this.formatter = new ShellFormatter(setting);
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
      showNotification('formatter was null', 'formatter');
      return [];
    }
    return this.formatter.formatDocument(document, options, token, range);
  }

  supportRangeFormat(): boolean {
    if (this.formatter) {
      return this.formatter.supportRangeFormat();
    }
    return false;
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
