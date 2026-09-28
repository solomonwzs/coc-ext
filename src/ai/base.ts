import { OutputChannel, window, workspace } from 'coc.nvim';
import { cocLogger } from '../utils/logger';
import { BaseChatChannel, ChatRefOptions, ChatRefItem } from '../lib/ai/base';
import { popup, ScratchWindow } from '../utils/helper';

export class CocChatChannel extends BaseChatChannel {
  protected channel: OutputChannel;
  protected winid: number;

  constructor(
    protected chatName: string,
    protected scratchWindow: ScratchWindow,
  ) {
    super();
    this.channel = window.createOutputChannel(chatName);
    this.winid = -1;
  }

  public async show() {
    let { nvim } = workspace;
    let winid = await nvim.call('bufwinid', this.chatName);
    if (winid == -1) {
      this.channel.show();
      winid = await nvim.call('bufwinid', this.chatName);
      // let bufnr = (await nvim.call('bufnr', this.chatName)) as number;
      await nvim.call('win_execute', [winid, 'setl wrap']);
      await nvim.call('win_execute', [winid, 'set ft=markdown']);
    } else {
      await nvim.call('win_gotoid', [winid]);
    }
    await nvim.call('win_execute', [winid, 'norm G']);
  }

  public async hide() {
    this.channel.hide();
  }

  public async openAutoScroll() {
    let { nvim } = workspace;
    this.winid = (await nvim.call('bufwinid', this.chatName)) as number;
  }

  public async closeAutoScroll() {
    this.winid = -1;
  }

  private append0(text: string, newline: boolean = true) {
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

  public append(text: string) {
    this.append0(text, false);
  }

  public appendLine(text: string) {
    this.append0(text, true);
  }

  public appendUserInput(datetime: string, text: string) {
    this.append0(`\n>> ${datetime}`);
    let lines = text.split('\n');
    for (const i of lines) {
      this.append0(`>> ${i}`);
    }
  }

  public clear() {
    if (this.channel.content.length != 0) {
      this.channel.dispose();
      this.channel = window.createOutputChannel(this.chatName);
      this.winid = -1;
    }
  }

  public async popup(content: string, title?: string, filetype?: string) {
    await popup(content, title, filetype);
  }

  public async openSearchWindow(lines: string[]) {
    await this.scratchWindow.open(lines);
  }

  public async getCurrentRef(
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
    let refText = line.substring(start, end + 1);

    let lineStart = pos.line - 1;
    let segmentId = '';
    for (; lineStart >= 0; --lineStart) {
      const l = lines[lineStart];
      if (l.length > 6 && l.slice(0, 6) == '>> id:') {
        segmentId = l.slice(6).trim();
        break;
      }
    }
    if (segmentId.length == 0) {
      return null;
    }
    return {
      refText,
      segmentId,
    };
  }
}

interface ChatCompletion {
  type: string;
  data: string;
}
export class ChunkDecoder {
  private cache: Buffer;

  constructor() {
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
        } else if (str.length > 0) {
          cocLogger.debug(str);
        }
      }
    }
    return out;
  }
}
