import {
  CancellationToken,
  FormattingOptions,
  Range,
  TextDocument,
  TextEdit,
  workspace,
} from 'coc.nvim';
import { FormatterSetting } from '../utils/types';
import { BaseFormatter } from './baseformatter';

const filetype2Parser: Record<string, string> = {
  javascript: 'babel-flow',
  xml: 'html',
};

export class PrettierFormatter extends BaseFormatter {
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

    let args: string[] = [];
    if (this.setting.args) {
      args.push(...(this.setting.args as string[]));
    }

    let { nvim } = workspace;
    let filetype = (await nvim.eval('&filetype')) as string;
    let parser = filetype2Parser[filetype];
    if (parser) {
      args.push(`--parser=${parser}`);
    } else {
      args.push(`--parser=${filetype}`);
    }
    if (parser == 'html') {
      args.push('--html-whitespace-sensitivity=ignore');
    }

    let exec = this.setting.exec ? this.setting.exec : 'prettier';

    return this.callShellFormatDocment(exec, args, doc);
  }
}
