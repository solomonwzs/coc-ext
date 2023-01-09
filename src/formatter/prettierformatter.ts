import {
  CancellationToken,
  FormattingOptions,
  Range,
  TextDocument,
  TextEdit,
  workspace,
} from 'coc.nvim';
import { logger } from '../utils/logger';
import { FormatterSetting } from '../utils/types';
import { BaseFormatter } from './baseformatter';
import { callShell } from '../utils/externalexec';
import { showNotification } from '../utils/notify';

const filetype2Parser: Record<string, string> = {
  javascript: 'babel-flow',
};

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

    const args: string[] = [];
    if (this.setting.args) {
      args.push(...(this.setting.args as string[]));
    }

    const { nvim } = workspace;
    const filetype = (await nvim.eval('&filetype')) as string;
    const parser = filetype2Parser[filetype];
    if (parser) {
      args.push(`--parser=${parser}`);
    } else {
      args.push(`--parser=${filetype}`);
    }

    const exec = this.setting.exec ? this.setting.exec : 'prettier';
    const resp = await callShell(exec, args, document.getText());
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
