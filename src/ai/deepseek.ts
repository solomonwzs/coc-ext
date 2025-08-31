import { CocExtError } from '../utils/common';
import http from 'http';
import {
  sendHttpRequest,
  sendHttpRequestWithCallback,
  HttpRequest,
  HttpRequestCallback,
} from '../utils/http';
import { BaseChatChannel, ChatItem, getCurrentRef } from './base';
import { logger } from '../utils/logger';
import { fsAccess, fsReadFile } from '../utils/file';
import { simpleHttpDownloadFile } from '../utils/http';
import fs from 'fs';
import { getcfg } from '../utils/config';
import { CocExtAIChatConfig } from '../utils/types';
import { popup, ScratchWindow } from '../utils/helper';

interface ChatSession {
  id: string;
  seq_id: number;
  agent: string;
  title: string;
  title_type: string;
  version: number;
  current_message_id: number;
  inserted_at: number;
  updated_at: number;
}

interface ChatSearchResult {
  url: string;
  title: string;
  snippet: string;
  cite_index?: number;
  published_at: number;
  site_name: string;
  site_icon: string;
  query_indexes?: number[];
}

interface ChatMessage {
  message_id: number;
  parent_id: number | undefined;
  model: string;
  role: string;
  content: string;
  thinking_enabled: boolean;
  thinking_content: string | undefined;
  ban_edit: boolean;
  ban_regenerate: boolean;
  accumulated_token_usage: number;
  inserted_at: number;
  search_enabled: boolean;
  search_results?: ChatSearchResult[];
}

interface ChatChallenge {
  algorithm: string;
  challenge: string;
  salt: string;
  signature: string;
  difficulty: number;
  expire_at: number;
  expire_after: number;
  target_path: string;
}

interface ChatResponse {
  code: number;
  msg: string;
  data: {
    biz_code: number;
    biz_msg: string;
    biz_data?: {
      chat_session?: ChatSession;
      chat_sessions?: ChatSession[];
      chat_messages?: ChatMessage[];
      challenge?: ChatChallenge;
      id?: string;
    };
  };
}

interface ChatComplResp {
  response: {
    message_id: number;
    parent_id: number;
    model: string;
    role: string;
    content: string;
    thinking_enabled: boolean;
    thinking_content?: any;
    thinking_elapsed_secs?: any;
    ban_edit: boolean;
    ban_regenerate: boolean;
    status: string;
    accumulated_token_usage: number;
    files: any[];
    tips: any[];
    inserted_at: number;
    search_enabled: boolean;
    search_status: string;
    search_results: any;
  };
}

interface ChatPV {
  p: string;
  v: any;
}

interface ChatComplData {
  request_message_id?: number;
  response_message_id?: number;
  updated_at?: number;
  o?: string;
  p?: string;
  v?: ChatComplResp | string | ChatSearchResult[] | ChatPV[];
}

interface ChatCompletion {
  event?: string;
  data?: ChatComplData;
}

class Sha3Wasm {
  private memory: WebAssembly.Memory;
  private addToStack: (delta: number) => number;
  private alloc: (size: number, align: number) => number;
  private wasmSolve: (
    retptr: number,
    ptrChallenge: number,
    lenChallenge: number,
    ptrPrefix: number,
    lenPrefix: number,
    difficulty: number,
  ) => void;

  constructor(public readonly src: WebAssembly.WebAssemblyInstantiatedSource) {
    let { instance } = src;
    let exports = instance.exports;

    this.memory = exports.memory as WebAssembly.Memory;
    this.addToStack = exports.__wbindgen_add_to_stack_pointer as (
      delta: number,
    ) => number;
    this.alloc = exports.__wbindgen_export_0 as (
      size: number,
      align: number,
    ) => number;
    this.wasmSolve = exports.wasm_solve as (
      retptr: number,
      ptrChallenge: number,
      lenChallenge: number,
      ptrPrefix: number,
      lenPrefix: number,
      difficulty: number,
    ) => void;
  }

  private writeMemory(offset: number, data: ArrayLike<number>): void {
    let view = new Uint8Array(this.memory.buffer);
    view.set(data, offset);
  }

  private readMemory(offset: number, size: number): Uint8Array {
    let view = new Uint8Array(this.memory.buffer);
    return view.slice(offset, offset + size);
  }

  private encodeString(text: string): [number, number] {
    let data = Buffer.from(text);
    let ptr = this.alloc(data.length, 1);
    this.writeMemory(ptr, data);
    return [ptr, data.length];
  }

