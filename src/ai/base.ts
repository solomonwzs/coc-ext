import { OutputChannel, window, workspace } from 'coc.nvim';
import os from 'os';
import { fsReadFile, fsWriteFile, fsMkdir } from '../utils/file';

export interface ChatItem {
  label: string;
  chat_id: string;
  description: string;
}

export abstract class BaseChatChannel {
  private channel: OutputChannel | null;
  private bufnr: number;
  private chat_name: string;
  private winid: number;

  protected cache_dir: string;
  protected chat_id: string | undefined;

  constructor() {
    this.channel = null;
    this.bufnr = -1;
    this.chat_id = undefined;
    this.chat_name = this.getChatName();
    this.winid = -1;
    this.cache_dir = '';
  }

  protected async checkCacheDir() {
    if (this.cache_dir.length != 0) {
      return null;
    }
    let dir = `${os.homedir}/.cache/chat_${this.getChatName()}`;
    let err = await fsMkdir(dir, { recursive: true, mode: 0o755 });
    if (err) {
      return err;
    }
    this.cache_dir = dir;
    return null;
  }

  protected async setFileCache(
    key: string,
    data: string | NodeJS.ArrayBufferView,
  ) {
    let err = await this.checkCacheDir();
    if (err) {
      return err;
    }
    let cache_file = `${this.cache_dir}/${key}`;
    return await fsWriteFile(cache_file, data);
  }

  protected async getFileCache(key: string) {
    let err = await this.checkCacheDir();
    if (err) {
      return err;
    }
    let cache_file = `${this.cache_dir}/${key}`;
    return await fsReadFile(cache_file);
  }

  public getCurrentChatId() {
    return this.chat_id;
  }

  public setCurrentChatId(chat_id: string) {
    this.chat_id = chat_id;
  }

  public async openAutoScroll() {
    let { nvim } = workspace;
    this.winid = await nvim.call(
      'bufwinid',
      `${this.chat_name}-${this.chat_id}`,
    );
  }

  public closeAutoScroll() {
    this.winid = -1;
  }

  public async bufferLines() {
    const doc = workspace.getDocument(this.bufnr);
    if (doc == null) {
      return -1;
    }
    return (await doc.buffer.lines).length;
  }

  public append(text: string, newline: boolean = true) {
    if (this.channel) {
    } else if (this.chat_id) {
      this.channel = window.createOutputChannel(
        `${this.chat_name}-${this.chat_id}`,
      );
    } else {
      return;
    }
    if (newline) {
      this.channel.appendLine(text);
    } else {
      this.channel.append(text);
    }

    if (this.winid != -1) {
      let { nvim } = workspace;
      nvim.call('win_execute', [this.winid, 'norm G']);
    }
  }

  public appendUserInput(datetime: string, text: string) {
    this.append(`\n>> ${datetime}`);
    let lines = text.split('\n');
    for (const i of lines) {
      this.append(`>> ${i}`);
    }
  }

  public async show() {
    if (!this.chat_id) {
      return;
    }

    const name = `${this.chat_name}-${this.chat_id}`;
    if (!this.channel) {
      this.channel = window.createOutputChannel(name);
    }

    let { nvim } = workspace;
    let winid = await nvim.call('bufwinid', name);
    if (winid == -1) {
      this.channel.show();
      winid = await nvim.call('bufwinid', name);
      this.bufnr = await nvim.call('bufnr', name);
      await nvim.call('coc#compat#execute', [winid, 'setl wrap']);
      await nvim.call('win_execute', [winid, 'set ft=aichat']);
    } else {
      await nvim.call('win_gotoid', [winid]);
    }

    await nvim.call('setbufvar', [this.bufnr, 'ai_name', this.chat_name]);
    await nvim.call('win_execute', [winid, 'norm G']);
  }

  public abstract getChatName(): string;
  public abstract getChatList(): Promise<ChatItem[] | Error>;
  public abstract createChatId(name: string): Promise<string | Error>;
  public abstract showHistoryMessages(): Promise<null | Error>;
  public abstract chat(text: string): Promise<void>;
}

interface ChatRefOptions {
  start: string;
  end: string;
}
interface ChatRefItem {
  ref_text: string;
  segment_id: string;
}
export async function getCurrentRef(
  opts?: ChatRefOptions,
): Promise<null | ChatRefItem> {
  let doc = await workspace.document;
  let pos = await window.getCursorPosition();
  let lines = await doc.buffer.lines;
  let line = lines[pos.line];
  if (!line) {
    return null;
  }

  let ch0 = opts ? opts.start : '[';
  let ch1 = opts ? opts.start : ']';
  let start = pos.character;
  while (start >= 0) {
    let ch = line[start];
    if (!ch || ch == ch0) break;
    start -= 1;
  }
  if (start < 0) {
    return null;
  }
  let end = pos.character;
  while (end < line.length) {
    let ch = line[end];
    if (!ch || ch == ch1) break;
    end += 1;
  }
  if (end >= line.length) {
    return null;
  }
  let ref_text = line.substring(start, end + 1);

  let line_start = pos.line - 1;
  let segment_id = '';
  for (; line_start >= 0; --line_start) {
    const l = lines[line_start];
    if (l.length > 6 && l.slice(0, 6) == '>> id:') {
      segment_id = l.slice(6).trim();
      break;
    }
  }
  if (segment_id.length == 0) {
    return null;
  }
  return {
    ref_text,
    segment_id,
  };
}
