import path from 'path';
import { stringify } from './common';

export abstract class BaseLogger {
  protected level: number;

  constructor() {
    this.level = 1;
  }

  protected abstract logLevel(level: string, value: any): void;

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

export class CommLogger extends BaseLogger {
  protected logLevel(level: string, value: any): void {
    const fn = path.basename(__filename);
    const str = stringify(value);
    console.log(`${level} [${fn}] ${str}`);
  }
}
