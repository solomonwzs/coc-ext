import { ExtError } from '../comm/common';
import http from 'http';
import {
  sendHttpRequest,
  sendHttpRequestWithCallback,
  HttpRequest,
  HttpRequestCallback,
} from '../comm/http';
import { BaseChat, BaseChatChannel, ChatItem, ChunkDecoder } from './base';
import { fsAccess, fsReadFile } from '../comm/file';
import { simpleHttpDownloadFile } from '../comm/http';
import fs from 'fs';
import { BaseLogger } from '../comm/logger';

let globalDeepseek = {
  host: 'chat.deepseek.com',
  timeout: 5000,
};

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

interface ChatSearchQuery {
  query: string;
}

interface ChatSearchResult {
  url: string;
  title: string;
  snippet: string;
  cite_index?: number;
  published_at: number | null;
  site_name: string | null;
  site_icon: string;
  query_indexes?: number[];
}

interface ChatMessageFragment {
  id: number;
  type: string;
  content?: string;
  thinking_content?: string;
  status?: string;
  queries?: ChatSearchQuery[];
  results?: ChatSearchResult[];
  references?: any[];
  stage_id?: number;
}

interface ChatMessage {
  message_id: number;
  parent_id: number | null;
  model: string;
  role: string;
  thinking_enabled: boolean;
  ban_edit: boolean;
  ban_regenerate: boolean;
  status: string;
  accumulated_token_usage: number;
  inserted_at: number;
  search_enabled: boolean;
  fragments?: ChatMessageFragment[];
  has_pending_fragment: boolean;
  auto_continue: boolean;
  search_triggered: boolean;
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
  message_id: number;
  parent_id: number | null;
  model: string;
  role: string;
  thinking_enabled: boolean;
  ban_edit: boolean;
  ban_regenerate: boolean;
  status: string;
  accumulated_token_usage: number;
  inserted_at: number;
  search_enabled: boolean;
  fragments?: ChatMessageFragment[];
  content?: string;
  search_status?: string;
  search_results?: ChatSearchResult[];
}

interface ChatComplData {
  request_message_id?: number;
  response_message_id?: number;
  model_type?: string;
  updated_at?: number;
  click_behavior?: string;
  auto_resume?: boolean;
  o?: string;
  p?: string;
  v?: any;
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

  private writeBuffer(offset: number, data: ArrayLike<number>): void {
    let view = new Uint8Array(this.memory.buffer);
    view.set(data, offset);
  }

  private readBuffer(offset: number, size: number): Uint8Array {
    let view = new Uint8Array(this.memory.buffer);
    return view.slice(offset, offset + size);
  }

  private encodeString(text: string): [number, number] {
    let data = Buffer.from(text);
    let ptr = this.alloc(data.length, 1);
    this.writeBuffer(ptr, data);
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

    const statusBytes = this.readBuffer(retptr, 4);
    if (statusBytes.length !== 4) {
      this.addToStack(16);
      return new ExtError(ExtError.ERR_DEEPSEEK, 'read status fail');
    }
    let status = new DataView(statusBytes.buffer).getInt32(0, true);

    let valueBytes = this.readBuffer(retptr + 8, 8);
    if (valueBytes.length !== 8) {
      this.addToStack(16);
      return new ExtError(ExtError.ERR_DEEPSEEK, 'read value fail');
    }
    let value = new DataView(valueBytes.buffer).getFloat64(0, true);

    this.addToStack(16);
    if (status !== 1) {
      return new ExtError(ExtError.ERR_DEEPSEEK, 'computePowAnswer fail');
    }
    return Math.floor(value);
  }
}

