import {
  sendHttpRequest,
  sendHttpRequestWithCallback,
  HttpRequest,
  HttpRequestCallback,
} from '../utils/http';
import http from 'http';
import { logger } from '../utils/logger';
import { CocExtError } from '../utils/common';
import { BaseChatChannel, ChatItem, getCurrentRef } from './base';
import { popup, ScratchWindow } from '../utils/helper';

interface WebPage {
  title: string;
  url: string;
  siteName: string;
  iconUrl: string;
  snippet?: string;
  publishTime: string;
  siteQuality: {
    isTrustedSite?: boolean;
    description?: string;
  };
}

interface Search {
  keywords?: string[];
  webPages?: WebPage[];
}

interface FileInfo {
  id: string;
  meta: {
    name: string;
    contentType: string;
    sizeBytes: string;
    checksum: string;
    ext: string;
    createTime: string;
    type: string;
  };
  blob: {
    signUrl: string;
    previewUrl: string;
  };
  tokenCount: string;
  status: string;
}

interface Exception {
  error: {
    reason: string;
    localizedMessage: {
      locale: string;
      message: string;
    };
    severity: string;
  };
}

interface Block {
  id: string;
  text?: {
    content: string;
  };
  search?: Search;
  file?: FileInfo;
  exception?: Exception;
}

interface Ref {
  id: string;
  base: WebPage;
}

interface Message {
  id: string;
  parentId: string;
  childrenMessageIds?: string[];
  role: string;
  status: string;
  blocks?: Block[];
  refs?: {
    searchChunks?: Ref[];
  };
  scenario?: string;
  vote?: string;
  createTime?: string;
}

interface ListChatsResponse {
  chats: {
    id: string;
    name: string;
    messageContent: string;
    createTime: string;
    updateTime: string;
  }[];
  nextPageToken: string;
}

interface ListMessagesResponse {
  messages?: Message[];
}

interface ChatRequest {
  chatId?: string;
  scenario: string;
  tools: {
    type: string;
    search: any;
  }[];
  message: {
    parent_id?: string;
    role: string;
    blocks: {
      message_id: string;
      text: {
        content: string;
      };
    }[];
    scenario: string;
  };
}

interface ChatResponse {
  op?: string;
  mask?: string;
  eventOffset: number;
  heartbeat?: {};
  message?: {
    id: string;
    parentId: string;
    role: string;
    status: string;
    scenario?: string;
    blocks?: Block[];
  };
  block?: Block;
  status?: string;
  done?: {};
  ref?: {
    id: string;
    search: Ref;
  };
  chat?: {
    name: string;
  };
}

let globalKimi = {
  searchWindow: new ScratchWindow('Kimi Search', 'markdown'),
  host: 'www.kimi.com',
};

class StreamDecoder {
  private cache: Buffer;

  constructor() {
    this.cache = Buffer.from('');
  }

  public decode(buf: Buffer): string[] {
    this.cache = Buffer.concat([this.cache, buf]);

    let out: string[] = [];
    while (true) {
      let msgLen: number = 0;
      if (this.cache.length >= 5) {
        msgLen = this.cache.readUInt32BE(1);
        if (this.cache.length >= 5 + msgLen) {
          out.push(this.cache.subarray(5, 5 + msgLen).toString('utf8'));
          this.cache = this.cache.subarray(5 + msgLen);
        } else {
          break;
        }
      } else {
        break;
      }
    }
    return out;
  }
}

class KimiChatV2 extends BaseChatChannel {
  private headers: http.OutgoingHttpHeaders;
  private currentMsgid: string;

  constructor(readonly rtoken: string) {
    super();
    this.headers = {
      'User-Agent':
        'Mozilla/5.0 (Windows NT 10.0; Win64; x64) ' +
        'AppleWebKit/537.36 (KHTML, like Gecko) ' +
        'Chrome/91.0.4472.77 ' +
        'Safari/537.36 ' +
        'Edg/91.0.864.41',
      Origin: `https://${globalKimi.host}`,
      Referer: `https://${globalKimi.host}`,
      'x-msh-platform': 'web',
      'x-language': 'zh-CN',
      'r-timezone': 'Asia/Shanghai',
    };
    this.currentMsgid = '';
  }

