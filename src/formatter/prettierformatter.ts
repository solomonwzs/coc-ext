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
import { getTempFileWithDocumentContents } from '../utils/helper';
import fs from 'fs';

export class PrettierFormatter extends BaseFormatter {
  constructor(public readonly setting: FormatterSetting) {
    super(setting);
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

    const filepath = await getTempFileWithDocumentContents(document);
    const argv: string[] = [];
    if (this.setting.prettierOptions) {
      argv.push(...this.setting.prettierOptions);
    }
    argv.push(filepath);

    const exec = this.setting.exec ? this.setting.exec : 'prettier';
    const resp = await call_shell(exec, argv);
    fs.unlinkSync(filepath);
    if (resp.exitCode != 0) {
      window.showMessage(`prettier fail, ret ${resp.exitCode}`);
      if (resp.error) {
        logger.error(resp.error.toString());
      }
    } else if (resp.data) {
      window.showMessage('prettier ok');
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
