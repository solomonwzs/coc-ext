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
import { getTempFileWithDocumentContents } from '../utils/helper';
import fs from 'fs';
import { showNotification } from '../utils/notify';

export class PrettierFormatter extends BaseFormatter {
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

    const filepath = await getTempFileWithDocumentContents(document);
    const args: string[] = [];
    if (this.setting.args) {
      args.push(...(this.setting.args as string[]));
    }
    args.push(filepath);

    const exec = this.setting.exec ? this.setting.exec : 'prettier';
    const resp = await callShell(exec, args);
    fs.unlinkSync(filepath);
    if (resp.exitCode != 0) {
      showNotification(`prettier fail, ret ${resp.exitCode}`, 'formatter');
      if (resp.error) {
        logger.error(resp.error.toString());
      }
    } else if (resp.data) {
      showNotification('prettier ok', 'formatter');
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