  public reset() {
    this.currentMsgid = '';
  }

  public getChatName() {
    return 'Kimi';
  }

  private async tryGetSearchResult(segmentId: string, refText: string) {
    let regex = new RegExp(/^\[search result \([0-9]*\)\]$/);
    let arr = regex.exec(refText);
    if (!arr || arr.length != 1) {
      return -1;
    }

    let cacheKey = `${this.chatId}-${segmentId}-search.json`;
    let cache = await this.cache.get(cacheKey);
    if (cache instanceof Error) {
      logger.error(cache);
      return 0;
    }

    let block = JSON.parse(cache.toString()) as Search;
    if (!block.webPages) {
      return 0;
    }

    let lines: string[] = [];
    let idx = 0;
    for (let web of block.webPages) {
      idx += 1;
      lines.push(`# ${idx} - ${web.title}`);
      lines.push('');
      lines.push(`[${web.siteName} - ${web.publishTime}](${web.url})`);
      lines.push('');
      if (web.snippet) {
        lines.push(...web.snippet.split(/\r?\n/));
        lines.push('');
      }
      lines.push('---');
      lines.push('');
    }
    await globalKimi.searchWindow.open(lines);
    return 0;
  }

  private async tryGetRef(segment_id: string, ref_text: string) {
    let regex = new RegExp(/^\[\^([0-9]*)\^\]$/);
    let arr = regex.exec(ref_text);
    if (!arr || arr.length < 2) {
      return -1;
    }
    let refId = arr[1];

    let cacheKey = `${this.chatId}-${segment_id}-refs.json`;
    let cache = await this.cache.get(cacheKey);
    if (cache instanceof Error) {
      logger.error(cache);
      return 0;
    }
    let refs = JSON.parse(cache.toString()) as Ref[];
    for (let chunk of refs) {
      if (chunk.id != refId) {
        continue;
      }
      let text =
        `# ${chunk.base.title}\n\n` +
        `[${chunk.base.siteName} - ${chunk.base.publishTime}](${chunk.base.url})\n\n` +
        chunk.base.snippet;
      await popup(text, '', 'markdown');
      break;
    }
    return 0;
  }

  public async showItem() {
    let refItem = await getCurrentRef();
    if (!refItem) {
      return;
    }

    if ((await this.tryGetRef(refItem.segmentId, refItem.refText)) !== -1) {
      return;
    }
    await this.tryGetSearchResult(refItem.segmentId, refItem.refText);
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
    const refreshReq: HttpRequest = {
      args: {
        host: globalKimi.host,
        path: '/api/auth/token/refresh',
        method: 'GET',
        protocol: 'https:',
        headers: this.getHeaders(),
        timeout: 1000,
      },
    };
    const resp = await sendHttpRequest(refreshReq);
    if (resp.statusCode == 200 && resp.body) {
      logger.debug(resp.body.toString());
      const obj = JSON.parse(resp.body.toString());
      this.headers['Authorization'] = `Bearer ${obj['access_token']}`;
    }
    return resp.statusCode ? resp.statusCode : -1;
  }

  private async postJsonRequest(
    path: string,
    data: any,
  ): Promise<Buffer | Error> {
    let req: HttpRequest = {
      args: {
        host: globalKimi.host,
        path,
        method: 'POST',
        protocol: 'https:',
        headers: this.getHeaders(),
        timeout: 1000,
      },
      data: JSON.stringify(data),
    };

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

    if (resp.statusCode != 200 || !resp.body) {
      return new CocExtError(
        CocExtError.ERR_KIMI,
        `[Kimi] statusCode: ${resp.statusCode}, path: ${path}, resp: ${resp.body?.toString()}`,
      );
    }

    return resp.body;
  }

