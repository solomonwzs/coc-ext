import { OutputChannel, window } from 'coc.nvim';
import { getcfg } from './config';
import { stringify } from './common';
import path from 'path';
import { BaseLogger } from '../lib/comm/logger';

export class Logger extends BaseLogger {
  private channel: OutputChannel;
  private detail: boolean;

  constructor() {
    super();
    this.channel = window.createOutputChannel('coc-ext');
    this.detail = getcfg<boolean>('log.detail', false) === true;
    this.level = getcfg<number>('log.level', 1);
  }

  public dispose(): void {
    return this.channel.dispose();
  }

  private padZero(i: number, n: number) {
    return i.toString().padStart(n, '0');
  }

  protected logLevel(level: string, value: any): void {
    const now = new Date();
    const str = stringify(value);
    if (this.detail) {
      const stack = new Error().stack?.split('\n');
      if (stack && stack.length >= 4) {
        const re = /at ((.*) \()?([^:]+):(\d+):(\d+)\)?/g;
        const expl = re.exec(stack[3]);
        if (expl) {
          const func = expl[2];
          const file = path.basename(expl[3]);
          const line = expl[4];
          // const char = expl[5];
          this.channel.appendLine(
            `${now.getFullYear()}-${this.padZero(now.getMonth() + 1, 2)}-${this.padZero(now.getDate(), 2)} ${this.padZero(now.getHours(), 2)}:${this.padZero(now.getMinutes(), 2)}:${this.padZero(now.getSeconds(), 2)} ${level} [${file}:${func}:${line}] ${str}`,
          );
          return;
        }
      }
    }
    const fn = path.basename(__filename);
    this.channel.appendLine(`${level} [${fn}] ${str}`);
  }
}

export const logger = new Logger();
