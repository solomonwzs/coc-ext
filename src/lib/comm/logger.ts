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