  public computePowAnswer(
    challenge: string,
    salt: string,
    difficulty: number,
    expire_at: number,
  ): number | Error {
    let retptr = this.addToStack(-16);
    let [ptrChallenge, lenChallenge] = this.encodeString(challenge);
    let [ptrPrefix, lenPrefix] = this.encodeString(`${salt}_${expire_at}_`);
    this.wasmSolve(
      retptr,
      ptrChallenge,
      lenChallenge,
      ptrPrefix,
      lenPrefix,
      difficulty,
    );

    const statusBytes = this.readMemory(retptr, 4);
    if (statusBytes.length !== 4) {
      this.addToStack(16);
      return new CocExtError(CocExtError.ERR_DEEPSEEK, 'read status fail');
    }
    let status = new DataView(statusBytes.buffer).getInt32(0, true);

    let valueBytes = this.readMemory(retptr + 8, 8);
    if (valueBytes.length !== 8) {
      this.addToStack(16);
      return new CocExtError(CocExtError.ERR_DEEPSEEK, 'read value fail');
    }
    let value = new DataView(valueBytes.buffer).getFloat64(0, true);

    this.addToStack(16);
    if (status !== 1) {
      return new CocExtError(CocExtError.ERR_DEEPSEEK, 'computePowAnswer fail');
    }
    return Math.floor(value);
  }
}

async function getWasm(dir: string): Promise<Sha3Wasm | Error> {
  let conf = getcfg<CocExtAIChatConfig>('', {});
  let wasmPath =
    conf.deepseekWasmPath && conf.deepseekWasmPath.length > 0
      ? conf.deepseekWasmPath
      : `${dir}/deepseek_sha3.wasm`;
  let downloadUrl =
    conf.deepseekWasmURL && conf.deepseekWasmURL.length > 0
      ? conf.deepseekWasmURL
      : 'https://chat.deepseek.com/static/sha3_wasm_bg.7b9ca65ddd.wasm';
  if ((await fsAccess(wasmPath, fs.constants.R_OK)) != null) {
    if ((await simpleHttpDownloadFile(downloadUrl, wasmPath)) == -1) {
      return new CocExtError(
        CocExtError.ERR_DEEPSEEK,
        '[Deepseek] get wasm fail',
      );
    }
  }

  let wasmBuf = await fsReadFile(wasmPath);
  if (wasmBuf instanceof Error) {
    return wasmBuf;
  }
  let bytes = wasmBuf.buffer as ArrayBuffer;
  return new Sha3Wasm(await WebAssembly.instantiate(bytes, {}));
}

function searchReault2Lines(item: ChatSearchResult, idx: number) {
  let lines: string[] = [];
  let date = new Date(item.published_at * 1000);
  let dstr = `${date.getFullYear()}-${date.getMonth() + 1}-${date.getDate()}`;
  lines.push(`# ${idx} - ${item.title}`);
  lines.push('');
  lines.push(`[${item.site_name} - ${dstr}](${item.url})`);
  lines.push('');
  lines.push(item.snippet);
  return lines;
}

let searchWindow = new ScratchWindow('Deepseek Search', 'markdown');

class ChunkDecoder {
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

        try {
          if (str.slice(0, 6) === 'event:') {
            out.push({ event: str.slice(7).trim() });
          } else if (str.slice(0, 5) === 'data:') {
            out.push({ data: JSON.parse(str.slice(5)) });
          } else if (str.length > 0) {
            logger.debug(str);
          }
        } catch (e) {
          logger.debug(str);
          logger.error(e);
        }
      }
    }
    return out;
  }
}

class DeepseekChat extends BaseChatChannel {
  private authKey: string;
  private currentMsgid: number | null;
  private sha3Wasm: Sha3Wasm | null;

  constructor(public readonly key: string) {
    super();
    this.authKey = key;
    this.currentMsgid = null;
    this.sha3Wasm = null;
  }

  public reset() {
    this.currentMsgid = null;
  }

  public getChatName(): string {
    return 'Deepseek';
  }

  private getHeader(): http.OutgoingHttpHeaders {
    return {
      'User-Agent':
        'Mozilla/5.0 (Windows NT 10.0; Win64; x64) ' +
        'AppleWebKit/537.36 (KHTML, like Gecko) ' +
        'Chrome/91.0.4472.77 ' +
        'Safari/537.36 ' +
        'Edg/91.0.864.41',
      authorization: `Bearer ${this.authKey}`,
      Origin: 'https://chat.deepseek.com',
      'x-client-locale': 'zh_CN',
      'x-client-platform': 'web',
    };
  }

  private async httpQuery(
    method: string,
    path: string,
    d?: any,
  ): Promise<ChatResponse | CocExtError> {
    let req: HttpRequest = {
      args: {
        host: 'chat.deepseek.com',
        path,
        method,
        protocol: 'https:',
        headers: this.getHeader(),
      },
    };
    if (d) {
      req.data = JSON.stringify(d);
    }
    let resp = await sendHttpRequest(req);
    if (resp.statusCode != 200 || !resp.body) {
      return new CocExtError(
        CocExtError.ERR_DEEPSEEK,
        `[Deepseek] statusCode: ${resp.statusCode}, error: ${resp.error}, path: ${req.args.path}`,
      );
    }
    return JSON.parse(resp.body.toString()) as ChatResponse;
  }