  public async createChatId(name: string): Promise<string | Error> {
    let resp = await this.postJsonRequest('/api/chat', {
      name,
      is_example: false,
    });
    if (resp instanceof Error) {
      return resp;
    }

    let obj = JSON.parse(resp.toString());
    return obj['id'];
  }

  public async getChatList(): Promise<ChatItem[] | Error> {
    let resp = await this.postJsonRequest(
      '/apiv2/kimi.chat.v1.ChatService/ListChats',
      {
        page_size: 50,
        project_id: '',
        query: '',
      },
    );
    if (resp instanceof Error) {
      return resp;
    }

    let obj = JSON.parse(resp.toString()) as ListChatsResponse;
    if (obj.chats.length > 0) {
      return obj.chats.map((i) => {
        return { label: i.name, chatId: i.id, description: i.updateTime };
      });
    } else {
      return [];
    }
  }

  private async chatScroll(): Promise<Message[] | Error> {
    let resp = await this.postJsonRequest(
      '/apiv2/kimi.gateway.chat.v1.ChatService/ListMessages',
      {
        chat_id: this.chatId,
        page_size: 1000,
      },
    );
    if (resp instanceof Error) {
      return resp;
    }

    let obj = JSON.parse(resp.toString()) as ListMessagesResponse;
    return obj.messages ? obj.messages.reverse() : [];
  }

  public async showHistoryMessages(): Promise<null | Error> {
    let msgList = await this.chatScroll();
    if (msgList instanceof Error) {
      return msgList;
    }

    for (const msg of msgList) {
      if (!msg.blocks || msg.blocks.length == 0) {
        continue;
      }

      if (msg.role == 'user') {
        for (let block of msg.blocks.reverse()) {
          if (block.text) {
            this.chan.appendUserInput(
              msg.createTime ? msg.createTime : '',
              block.text.content,
            );
          } else if (block.file) {
            this.chan.appendUserInput(
              block.file.meta.createTime,
              ` [file: ${block.file.meta.name}](${block.file.blob.previewUrl})`,
            );
          } else {
            logger.debug(block);
          }
        }
      } else if (msg.role == 'assistant') {
        this.currentMsgid = msg.id;
        this.chan.append(`>> id:${msg.id}\n`);

        for (let block of msg.blocks) {
          if (block.search) {
            let cacheKey = `${this.chatId}-${msg.id}-search.json`;
            await this.cache.set(cacheKey, JSON.stringify(block.search));
            if (block.search && block.search.webPages) {
              this.chan.append(
                ` [search result (${block.search.webPages.length})]\n`,
              );
            }
          } else if (block.text) {
            this.chan.append(block.text.content);
          } else if (block.exception) {
            this.chan.append(
              ` ${block.exception.error.localizedMessage.message}`,
            );
          } else {
            logger.debug(block);
          }
        }

        if (
          msg.refs &&
          msg.refs.searchChunks &&
          msg.refs.searchChunks.length > 0
        ) {
          let cacheKey = `${this.chatId}-${msg.id}-refs.json`;
          await this.cache.set(cacheKey, JSON.stringify(msg.refs.searchChunks));
        }
      }
    }
    return null;
  }

  private encodeBuffer(o: any): Buffer {
    let oBuf = Buffer.from(JSON.stringify(o), 'utf8');
    let out = Buffer.alloc(5 + oBuf.length);
    out.writeUInt8(0);
    out.writeUInt32BE(oBuf.length, 1);
    oBuf.copy(out, 5);
    return out;
  }

