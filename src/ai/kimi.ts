import {
  sendHttpRequest,
  sendHttpRequestWithCallback,
  HttpRequest,
  HttpRequestCallback,
  HttpResponse,
} from '../utils/http';
import http from 'http';
import { window, workspace, Position } from 'coc.nvim';
import { logger } from '../utils/logger';
import { CocExtError } from '../utils/common';
import { BaseChatChannel, ChatItem } from './base';

interface KimiChatItem {
  id: string;
  name: string;
  created_at: string;
  updated_at: string;
  status: string;
  type: string;
}

interface KimiChatData {
  event: string;
  id?: string;
  text?: string;
  msg?: {
    type: string;
    title?: string;
    url?: string;
  };
}

interface KimiChatScrollItem {
  id: string;
  context_type: string;
  role: string;
  created_at: string;
  content: string;
  search_plus?: {
    event: string;
    msg: {
      type: string;
      title?: string;
      url?: string;
    };
  }[];
  contents: {
    zones: {
      index: number;
      zone_type: string;
      sections: {
        index: number;
        view: string;
        cmpl?: string;
        ref_cards?: {
          id: string;
          index: string;
          title: string;
          url: string;
        }[];
      }[];
    }[];
  };
}

interface KimiChatRefCardItem {
  segment_id: string;
  ref_doc: {
    id: string;
    index: number;
    title: string;
    url: string;
    rag_segments: {
      id: string;
      index: number;
      text: string;
    }[];
  };
}

interface KimiChatRefCardQuery {
  idx_s: number;
  idx_z: number;
  index: number;
  ref_id: number;
  segment_id: string;
}

class KimiChat extends BaseChatChannel {
  private rtoken: string;
  private headers: http.OutgoingHttpHeaders;
  private urls: string[];

  constructor(public readonly refresh_token: string) {
    super();
    this.rtoken = refresh_token;
    this.headers = {
      'Content-Type': 'application/json',
      'User-Agent':
        'Mozilla/5.0 (Windows NT 10.0; Win64; x64) ' +
        'AppleWebKit/537.36 (KHTML, like Gecko) ' +
        'Chrome/91.0.4472.77 ' +
        'Safari/537.36 ' +
        'Edg/91.0.864.41',
      Origin: 'https://kimi.moonshot.cn',
      Referer: 'https://kimi.moonshot.cn/',
    };
    this.urls = [];
  }

  public getChatName() {
    return 'Kimi';
  }

  public addUrl(url: string) {
    this.urls.push(url);
    return this.urls.length;
  }

  // private checkLineNr2Segment(line: number) {
  //   for (const i of this.segments) {
  //     if (i.start <= line && line <= i.end) {
  //       return i;
  //     }
  //   }
  //   return null;
  // }

  private parseRefId(s: string): {
    type: 'none' | 'ref_card' | 'search_plus';
    id: number;
  } {
    const regex0 = new RegExp(/^\[\^([0-9]*)\^\]$/);
    const arr0 = regex0.exec(s);
    if (arr0 && arr0.length >= 2) {
      return { type: 'ref_card', id: parseInt(arr0[1]) };
    }

    const regex1 = new RegExp(/^\[([0-9]*)\]$/);
    const arr1 = regex1.exec(s);
    if (arr1 && arr1.length >= 2) {
      return { type: 'search_plus', id: parseInt(arr1[1]) };
    }

    return { type: 'none', id: -1 };
  }

  public async getRef() {
    const doc = await workspace.document;
    const pos = await window.getCursorPosition();
    const lines = await doc.buffer.lines;
    const line = lines[pos.line];
    if (!line) {
      return null;
    }
    let start = pos.character;
    while (start >= 0) {
      let ch = line[start];
      if (!ch || ch == '[') break;
      start -= 1;
    }
    if (start < 0) {
      return null;
    }
    let end = pos.character;
    while (end < line.length) {
      let ch = line[end];
      if (!ch || ch == ']') break;
      end += 1;
    }
    if (end >= line.length) {
      return null;
    }
    const text = line.substring(start, end + 1);
    const ref = this.parseRefId(text);
    if (ref.type == 'none') {
      return null;
    } else if (ref.type == 'ref_card') {
      const query = this.getRefCardQuery(pos, start, lines, ref.id);
      if (query == null) {
        return null;
      }
      const card = await this.refCard(query);
      if (card instanceof Error) {
        logger.error(card);
        return null;
      }

      let text = `${card.ref_doc.title}\n\n${card.ref_doc.url}`;
      if (card.ref_doc.rag_segments) {
        text += '\n\n';
        for (const seg of card.ref_doc.rag_segments) {
          text += seg.text.replace(/<\/?label>/gi, '');
        }
      }
      return text;
    } else if (ref.type == 'search_plus') {
      if (ref.id > 0 && ref.id - 1 < this.urls.length) {
        return this.urls[ref.id - 1];
      }
    }
    return null;
  }