async function getWasm(dir: string): Promise<Sha3Wasm | Error> {
  let wasmPath = `${dir}/deepseek_sha3.wasm`;
  let downloadUrl = `https://${globalDeepseek.host}/static/sha3_wasm_bg.7b9ca65ddd.wasm`;
  if ((await fsAccess(wasmPath, fs.constants.R_OK)) != null) {
    if ((await simpleHttpDownloadFile(downloadUrl, wasmPath)) == -1) {
      return new ExtError(ExtError.ERR_DEEPSEEK, '[Deepseek] get wasm fail');
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
  const lines: string[] = [];
  const meta: string[] = [];
  if (item.site_name) {
    meta.push(item.site_name);
  }
  if (item.published_at) {
    const date = new Date(item.published_at * 1000);
    meta.push(`${date.getFullYear()}-${date.getMonth() + 1}-${date.getDate()}`);
  }
  lines.push(`# ${idx} - ${item.title}`);
  lines.push('');
  lines.push(`[${meta.join(' - ')}](${item.url})`);
  lines.push('');
  lines.push(item.snippet);
  return lines;
}

export class DeepseekChat extends BaseChat {
  private currentMsgid: number | null;
  private sha3Wasm: Sha3Wasm | null;

  constructor(
    readonly authKey: string,
    chan: BaseChatChannel,
    protected logger: BaseLogger,
  ) {
    super(chan);
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
      Origin: `https://${globalDeepseek.host}`,
      'x-client-locale': 'zh_CN',
      'x-client-platform': 'web',
      'Content-Type': 'application/json',
    };
  }

  private async httpQuery(
    method: string,
    path: string,
    d?: any,
  ): Promise<ChatResponse | ExtError> {
    let req: HttpRequest = {
      args: {
        host: globalDeepseek.host,
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
      return new ExtError(
        ExtError.ERR_DEEPSEEK,
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
      return new ExtError(
        ExtError.ERR_DEEPSEEK,
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
      return new ExtError(ExtError.ERR_DEEPSEEK, '[Deepseek] create chat fail');
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
      return new ExtError(
        ExtError.ERR_DEEPSEEK,
        '[Deepseek] get messages fail',
      );
    }

    this.currentMsgid = null;
    for (const msg of messages) {
      this.currentMsgid = msg.message_id;
      if (msg.role == 'USER') {
        const contents: string[] = [];
        for (const frag of msg.fragments ?? []) {
          if (frag.type == 'REQUEST' && frag.content) {
            contents.push(frag.content);
          }
        }
        if (contents.length > 0) {
          this.chan.appendUserInput(
            new Date(msg.inserted_at * 1000).toISOString(),
            contents.join('\n'),
          );
        }
      } else {
        this.chan.appendLine(`>> id:${msg.message_id}\n`);

        const searchResults: ChatSearchResult[] = [];
        for (const frag of msg.fragments ?? []) {
          if (frag.type == 'SEARCH' && frag.results) {
            searchResults.push(...frag.results);
          }
        }
        if (searchResults.length > 0) {
          let cacheKey = `${this.chatId}-${msg.message_id}-search.json`;
          await this.cache.set(cacheKey, JSON.stringify(searchResults));
          this.chan.appendLine(` [search result (${searchResults.length})]\n`);
        }

        for (const frag of msg.fragments ?? []) {
          if (frag.type == 'THINKING' && frag.content) {
            this.chan.appendLine('---');
            this.chan.appendLine(frag.content);
            this.chan.appendLine('\n---\n');
          } else if (frag.type == 'RESPONSE' && frag.content) {
            this.chan.appendLine(frag.content);
          }
        }
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
    await this.chan.openSearchWindow(lines);
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
      await this.chan.popup(text, '', 'markdown');
      return;
    }
  }

  public async showItem() {
    let refItem = await this.chan.getCurrentRef();
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
      return new ExtError(
        ExtError.ERR_DEEPSEEK,
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
      this.logger.error(challenge);
      return;
    }

    this.chan.appendUserInput(new Date().toISOString(), prompt);

    let headers = this.getHeader();
    headers['x-ds-pow-response'] = challenge;
    const req: HttpRequest = {
      args: {
        host: globalDeepseek.host,
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
        thinking_enabled: false,
      }),
    };

    const decoder = new ChunkDecoder();
    let searchResults: ChatSearchResult[] = [];
    let searchMarkerPrinted = false;
    let event = '';
    let p = '';
    let o = '';
    // streaming response state: data frames are JSON-patch style updates
    // ({p: path, o: op, v: value}) on a response object carrying its text in
    // fragments[]; frames may omit p/o to repeat the previous operation, and
    // full snapshots ({v: {response: {...}}}) re-send the whole response
    let fragments: ChatMessageFragment[] = [];
    let emittedThinking = 0;
    let emittedContent = 0;
    let inThinking = false;

    const printSearchMarker = () => {
      if (searchMarkerPrinted || searchResults.length == 0) {
        return;
      }
      closeThinking();
      this.chan.appendLine(
        `\ue68f [search result (${searchResults.length})]\n`,
      );
      searchMarkerPrinted = true;
    };

    const closeThinking = () => {
      if (!inThinking) {
        return;
      }
      this.chan.appendLine('\n\n---\n');
      inThinking = false;
    };

    // merge search results (dedup by url)
    const mergeSearchResults = (items: any[]) => {
      for (const item of items) {
        if (!item || typeof item.url != 'string') {
          continue;
        }
        if (searchResults.some((r) => r.url == item.url)) {
          continue;
        }
        searchResults.push(item as ChatSearchResult);
      }
    };

    // re-emit the new suffix of the fragments content / thinking text
    const emitFragments = () => {
      let contentText = '';
      let thinkingText = '';
      for (const frag of fragments) {
        if (frag.type == 'SEARCH') {
          if (frag.results) {
            mergeSearchResults(frag.results);
          }
          if (frag.status == 'FINISHED') {
            printSearchMarker();
          }
        } else if (frag.type == 'REQUEST') {
          continue;
        } else if (frag.type == 'THINK' || frag.type == 'THINKING') {
          thinkingText += frag.thinking_content ?? frag.content ?? '';
        } else {
          if (frag.thinking_content) {
            thinkingText += frag.thinking_content;
          }
          if (typeof frag.content == 'string') {
            contentText += frag.content;
          }
        }
      }

      if (thinkingText.length > emittedThinking) {
        if (!inThinking) {
          this.chan.appendLine('---');
          inThinking = true;
        }
        this.chan.append(thinkingText.slice(emittedThinking));
        emittedThinking = thinkingText.length;
      }
      if (contentText.length > emittedContent) {
        closeThinking();
        this.chan.append(contentText.slice(emittedContent));
        emittedContent = contentText.length;
      }
    };

    // apply a patch to one fragment field: content / thinking_content / status / results
    const applyFragmentPatch = (index: number, field: string, value: any) => {
      let i = index < 0 ? fragments.length + index : index;
      if (i < 0 || i >= fragments.length) {
        // patch arrived before any snapshot: synthesize the fragment
        let type = 'RESPONSE';
        if (field == 'thinking_content') {
          type = 'THINK';
        } else if (field == 'results' || field == 'status') {
          type = 'SEARCH';
        }
        fragments.push({ id: fragments.length + 1, type });
        i = fragments.length - 1;
      }
      const frag = fragments[i];

      if (field == 'content' && typeof value == 'string') {
        frag.content = o == 'SET' ? value : (frag.content ?? '') + value;
        emitFragments();
      } else if (field == 'thinking_content' && typeof value == 'string') {
        frag.thinking_content =
          o == 'SET' ? value : (frag.thinking_content ?? '') + value;
        emitFragments();
      } else if (field == 'results' && Array.isArray(value)) {
        frag.results = (frag.results ?? []).concat(value);
        mergeSearchResults(value);
        emitFragments();
      } else if (field == 'status' && typeof value == 'string') {
        frag.status = value;
        if (frag.type == 'SEARCH' && value == 'FINISHED') {
          printSearchMarker();
        }
      }
    };

    // dispatch one data frame; p and o are remembered so follow-up frames
    // carrying only `v` repeat the previous operation
    const applyPatch = (path: string, value: any) => {
      if (typeof value == 'string') {
        const arr =
          /^response\/fragments\/(-?\d+)\/(content|thinking_content|status|results)$/.exec(
            path,
          );
        if (arr) {
          applyFragmentPatch(parseInt(arr[1]), arr[2], value);
        } else if (path == 'response/search_status') {
          if (value == 'FINISHED') {
            printSearchMarker();
          }
        } else if (path == 'response/thinking_elapsed_secs') {
          closeThinking();
        } else if (path == 'response/content') {
          applyFragmentPatch(-1, 'content', value);
        } else if (path == 'response/thinking_content') {
          applyFragmentPatch(-1, 'thinking_content', value);
        } else {
          this.logger.debug({ p: path, o, v: value });
        }
        return;
      }

      if (Array.isArray(value)) {
        if (path == 'response' && o == 'BATCH') {
          for (const sub of value) {
            if (sub && sub.p) {
              applyPatch(
                sub.p.startsWith('response/') ? sub.p : `response/${sub.p}`,
                sub.v,
              );
            }
          }
        } else if (path == 'response/fragments') {
          for (const frag of value) {
            if (frag && typeof frag == 'object') {
              fragments.push(frag as ChatMessageFragment);
            }
          }
          emitFragments();
        } else if (
          path.endsWith('/results') ||
          path == 'response/search_results'
        ) {
          mergeSearchResults(value);
        } else {
          this.logger.debug({ p: path, o, v: value });
        }
        return;
      }

      if (value && typeof value == 'object') {
        if ('response' in value) {
          // full response snapshot
          const resp = value.response as ChatComplResp;
          if (Array.isArray(resp.search_results)) {
            mergeSearchResults(resp.search_results);
          }
          if (resp.search_status == 'FINISHED') {
            printSearchMarker();
          }
          if (resp.fragments) {
            fragments = resp.fragments;
            emitFragments();
          } else if (typeof resp.content == 'string') {
            fragments = [{ id: 1, type: 'RESPONSE', content: resp.content }];
            emitFragments();
          }
        } else if (path == 'response/fragments') {
          fragments.push(value as ChatMessageFragment);
          emitFragments();
        } else {
          this.logger.debug({ p: path, o, v: value });
        }
        return;
      }

      this.logger.debug({ p: path, o, v: value });
    };

    const cb: HttpRequestCallback = {
      onData: (chunk: Buffer, rsp: http.IncomingMessage) => {
        if (rsp.statusCode != 200) {
          return;
        }

        const msgList = decoder.decode(chunk);
        for (const m of msgList) {
          if (m.type === 'event') {
            event = m.data;
            if (event === 'close') {
              this.chan.appendLine('\n(END)');
            }
          } else if (m.type === 'data') {
            const d = JSON.parse(m.data) as ChatComplData;
            if (event === 'ready') {
              if (
                d.request_message_id != undefined &&
                d.response_message_id != undefined
              ) {
                this.chan.appendLine(`>> id:${d.response_message_id}\n`);
                this.currentMsgid = d.response_message_id;
              }
            } else if (event === 'update_session') {
              if (d.v === undefined) {
                continue;
              }
              if (d.p) {
                p = d.p;
              }
              if (d.o) {
                o = d.o;
              }
              applyPatch(p, d.v);
            } else {
              this.logger.debug(m);
            }
          } else {
            this.logger.debug(m);
          }
        }
      },
      onError: (err: Error) => {
        this.chan.appendLine(' (ERROR) ');
        this.chan.appendLine(err.message);
      },
      onEnd: (rsp: http.IncomingMessage) => {
        this.logger.info(
          `[Deepseek] chat statusCode: ${rsp.statusCode}, msg: ${rsp.statusMessage}`,
        );
      },
      onTimeout: () => {
        this.logger.error('[Deepseek] timeout');
      },
    };
    await sendHttpRequestWithCallback(req, cb);
    closeThinking();

    if (searchResults.length > 0) {
      if (!searchMarkerPrinted) {
        printSearchMarker();
      }
      const cacheKey = `${this.chatId}-${this.currentMsgid}-search.json`;
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