  public async chat(text: string) {
    if (!this.chatId) {
      return;
    }
    this.chan.appendUserInput(new Date().toISOString(), text);

    let keywords: string[] = [];
    let webPages: WebPage[] = [];
    let refs: Ref[] = [];
    let decoder = new StreamDecoder();
    let searchEnd = false;
    let cb: HttpRequestCallback = {
      onData: (chunk: Buffer, rsp: http.IncomingMessage) => {
        if (rsp.statusCode != 200) {
          logger.error(`statusCode: ${rsp.statusCode}`);
          return;
        }
        let msgList = decoder.decode(chunk);
        for (const strMsg of msgList) {
          try {
            let msg = JSON.parse(strMsg) as ChatResponse;
            if (
              msg.op === 'set' &&
              msg.mask === 'message' &&
              msg.message &&
              msg.message.status === 'MESSAGE_STATUS_GENERATING'
            ) {
              this.chan.append(`>> id:${msg.message.id}\n`);
              this.currentMsgid = msg.message.id;
            } else if (
              msg.op === 'set' &&
              msg.mask === 'block.text' &&
              msg.block &&
              msg.block.text &&
              msg.block.text.content
            ) {
              this.chan.append(msg.block.text.content, false);
            } else if (msg.op === 'append' && msg.block) {
              if (
                msg.block.text &&
                msg.block.text.content &&
                msg.mask === 'block.text.content'
              ) {
                if (!searchEnd) {
                  searchEnd = true;
                  if (webPages.length > 0) {
                    this.chan.append(
                      ` [search result (${webPages.length})]\n`,
                    );
                  }
                }
                this.chan.append(msg.block.text.content, false);
              } else if (
                msg.block.search &&
                msg.block.search.keywords &&
                msg.mask === 'block.search.keywords'
              ) {
                keywords.push(...msg.block.search.keywords);
              } else if (
                msg.block.search &&
                msg.block.search.webPages &&
                msg.mask === 'block.search.webPages'
              ) {
                webPages.push(...msg.block.search.webPages);
              }
            } else if (msg.ref) {
              refs.push(msg.ref.search);
            } else if (msg.done) {
              this.chan.append(' (END)');
            } else if (msg.heartbeat) {
            } else {
              logger.debug(msg);
            }
          } catch (e) {
            logger.error(e);
            logger.debug(strMsg);
          }
        }
      },
      onError: (err: Error) => {
        logger.error(err);
      },
      onEnd: (rsp: http.IncomingMessage) => {
        logger.debug(rsp.statusCode);
      },
      onTimeout: () => {
        logger.error('time out');
      },
    };

    let chatReq: ChatRequest = {
      chatId: this.chatId,
      scenario: 'SCENARIO_K2',
      tools: [{ type: 'TOOL_TYPE_SEARCH', search: {} }],
      message: {
        parent_id: this.currentMsgid,
        role: 'user',
        blocks: [{ message_id: '', text: { content: text } }],
        scenario: 'SCENARIO_K2',
      },
    };

    const req: HttpRequest = {
      args: {
        host: globalKimi.host,
        path: '/apiv2/kimi.gateway.chat.v1.ChatService/Chat',
        method: 'POST',
        protocol: 'https:',
        headers: this.getHeaders('application/connect+json'),
      },
      data: this.encodeBuffer(chatReq),
    };
    await sendHttpRequestWithCallback(req, cb);

    if (keywords.length > 0 || webPages.length > 0) {
      let cacheKey = `${this.chatId}-${this.currentMsgid}-search.json`;
      await this.cache.set(cacheKey, JSON.stringify({ keywords, webPages }));
    }
    if (refs.length > 0) {
      let cacheKey = `${this.chatId}-${this.currentMsgid}-refs.json`;
      await this.cache.set(cacheKey, JSON.stringify(refs));
    }
  }

  public async delSession(chatId: string): Promise<null | Error> {
    let resp = await this.postJsonRequest(
      '/apiv2/kimi.chat.v1.ChatService/DeleteChat',
      { chatId: chatId },
    );
    return resp instanceof Error ? resp : null;
  }
}

export const kimiChatV2 = new KimiChatV2(
  process.env.MY_AI_KIMI_CHAT_KEY ? process.env.MY_AI_KIMI_CHAT_KEY : '',
);