  public async getChatList(): Promise<ChatItem[] | Error> {
    let resp = await this.httpQuery(
      'GET',
      '/api/v0/chat_session/fetch_page?count=100',
    );
    if (resp instanceof Error) {
      return resp;
    }
    let chatSessions = resp.data.biz_data?.chat_sessions;
    if (chatSessions == undefined) {
      return new CocExtError(
        CocExtError.ERR_DEEPSEEK,
        '[Deepseek] get sessions fail',
      );
    }

    const idSet: Set<string> = new Set();
    const list: ChatItem[] = [];
    for (const sess of chatSessions) {
      if (idSet.has(sess.id)) {
        continue;
      }
      idSet.add(sess.id);
      list.push({
        label: sess.title,
        chatId: sess.id,
        description: new Date(sess.updated_at * 1000).toISOString(),
      });
    }
    return list;
  }

  public async createChatId(_name: string): Promise<string | Error> {
    let resp = await this.httpQuery('POST', '/api/v0/chat_session/create', {
      character_id: null,
    });
    if (resp instanceof Error) {
      return resp;
    }

    let id = resp.data.biz_data?.id;
    if (!id || id.length == 0) {
      return new CocExtError(
        CocExtError.ERR_DEEPSEEK,
        '[Deepseek] create chat fail',
      );
    }
    return id;
  }

  public async showHistoryMessages(): Promise<null | Error> {
    let resp = await this.httpQuery(
      'GET',
      `/api/v0/chat/history_messages?chat_session_id=${this.chatId}`,
    );
    if (resp instanceof Error) {
      return resp;
    }
    const messages = resp.data.biz_data?.chat_messages;
    if (messages == undefined) {
      return new CocExtError(
        CocExtError.ERR_DEEPSEEK,
        '[Deepseek] get messages fail',
      );
    }

    this.currentMsgid = null;
    for (const msg of messages) {
      this.currentMsgid = msg.message_id;
      if (msg.role == 'USER') {
        this.chan.appendUserInput(
          new Date(msg.inserted_at * 1000).toISOString(),
          msg.content,
        );
      } else {
        this.chan.append(`>> id:${msg.message_id}\n`);

        if (msg.search_results) {
          let cacheKey = `${this.chatId}-${msg.message_id}-search.json`;
          await this.cache.set(cacheKey, JSON.stringify(msg.search_results));
          this.chan.append(
            ` [search result (${msg.search_results.length})]\n`,
          );
        }

        if (msg.thinking_enabled && msg.thinking_content) {
          this.chan.append('---');
          this.chan.append(msg.thinking_content);
          this.chan.append('\n---\n');
        }
        this.chan.append(msg.content);
      }
    }

    return null;
  }

  private async tryGetSearchResult(messageId: string, refText: string) {
    let regex = new RegExp(/^\[search result \([0-9]*\)\]$/);
    let arr = regex.exec(refText);
    if (!arr || arr.length != 1) {
      return -1;
    }

    let cacheKey = `${this.chatId}-${messageId}-search.json`;
    let cache = await this.cache.get(cacheKey);
    if (cache instanceof Error) {
      return;
    }
    let items = JSON.parse(cache.toString()) as ChatSearchResult[];

    let lines: string[] = [];
    let idx = 0;
    for (let item of items) {
      idx += 1;
      lines.push(...searchReault2Lines(item, idx));
      lines.push('');
      lines.push('---');
      lines.push('');
    }
    await searchWindow.open(lines);
  }

