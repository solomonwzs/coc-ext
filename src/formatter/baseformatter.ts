import {
  DocumentFormattingEditProvider,
  DocumentRangeFormattingEditProvider,
  TextDocument,
  FormattingOptions,
  CancellationToken,
  Range,
  TextEdit,
  ProviderResult,
  Uri,
  workspace,
} from 'coc.nvim';
import { logger } from '../utils/logger';
import path from 'path';
