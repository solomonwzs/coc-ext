import {
  sendHttpRequest,
  sendHttpRequestWithCallback,
  HttpRequest,
  HttpRequestCallback,
  HttpResponse,
} from '../utils/http';
import http from 'http';
import { logger } from '../utils/logger';
import { CocExtError } from '../utils/common';
import { BaseChatChannel, ChatItem, getCurrentRef } from './base';
import { popup, ScratchWindow } from '../utils/helper';

interface KimiChatRequest {
  kimiplus_id?: string;
  extend?: {
    sidebar: boolean;
  };
  model?: 'k1.5' | 'k2';
  messages: {
    role: string;
    content: string;
  }[];
  refs?: any[];
  history?: any[];
  scene_labels?: any[];
  use_search?: boolean;
  use_semantic_memory?: boolean;
  use_deep_research?: boolean;
}

interface KimiChatItem {
  id: string;
  name: string;
  created_at: string;
  updated_at: string;
  status: string;
  type: string;
}

interface KimiChatRef {
  ref_id: string;
  ref_doc: {
    title: string;
    url: string;
    source_label: string;
    abstract: string;
    published_time_str: string;
    rag_segments: {
      id: string;
      text: string;
    }[];
  };
}

interface KimiChatRefItem {
  segment_id: string;
  refs: KimiChatRef[] | null;
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

interface KimiChatSearchMessage {
  type: string;
  title?: string;
  url?: string;
  date?: string;
  site_name?: string;
  snippet?: string;
}

interface KimiChatSearchPlus {
  event: string;
  msg: KimiChatSearchMessage;
}

interface KimiChatScrollItem {
  id: string;
  context_type: string;
  role: string;
  created_at: string;
  content: string;
  search_plus?: KimiChatSearchPlus[];
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

let search_window = new ScratchWindow('Kimi Search', 'markdown');

class KimiChat extends BaseChatChannel {
  private headers: http.OutgoingHttpHeaders;
  private urls: string[];

  constructor(readonly rtoken: string) {
    super();
    this.headers = {
      'Content-Type': 'application/json',
      'User-Agent':
        'Mozilla/5.0 (Windows NT 10.0; Win64; x64) ' +
        'AppleWebKit/537.36 (KHTML, like Gecko) ' +
        'Chrome/91.0.4472.77 ' +
        'Safari/537.36 ' +
        'Edg/91.0.864.41',
      Origin: 'https://kimi.moonshot.cn',
      Referer: 'https://kimi.moonshot.cn',
      'x-msh-platform': 'web',
      'x-language': 'zh-CN',
      'r-timezone': 'Asia/Shanghai',
    };
    this.urls = [];
  }

  public reset() {
    this.urls = [];
  }

  public getChatName() {
    return 'Kimi';
  }

  private addUrl(url: string) {
    this.urls.push(url);
    return this.urls.length;
  }

  private async tryGetSearchResult(segment_id: string, ref_text: string) {
    let regex = new RegExp(/^\[search result \([0-9]*\)\]$/);
    let arr = regex.exec(ref_text);
    if (!arr || arr.length != 1) {
      return -1;
    }

    let cache_key = `${this.chatId}-${segment_id}-search.json`;
    let cache = await this.cache.get(cache_key);
    if (cache instanceof Error) {
      return;
    }

    let items = JSON.parse(cache.toString()) as KimiChatSearchPlus[];
    let lines: string[] = [];
    let idx = 0;
    for (let item of items) {
      if (item.msg.type != 'get_res') {
        continue;
      }
      idx += 1;
      lines.push(
        `[${idx} - ${item.msg.site_name} - ${item.msg.date}](${item.msg.url})`,
      );
      lines.push(`# ${item.msg.title}`);
      lines.push(`${item.msg.snippet}`);
      lines.push('');
      lines.push('---');
      lines.push('');
    }
    await search_window.open(lines);
  }

