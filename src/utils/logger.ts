import { OutputChannel, window } from 'coc.nvim';

class Logger {
  private channel: OutputChannel;

  constructor() {
    this.channel = window.createOutputChannel('coc-ext');
  }

  public dispose(): void {
    return this.channel.dispose();
  }

  public logLevel(level: string, message: string): void {
    const now = new Date();
    this.channel.appendLine(`${now.toISOString()} [${level}] ${message}`);
  }

  public debug(message: string): void {
    this.logLevel('D', message);
  }

  public info(message: string): void {
    this.logLevel('I', message);
  }

  public warn(message: string): void {
    this.logLevel('W', message);
  }

  public err(message: string): void {
    this.logLevel('E', message);
  }
}

export const logger = new Logger();