  private getRefCardQuery(
    pos: Position,
    start: number,
    lines: string[],
    ref_id: number,
  ): KimiChatRefCardQuery | null {
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

    let index = 0;
    for (let i = line_start + 1; i <= pos.line; ++i) {
      const l = lines[i];
      for (let j = 0; j < l.length; ) {
        const p = l.indexOf('[^', j);
        if (p == -1) {
          break;
        }

        index += 1;
        if (pos.line == i && start == p) {
          return {
            idx_s: 1,
            idx_z: 0,
            index,
            ref_id,
            segment_id,
          };
        } else {
          j = p + 1;
        }
      }
    }
    return null;
  }

  private getHeaders(): http.OutgoingHttpHeaders {
    this.headers['X-Traffic-Id'] = Array.from({ length: 20 }, () =>
      Math.floor(Math.random() * 36).toString(36),
    ).join('');
    return this.headers;
  }

  public async getAccessToken(): Promise<number> {
    this.headers['Authorization'] = `Bearer ${this.rtoken}`;
    const refresh_req: HttpRequest = {
      args: {
        host: 'kimi.moonshot.cn',
        path: '/api/auth/token/refresh',
        method: 'GET',
        protocol: 'https:',
        headers: this.getHeaders(),
        timeout: 1000,
      },
    };
    const resp = await sendHttpRequest(refresh_req);
    if (resp.statusCode == 200 && resp.body) {
      const obj = JSON.parse(resp.body.toString());
      this.headers['Authorization'] = `Bearer ${obj['access_token']}`;
    }
    return resp.statusCode ? resp.statusCode : -1;
  }

  private async sendHttpRequest(
    req: HttpRequest,
  ): Promise<HttpResponse | Error> {
    if (
      !this.headers['Authorization'] &&
      (await this.getAccessToken()) != 200
    ) {
      return new CocExtError(CocExtError.ERR_AUTH, '[Kimi] Auth fail');
    }
    let resp = await sendHttpRequest(req);
    if (resp.statusCode == 401) {
      if ((await this.getAccessToken()) != 200) {
        return new CocExtError(CocExtError.ERR_AUTH, '[Kimi] Auth fail');
      }
      resp = await sendHttpRequest(req);
    }
    return resp;
  }

  public async createChatId(name: string): Promise<string | Error> {
    const req: HttpRequest = {
      args: {
        host: 'kimi.moonshot.cn',
        path: '/api/chat',
        method: 'POST',
        protocol: 'https:',
        headers: this.getHeaders(),
        timeout: 1000,
      },
      data: JSON.stringify({ name, is_example: false }),
    };
    const resp = await this.sendHttpRequest(req);
    if (resp instanceof Error) {
      return new CocExtError(CocExtError.ERR_KIMI, resp.message);
    }
    if (resp.statusCode == 200 && resp.body) {
      const obj = JSON.parse(resp.body.toString());
      return obj['id'];
    } else {
      return new CocExtError(
        CocExtError.ERR_KIMI,
        `statusCode: ${resp.statusCode}`,
      );
    }
  }

  public async getChatList(): Promise<ChatItem[] | Error> {
    const req: HttpRequest = {
      args: {
        host: 'kimi.moonshot.cn',
        path: '/api/chat/list',
        method: 'POST',
        protocol: 'https:',
        headers: this.getHeaders(),
        timeout: 1000,
      },
      data: JSON.stringify({ kimiplus_id: '', offset: 0, size: 50 }),
    };
    const resp = await this.sendHttpRequest(req);
    if (resp instanceof Error) {
      return resp;
    }
    if (resp.statusCode == 200 && resp.body) {
      let obj = JSON.parse(resp.body.toString());
      if (obj['items']) {
        const chat_list = obj['items'] as KimiChatItem[];
        return chat_list.map((i) => {
          return { label: i.name, chat_id: i.id, description: i.updated_at };
        });
      } else {
        return [];
      }
    } else {
      return new CocExtError(
        CocExtError.ERR_KIMI,
        `[Kimi] statusCode: ${resp.statusCode}, error: ${resp.error}, path: ${req.args.path}`,
      );
    }
  }

  public async refCard(
    query: KimiChatRefCardQuery,
  ): Promise<KimiChatRefCardItem | Error> {
    const req: HttpRequest = {
      args: {
        host: 'kimi.moonshot.cn',
        path: '/api/chat/segment/v2/rag-refs',
        method: 'POST',
        protocol: 'https:',
        headers: this.getHeaders(),
        timeout: 1000,
      },
      data: JSON.stringify({ with_rag_segs: true, query: [query] }),
    };
    const resp = await this.sendHttpRequest(req);
    if (resp instanceof Error) {
      return resp;
    }
    if (resp.statusCode == 200 && resp.body) {
      const obj = JSON.parse(resp.body.toString());
      return obj['items'][0];
    }
    return new CocExtError(
      CocExtError.ERR_KIMI,
      `query ref fail, path: ${req.args.path}`,
    );
  }