  private async tryGetRef(segment_id: string, ref_text: string) {
    let regex = new RegExp(/^\[\^([0-9]*)\^\]$/);
    let arr = regex.exec(ref_text);
    if (!arr || arr.length < 2) {
      return -1;
    }
    let ref_id = arr[1];

    let cache_key = `${this.chatId}-${segment_id}.json`;
    let cache = await this.cache.get(cache_key);
    let item: null | KimiChatRefItem = null;
    if (cache instanceof Error) {
      let tmp = await this.refCard(segment_id);
      if (tmp instanceof Error) {
        logger.error(tmp);
        return;
      } else {
        item = tmp;
        await this.cache.set(cache_key, JSON.stringify(item));
      }
    } else {
      item = JSON.parse(cache.toString()) as KimiChatRefItem;
    }

    if (!item.refs) {
      return;
    }
    for (let ref of item.refs) {
      if (ref.ref_id != ref_id) {
        continue;
      }
      let text =
        `[${ref.ref_doc.title}](${ref.ref_doc.url})\n` +
        `${ref.ref_doc.source_label} - ${ref.ref_doc.published_time_str}\n`;
      for (let seg of ref.ref_doc.rag_segments) {
        text += `#${seg.text}`;
      }
      await popup(text, '', 'markdown');
      return;
    }
  }

  public async showItem() {
    let ref_item = await getCurrentRef();
    // logger.debug(ref_item);
    if (!ref_item) {
      return;
    }

    if ((await this.tryGetRef(ref_item.segmentId, ref_item.refText)) !== -1) {
      return;
    }
    await this.tryGetSearchResult(ref_item.segmentId, ref_item.refText);
  }

  private getHeaders(
    contentType: string = 'application/json',
  ): http.OutgoingHttpHeaders {
    this.headers['X-Traffic-Id'] = Array.from({ length: 20 }, () =>
      Math.floor(Math.random() * 36).toString(36),
    ).join('');
    this.headers['Content-Type'] = contentType;
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
          return { label: i.name, chatId: i.id, description: i.updated_at };
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

  private async refCard(segment_id: string): Promise<KimiChatRefItem | Error> {
    const req: HttpRequest = {
      args: {
        host: 'kimi.moonshot.cn',
        path: '/api/chat/segment/v3/rag-refs',
        method: 'POST',
        protocol: 'https:',
        headers: this.getHeaders(),
        timeout: 1000,
      },
      data: JSON.stringify({
        queries: [
          {
            chatId: this.chatId,
            sid: segment_id,
            z_idx: 0,
          },
        ],
      }),
    };
    const resp = await this.sendHttpRequest(req);
    if (resp instanceof Error) {
      return resp;
    }
    if (resp.statusCode == 200 && resp.body) {
      let obj = JSON.parse(resp.body.toString());
      let items = obj['items'] as KimiChatRefItem[];
      if (items.length > 0) {
        return items[0];
      }
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
        path: `/api/chat/${this.chatId}/segment/scroll`,
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
      // logger.debug(resp.body.toString());
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
        if (item.search_plus && item.search_plus.length > 0) {
          let cnt = 0;
          for (let i of item.search_plus) {
            if (i.msg.type == 'get_res') {
              ++cnt;
            }
          }
          if (cnt > 0) {
            let cache_key = `${this.chatId}-${item.id}-search.json`;
            await this.cache.set(cache_key, JSON.stringify(item.search_plus));
            this.append(`[search result (${cnt})]\n`);
          }
        }
        this.append(item.content);
      }
    }
    return null;
  }

  public async chat(text: string) {
    if (!this.chatId) {
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
    let chat_req: KimiChatRequest = {
      kimiplus_id: 'kimi',
      extend: {
        sidebar: true,
      },
      model: 'k2',
      messages: [
        {
          role: 'user',
          content: text,
        },
      ],
      refs: [],
      scene_labels: [],
      use_search: true,
      use_semantic_memory: false,
      use_deep_research: false,
    };
    const req: HttpRequest = {
      args: {
        host: 'kimi.moonshot.cn',
        path: `/api/chat/${this.chatId}/completion/stream`,
        method: 'POST',
        protocol: 'https:',
        headers: this.getHeaders(),
      },
      data: JSON.stringify(chat_req),
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

  public async delSession(chatId: string): Promise<null | Error> {
    let req: HttpRequest = {
      args: {
        host: 'www.kimi.com',
        path: '/apiv2/kimi.chat.v1.ChatService/DeleteChat',
        method: 'POST',
        protocol: 'https:',
        headers: this.getHeaders(),
      },
      data: `{"chatId":"${chatId}"}`,
    };
    let resp = await this.sendHttpRequest(req);
    if (resp instanceof Error) {
      return resp;
    }
    return null;
  }

  // public async debug() {
  //   console.log(await this.getAccessToken());
  //   console.log(await this.createChatId('Kimi'));
  //   console.log(this.chatId);

  //   const req: HttpRequest = {
  //     args: {
  //       host: 'kimi.moonshot.cn',
  //       path: `/api/chat/${this.chatId}/completion/stream`,
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
