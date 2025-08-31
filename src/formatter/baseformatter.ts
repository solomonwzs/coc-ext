import {
  TextDocument,
  FormattingOptions,
  CancellationToken,
  Range,
  TextEdit,
} from 'coc.nvim';
import { FormatterSetting } from '../utils/types';
import { callShell } from '../utils/externalexec';
import { showNotification } from '../utils/notify';
import { logger } from '../utils/logger';

export abstract class BaseFormatter {
  protected setting: FormatterSetting;

  constructor(public readonly s: FormatterSetting) {
    this.setting = s;
  }

  public abstract formatDocument(
    document: TextDocument,
    options: FormattingOptions,
    token: CancellationToken,
    range?: Range,
  ): Promise<TextEdit[]>;

  public abstract supportRangeFormat(): boolean;

  protected async callShellFormatDocment(
    exec: string,
    args: string[],
    doc: TextDocument,
  ): Promise<TextEdit[]> {
    let resp = await callShell(exec, args, doc.getText());
    if (resp.exitCode != 0) {
      showNotification(`${exec} fail, ret ${resp.exitCode}`, 'formatter');
      if (resp.error) {
        logger.error(resp.error.toString());
      }
    } else if (resp.data) {
      showNotification(`${exec} ok`, 'formatter');
      return [
        TextEdit.replace(
          {
            start: { line: 0, character: 0 },
            end: { line: doc.lineCount, character: 0 },
          },
          resp.data.toString(),
        ),
      ];
    }
    return [];
  }
}