  private async chatScroll(): Promise<KimiChatScrollItem[] | Error> {
    const req: HttpRequest = {
      args: {
        host: 'kimi.moonshot.cn',
        path: `/api/chat/${this.chat_id}/segment/scroll`,
        method: 'POST',
        protocol: 'https:',
        headers: this.getHeaders(),
        timeout: 1000,
      },
      data: JSON.stringify({ last: 50 }),
    };
    const resp = await this.sendHttpRequest(req);
    if (resp instanceof Error) {
      return resp;
    }
    if (resp.statusCode == 200 && resp.body) {
      let obj = JSON.parse(resp.body.toString());
      if (obj['items']) {
        return obj['items'];
      } else {
        return [];
      }
    } else {
      return new CocExtError(
        CocExtError.ERR_KIMI,
        `statusCode: ${resp.statusCode}, error: ${resp.error}, path: ${req.args.path}`,
      );
    }
  }

  public async showHistoryMessages(): Promise<null | Error> {
    const items = await this.chatScroll();
    if (items instanceof Error) {
      return items;
    }

    for (const item of items) {
      if (item.role == 'user') {
        this.appendUserInput(item.created_at, item.content);
      } else {
        this.append(`>> id:${item.id}\n`);
        if (item.search_plus) {
          for (const search of item.search_plus) {
            if (search.msg.type == 'get_res') {
              let idx = -1;
              if (search.msg.url) {
                idx = this.addUrl(search.msg.url);
              }
              this.append(`[${idx}] ${search.msg.title}`);
            }
          }
          this.append('');
        }
        this.append(item.content);
      }
    }
    return null;
  }

  public async chat(text: string) {
    if (!this.chat_id) {
      return;
    }
    this.appendUserInput(new Date().toISOString(), text);

    let statusCode = -1;
    const cb: HttpRequestCallback = {
      onData: (chunk: Buffer, rsp: http.IncomingMessage) => {
        if (rsp.statusCode != 200) {
          return;
        }
        try {
          // logger.debug(chunk.toString());
          chunk
            .toString()
            .split('\n')
            .forEach((line: string) => {
              if (line.length == 0) {
                return;
              }
              const data = JSON.parse(line.slice(5)) as KimiChatData;
              if (data.event == 'cmpl') {
                if (data.text) {
                  this.append(data.text, false);
                }
              } else if (data.event == 'resp') {
                this.append(`>> id:${data.id}\n`);
              } else if (data.event == 'search_plus') {
                if (
                  data.msg &&
                  data.msg.type == 'get_res' &&
                  data.msg.title &&
                  data.msg.url
                ) {
                  const idx = this.addUrl(data.msg.url);
                  this.append(`[${idx}] ${data.msg.title}`);
                }
              } else if (data.event == 'all_done') {
                this.append(' (END)');
              }
            });
        } catch (e) {
          logger.error(e);
        }
      },
      onEnd: (rsp: http.IncomingMessage) => {
        statusCode = rsp.statusCode ? rsp.statusCode : -1;
      },
      onError: (err: Error) => {
        this.append(' (ERROR) ');
        this.append(err.message);
        statusCode = -1;
      },
      onTimeout: () => {
        statusCode = -1;
      },
    };
    const req: HttpRequest = {
      args: {
        host: 'kimi.moonshot.cn',
        path: `/api/chat/${this.chat_id}/completion/stream`,
        method: 'POST',
        protocol: 'https:',
        headers: this.getHeaders(),
      },
      data: JSON.stringify({
        messages: [
          {
            role: 'user',
            content: text,
          },
        ],
        refs: [],
        use_search: true,
      }),
    };
    await sendHttpRequestWithCallback(req, cb);
    if (statusCode == 401) {
      if ((await this.getAccessToken()) != 200) {
        logger.error('Authorization Expired');
        return;
      }
      await sendHttpRequestWithCallback(req, cb);
    }
    logger.info(statusCode);
  }

  // public async debug() {
  //   console.log(await this.getAccessToken());
  //   console.log(await this.createChatId('Kimi'));
  //   console.log(this.chat_id);

  //   const req: HttpRequest = {
  //     args: {
  //       host: 'kimi.moonshot.cn',
  //       path: `/api/chat/${this.chat_id}/completion/stream`,
  //       method: 'POST',
  //       protocol: 'https:',
  //       headers: this.getHeaders(),
  //     },
  //     data: JSON.stringify({
  //       messages: [
  //         {
  //           role: 'user',
  //           content: '你是翻译员，请翻译成中文：I has a pen',
  //         },
  //       ],
  //       refs: [],
  //       user_search: true,
  //     }),
  //   };
  //   sendHttpRequestWithCallback(req, {
  //     onData: (chunk: Buffer) => {
  //       console.log(chunk.toString());
  //     },
  //   });
  // }
}

export const kimiChat = new KimiChat(
  process.env.MY_AI_KIMI_CHAT_KEY ? process.env.MY_AI_KIMI_CHAT_KEY : '',
);
