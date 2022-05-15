import {
  TextDocument,
  FormattingOptions,
  CancellationToken,
  Range,
  TextEdit,
  Uri,
} from 'coc.nvim';
import { logger } from '../utils/logger';
import { FormatterSetting } from '../utils/types';
import { BaseFormatter } from './baseformatter';
import { callShell } from '../utils/externalexec';
import { showNotification } from '../utils/notify';

export class ClfFormatter extends BaseFormatter {
  constructor(public readonly setting: FormatterSetting) {
    super(setting);
  }

  public supportRangeFormat(): boolean {
    return false;
  }

  public async formatDocument(
    document: TextDocument,
    options: FormattingOptions,
    _token: CancellationToken,
    range?: Range
  ): Promise<TextEdit[]> {
    if (range) {
      return [];
    }

    const filepath = Uri.parse(document.uri).fsPath;
    const setting: Record<string, string> = {};
    if (this.setting.args) {
      for (const k in this.setting.args) {
        setting[k] = this.setting.args[k];
      }
    }
    if (options.tabSize !== undefined && !setting['IndentWidth']) {
      setting['IndentWidth'] = options.tabSize.toString();
    }
    if (options.insertSpaces !== undefined && !setting['UseTab']) {
      setting['UseTab'] = options.insertSpaces ? 'false' : 'true';
    }
    if (!setting['BasedOnStyle']) {
      setting['BasedOnStyle'] = 'Google';
    }
    const args: string[] = [
      '-style',
      JSON.stringify(setting),
      '--assume-filename',
      filepath,
    ];

    // if (range) {
    //   args.push('--lines', `${range.start.line}:${range.end.line}`);
    // }

    const exec = this.setting.exec ? this.setting.exec : 'clang-format';
    const resp = await callShell(exec, args, document.getText());
    if (resp.exitCode != 0) {
      showNotification(`clang-format fail, ret ${resp.exitCode}`, 'formatter');
      if (resp.error) {
        logger.error(resp.error.toString());
      }
    } else if (resp.data) {
      showNotification('clang-format ok', 'formatter');
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
