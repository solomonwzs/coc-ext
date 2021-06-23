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

export class FormattingEditProvider
  implements
    DocumentFormattingEditProvider,
    DocumentRangeFormattingEditProvider
{
  constructor() {}

  private async _provideEdits(
    document: TextDocument,
    options: FormattingOptions,
    token: CancellationToken,
    range?: Range,
  ): Promise<TextEdit[]> {
    logger.info('format');
    return [];
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
