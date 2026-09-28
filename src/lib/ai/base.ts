import os from 'os';
import { fsReadFile, fsWriteFile, fsMkdir } from '../comm/file';
import { BaseLogger } from '../comm/logger';

export interface ChatItem {
  label: string;
  chatId: string;
  description: string;
}

export interface ChatRefOptions {
  start: string;
  end: string;
}

export interface ChatRefItem {
  refText: string;
  segmentId: string;
}

export class FileCache {
  private ready: boolean = false;
  constructor(public readonly dir: string) {}

  public async checkDir() {
    if (this.ready) {
      return null;
    }
    let err = await fsMkdir(this.dir, { recursive: true, mode: 0o755 });
    if (err) {
      return err;
    }
    this.ready = true;
    return null;
  }

  public async set(key: string, data: string | NodeJS.ArrayBufferView) {
    let err = await this.checkDir();
    if (err) {
      return err;
    }
    let cacheFile = `${this.dir}/${key}`;
    return await fsWriteFile(cacheFile, data);
  }

  public async get(key: string) {
    let err = await this.checkDir();
    if (err) {
      return err;
    }
    let cacheFile = `${this.dir}/${key}`;
    return await fsReadFile(cacheFile);
  }
}

export abstract class BaseChatChannel {
  public abstract show(): Promise<void>;

  public abstract hide(): Promise<void>;

  public abstract openAutoScroll(): Promise<void>;

  public abstract closeAutoScroll(): Promise<void>;

  public abstract append(text: string): void;
  
  public abstract appendLine(text: string): void;

  public abstract appendUserInput(datetime: string, text: string): void;

  public abstract clear(): void;

  public abstract getCurrentRef(
    opts?: ChatRefOptions,
  ): Promise<null | ChatRefItem>;

  public abstract openSearchWindow(lines: string[]): Promise<void>;

  public abstract popup(
    content: string,
    title?: string,
    filetype?: string,
  ): Promise<void>;
}

interface ChatCompletion {
  type: string;
  data: string;
}
export class ChunkDecoder {
  private cache: Buffer;

  constructor(private logger: BaseLogger | null = null) {
    this.cache = Buffer.from('');
  }

  public decode(buf: Buffer): ChatCompletion[] {
    this.cache = Buffer.concat([this.cache, buf]);

    let out: ChatCompletion[] = [];
    while (this.cache.length > 0) {
      let pos = this.cache.indexOf('\n');
      if (pos < 0) {
        break;
      } else {
        let str = this.cache.subarray(0, pos).toString();
        this.cache = this.cache.subarray(pos + 1);

        let pos0 = str.indexOf(':');
        if (pos0 >= 0) {
          out.push({
            type: str.substring(0, pos0).trim(),
            data: str.substring(pos0 + 1).trim(),
          });
        } else if (str.length > 0 && this.logger != null) {
          this.logger.debug(str);
        }
      }
    }
    return out;
  }
}

export abstract class BaseChat {
  protected chatId: string | undefined;
  protected cache: FileCache;

  constructor(protected chan: BaseChatChannel) {
    this.chatId = undefined;
    this.cache = new FileCache(
      `${os.homedir}/.cache/chat_${this.getChatName()}`,
    );
  }

  public getCurrentChatId() {
    return this.chatId;
  }

  public setCurrentChatId(chatId: string) {
    this.chatId = chatId;
    this.chan.clear();
  }

  public async sendChat(text: string) {
    await this.chan.openAutoScroll();
    await this.chat(text);
    this.chan.closeAutoScroll();
  }

  public async show() {
    await this.chan.show();
  }

  public hide() {
    this.chan.hide();
  }

  public clear() {
    this.chan.clear();
  }

  public abstract reset(): void;
  public abstract getChatName(): string;
  public abstract getChatList(): Promise<ChatItem[] | Error>;
  public abstract createChatId(name: string): Promise<string | Error>;
  public abstract showHistoryMessages(): Promise<null | Error>;
  public abstract showItem(): Promise<void>;
  public abstract chat(text: string): Promise<void>;
  public abstract delSession(chatId: string): Promise<null | Error>;
}
