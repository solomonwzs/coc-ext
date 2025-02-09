import { OutputChannel, window, workspace } from 'coc.nvim';

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

  protected chat_id: string | undefined;

  constructor() {
    this.channel = null;
    this.bufnr = -1;
    this.chat_id = undefined;
    this.chat_name = this.getChatName();
    this.winid = -1;
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
