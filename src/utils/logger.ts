import { OutputChannel, window } from 'coc.nvim';
import getcfg from './config';
import path from 'path';

class Logger {
  private channel: OutputChannel;
  private detail: boolean;
  private level: number;

  constructor() {
    this.channel = window.createOutputChannel('coc-ext');
    this.detail = getcfg<boolean>('log.detail', false) === true;
    this.level = getcfg<number>('log.level', 1);
  }

  public dispose(): void {
    return this.channel.dispose();
  }

  private logLevel(level: string, value: any): void {
    const now = new Date();
    let str: string;
    if (typeof value === 'string') {
      str = value;
    } else if (value instanceof String) {
      str = value.toString();
    } else {
      str = JSON.stringify(value, null, 2);
    }
    if (this.detail) {
      const stack = new Error().stack?.split('\n');
      if (stack && stack.length >= 4) {
        const re = /at ((.*) \()?([^:]+):(\d+):(\d+)\)?/g;
        const expl = re.exec(stack[3]);
        if (expl) {
          // const func = expl[2];
          const file = path.basename(expl[3]);
          const line = expl[4];
          // const char = expl[5];
          this.channel.appendLine(
            `${now.toISOString()} ${level} [${file}:${line}] ${str}`,
          );
          return;
        }
      }
    }
    this.channel.appendLine(`${now.toISOString()} ${level} ${str}`);
  }

  public debug(value: any): void {
    if (this.level > 0) {
      return;
    }
    this.logLevel('D', value);
  }

  public info(value: any): void {
    if (this.level > 1) {
      return;
    }
    this.logLevel('I', value);
  }

  public warn(value: any): void {
    if (this.level > 2) {
      return;
    }
    this.logLevel('W', value);
  }

  public error(message: any): void {
    this.logLevel('E', message);
  }
}

export const logger = new Logger();