  private async tryGetRef(messageId: string, refText: string) {
    let regex = new RegExp(/^\[citation:([0-9]*)\]$/);
    let arr = regex.exec(refText);
    if (!arr || arr.length != 2) {
      return -1;
    }
    let refId = parseInt(arr[1]);

    let cacheKey = `${this.chatId}-${messageId}-search.json`;
    let cache = await this.cache.get(cacheKey);
    if (cache instanceof Error) {
      return -1;
    }
    let items = JSON.parse(cache.toString()) as ChatSearchResult[];

    for (let item of items) {
      if (item.cite_index !== refId) {
        continue;
      }

      let text = searchReault2Lines(item, item.cite_index).join('\n');
      await popup(text, '', 'markdown');
      return;
    }
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

  private async getPowChallenge(targetPath: string): Promise<string | Error> {
    let resp = await this.httpQuery(
      'POST',
      '/api/v0/chat/create_pow_challenge',
      { target_path: targetPath },
    );
    if (resp instanceof Error) {
      return resp;
    }
    let challenge = resp.data.biz_data?.challenge;
    if (!challenge) {
      return new CocExtError(
        CocExtError.ERR_DEEPSEEK,
        '[Deepseek] get challenge fail',
      );
    } else {
      if (!this.sha3Wasm) {
        let err = await this.cache.checkDir();
        if (err) {
          return err;
        }
        let wasm = await getWasm(this.cache.dir);
        if (wasm instanceof Error) {
          return wasm;
        }
        this.sha3Wasm = wasm;
      }

      let obj = {
        algorithm: challenge.algorithm,
        challenge: challenge.challenge,
        salt: challenge.salt,
        signature: challenge.signature,
        target_path: challenge.target_path,
        answer: this.sha3Wasm.computePowAnswer(
          challenge.challenge,
          challenge.salt,
          challenge.difficulty,
          challenge.expire_at,
        ),
      };
      return Buffer.from(JSON.stringify(obj)).toString('base64');
    }
  }

  public async chat(prompt: string) {
    const challenge = await this.getPowChallenge('/api/v0/chat/completion');
    if (challenge instanceof Error) {
      logger.error(challenge);
      return;
    }

    this.chan.appendUserInput(new Date().toISOString(), prompt);

    let headers = this.getHeader();
    headers['x-ds-pow-response'] = challenge;
    const req: HttpRequest = {
      args: {
        host: 'chat.deepseek.com',
        path: '/api/v0/chat/completion',
        method: 'POST',
        protocol: 'https:',
        headers,
      },
      data: JSON.stringify({
        chat_session_id: this.chatId,
        parent_message_id: this.currentMsgid,
        prompt,
        ref_file_ids: [],
        search_enabled: true,
        thinking_enabled: true,
      }),
    };

    let decoder = new ChunkDecoder();
    let searchResults: ChatSearchResult[] = [];
    let event = '';
    let p = '';
    const cb: HttpRequestCallback = {
      onData: (chunk: Buffer, rsp: http.IncomingMessage) => {
        if (rsp.statusCode != 200) {
          return;
        }

        let msgList = decoder.decode(chunk);
        for (let msg of msgList) {
          if (msg.event) {
            event = msg.event;
            if (event === 'close') {
              this.chan.append('\n(END)');
            }
          } else if (msg.data) {
            if (event === 'ready') {
              if (
                msg.data.request_message_id != undefined &&
                msg.data.response_message_id != undefined
              ) {
                this.chan.append(`>> id:${msg.data.response_message_id}\n`);
                this.currentMsgid = msg.data.response_message_id;
              }
            } else if (event === 'update_session') {
              if (msg.data.p) {
                p = msg.data.p;
              }

              if (p === 'response/search_status') {
                if (msg.data.v === 'FINISHED' && searchResults.length > 0) {
                  this.chan.append(
                    ` [search result (${searchResults.length})]\n`,
                  );
                }
              } else if (p === 'response/search_results') {
                if (Array.isArray(msg.data.v)) {
                  searchResults.push(...(msg.data.v as ChatSearchResult[]));
                }
              } else if (
                p === 'response/content' &&
                typeof msg.data.v === 'string'
              ) {
                this.chan.append(msg.data.v, false);
              } else if (p === 'response/thinking_content') {
                if (msg.data.p === 'response/thinking_content') {
                  this.chan.append('---');
                }
                if (typeof msg.data.v === 'string') {
                  this.chan.append(msg.data.v, false);
                }
              } else if (p === 'response/thinking_elapsed_secs') {
                this.chan.append('\n\n---\n');
              }
            }
          }
        }
      },
      onError: (err: Error) => {
        this.chan.append(' (ERROR) ');
        this.chan.append(err.message);
      },
      onEnd: (rsp: http.IncomingMessage) => {
        logger.info(`[Deepseek] chat statusCode: ${rsp.statusCode}`);
      },
      onTimeout: () => {
        logger.error('[Deepseek] timeout');
      },
    };
    await sendHttpRequestWithCallback(req, cb);

    if (searchResults.length > 0) {
      let cacheKey = `${this.chatId}-${this.currentMsgid}-search.json`;
      await this.cache.set(cacheKey, JSON.stringify(searchResults));
    }
  }

  public async delSession(chatId: string): Promise<null | Error> {
    let resp = await this.httpQuery('POST', '/api/v0/chat_session/delete', {
      chat_session_id: chatId,
    });
    return resp instanceof Error ? resp : null;
  }
}

export const deepseekChat = new DeepseekChat(
  process.env.MY_AI_DEEPSEEK_CHAT_KEY
    ? process.env.MY_AI_DEEPSEEK_CHAT_KEY
    : '',
);
