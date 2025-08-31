import {
  TextDocument,
  FormattingOptions,
  CancellationToken,
  Range,
  TextEdit,
  Uri,
} from 'coc.nvim';
import { FormatterSetting } from '../utils/types';
import { BaseFormatter } from './baseformatter';
import fs from 'fs';
import path from 'path';
import { fsAccess } from '../utils/file';

export class ClfFormatter extends BaseFormatter {
  constructor(public readonly setting: FormatterSetting) {
    super(setting);
  }

  public supportRangeFormat(): boolean {
    return false;
  }

  private async confFileExist(filepath: string) {
    let p = path.dirname(filepath);
    while (true) {
      if (
        (await fsAccess(path.join(p, '.clang-format'), fs.constants.F_OK)) ==
          null ||
        (await fsAccess(path.join(p, '_clang-format'), fs.constants.F_OK)) ==
          null
      ) {
        return true;
      }

      let p0 = path.dirname(p);
      if (p == p0) {
        return false;
      } else {
        p = p0;
      }
    }
  }

  private getSetting(
    options: FormattingOptions,
  ): Record<string, string | number | boolean> {
    const setting: Record<string, string | number | boolean> = {};
    if (this.setting.args) {
      for (const k in this.setting.args) {
        setting[k] = this.setting.args[k];
      }
    }
    if (options.tabSize !== undefined && !setting['IndentWidth']) {
      setting['IndentWidth'] = options.tabSize.toString();
    }
    if (options.insertSpaces !== undefined && !setting['UseTab']) {
      setting['UseTab'] = options.insertSpaces ? false : true;
    }
    if (!setting['BasedOnStyle']) {
      setting['BasedOnStyle'] = 'Google';
    }
    return setting;
  }

  public async formatDocument(
    doc: TextDocument,
    options: FormattingOptions,
    _token: CancellationToken,
    range?: Range,
  ): Promise<TextEdit[]> {
    if (range) {
      return [];
    }
    let filepath = Uri.parse(doc.uri).fsPath;
    let args = (await this.confFileExist(filepath))
      ? ['--assume-filename', filepath]
      : [
          '-style',
          JSON.stringify(this.getSetting(options)),
          '--assume-filename',
          filepath,
        ];
    // if (range) {
    //   args.push('--lines', `${range.start.line}:${range.end.line}`);
    // }
    let exec = this.setting.exec ? this.setting.exec : 'clang-format';
    return this.callShellFormatDocment(exec, args, doc);
  }
}
