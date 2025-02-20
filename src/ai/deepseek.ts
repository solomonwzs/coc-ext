import { CocExtError } from '../utils/common';
import http from 'http';
import {
  sendHttpRequest,
  sendHttpRequestWithCallback,
  HttpRequest,
  HttpRequestCallback,
} from '../utils/http';
import { BaseChatChannel, ChatItem } from './base';
import { logger } from '../utils/logger';
import { fsAccess, fsReadFile } from '../utils/file';
import { simpleHttpDownloadFile } from '../utils/http';
import fs from 'fs';
import { getcfg } from '../utils/config';
import { CocExtAIChatConfig } from '../utils/types';
import os from 'os';

interface DeepseekChatSession {
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

interface DeepseekChatMessage {
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
}

interface DeepseekChatChallenge {
  algorithm: string;
  challenge: string;
  salt: string;
  signature: string;
  difficulty: number;
  expire_at: number;
  expire_after: number;
  target_path: string;
}

interface DeepseekChatRequestChallenge {
  expire: number;
  x_ds_pow_response: string;
}

interface DeepseekChatResponse {
  code: number;
  msg: string;
  data: {
    biz_code: number;
    biz_msg: string;
    biz_data?: {
      chat_session?: DeepseekChatSession;
      chat_sessions?: DeepseekChatSession[];
      chat_messages?: DeepseekChatMessage[];
      challenge?: DeepseekChatChallenge;
      id?: string;
    };
  };
}

interface DeepseekChatCompletion {
  choices: {
    finish_reason: string | undefined;
    index: number;
    delta: {
      content: string | undefined;
      type: string;
      role: string | undefined;
    };
  }[];
  model: string;
  chunk_token_usage: number;
  created: number;
  message_id: number;
  parent_id: number;
}

class DeepseekSha3Wasm {
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

async function getWasm(): Promise<DeepseekSha3Wasm | Error> {
  let conf = getcfg<CocExtAIChatConfig>('', {});
  let wasmPath =
    conf.deepseekWasmPath && conf.deepseekWasmPath.length > 0
      ? conf.deepseekWasmPath
      : `${os.homedir}/.cache/deepseek_sha3.wasm`;
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
  return new DeepseekSha3Wasm(await WebAssembly.instantiate(wasmBuf, {}));
}

class DeepseekChat extends BaseChatChannel {
  private auth_key: string;
  private parent_id: number | null;
  private challenge: Record<string, DeepseekChatRequestChallenge>;
  private sha3_wasm: DeepseekSha3Wasm | null;

  constructor(public readonly key: string) {
    super();
    this.auth_key = key;
    this.parent_id = null;
    this.challenge = {};
    this.sha3_wasm = null;
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
      authorization: `Bearer ${this.auth_key}`,
      Origin: 'https://chat.deepseek.com',
    };
  }

  private async httpQuery(
    req: HttpRequest,
  ): Promise<DeepseekChatResponse | CocExtError> {
    const resp = await sendHttpRequest(req);
    if (resp.statusCode != 200 || !resp.body) {
      return new CocExtError(
        CocExtError.ERR_DEEPSEEK,
        `[Deepseek] statusCode: ${resp.statusCode}, error: ${resp.error}, path: ${req.args.path}`,
      );
    }
    return JSON.parse(resp.body.toString()) as DeepseekChatResponse;
  }

  private async httpGet(
    path: string,
  ): Promise<DeepseekChatResponse | CocExtError> {
    const req: HttpRequest = {
      args: {
        host: 'chat.deepseek.com',
        path,
        method: 'GET',
        protocol: 'https:',
        headers: this.getHeader(),
      },
    };
    return this.httpQuery(req);
  }

  public async getChatList(): Promise<ChatItem[] | Error> {
    const resp = await this.httpGet(
      '/api/v0/chat_session/fetch_page?count=100',
    );
    if (resp instanceof Error) {
      return resp;
    }
    const chat_sessions = resp.data.biz_data?.chat_sessions;
    if (chat_sessions == undefined) {
      return new CocExtError(
        CocExtError.ERR_DEEPSEEK,
        '[Deepseek] get sessions fail',
      );
    }

    const id_set: Set<string> = new Set();
    const list: ChatItem[] = [];
    for (const sess of chat_sessions) {
      if (id_set.has(sess.id)) {
        continue;
      }
      id_set.add(sess.id);
      list.push({
        label: sess.title,
        chat_id: sess.id,
        description: new Date(sess.updated_at * 1000).toISOString(),
      });
    }
    return list;
  }

  public async createChatId(_name: string): Promise<string | Error> {
    let req: HttpRequest = {
      args: {
        host: 'chat.deepseek.com',
        path: '/api/v0/chat_session/create',
        method: 'POST',
        protocol: 'https:',
        headers: this.getHeader(),
      },
      data: JSON.stringify({
        character_id: null,
      }),
    };
    let resp = await this.httpQuery(req);
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
    const resp = await this.httpGet(
      `/api/v0/chat/history_messages?chat_session_id=${this.chat_id}`,
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

    this.parent_id = null;
    for (const msg of messages) {
      this.parent_id = msg.message_id;
      if (msg.role == 'USER') {
        this.appendUserInput(
          new Date(msg.inserted_at * 1000).toISOString(),
          msg.content,
        );
      } else {
        this.append('');
        if (msg.thinking_enabled && msg.thinking_content) {
          this.append('```');
          this.append(msg.thinking_content);
          this.append('```');
        }
        this.append(msg.content);
      }
    }

    return null;
  }

  private async getPowChallenge(target_path: string): Promise<string | Error> {
    let ch = this.challenge[target_path];
    if (ch && ch.expire < Date.now()) {
      return ch.x_ds_pow_response;
    }

    const req: HttpRequest = {
      args: {
        host: 'chat.deepseek.com',
        path: '/api/v0/chat/create_pow_challenge',
        method: 'POST',
        protocol: 'https:',
        headers: this.getHeader(),
      },
      data: JSON.stringify({
        target_path,
      }),
    };
    const resp = await this.httpQuery(req);
    if (resp instanceof Error) {
      return resp;
    }
    const challenge = resp.data.biz_data?.challenge;
    if (!challenge) {
      return new CocExtError(
        CocExtError.ERR_DEEPSEEK,
        '[Deepseek] get challenge fail',
      );
    } else {
      if (!this.sha3_wasm) {
        let wasm = await getWasm();
        if (wasm instanceof Error) {
          return wasm;
        }
        this.sha3_wasm = wasm;
      }

      let obj = {
        algorithm: challenge.algorithm,
        challenge: challenge.challenge,
        salt: challenge.salt,
        signature: challenge.signature,
        target_path: challenge.target_path,
        answer: this.sha3_wasm.computePowAnswer(
          challenge.challenge,
          challenge.salt,
          challenge.difficulty,
          challenge.expire_at,
        ),
      };
      ch = {
        x_ds_pow_response: Buffer.from(JSON.stringify(obj)).toString('base64'),
        expire: challenge.expire_at + challenge.expire_after,
      };
      this.challenge[target_path] = ch;
      return ch.x_ds_pow_response;
    }
  }

  public async chat(prompt: string) {
    const challenge = await this.getPowChallenge('/api/v0/chat/completion');
    if (challenge instanceof Error) {
      logger.error(challenge);
      return;
    }

    this.appendUserInput(new Date().toISOString(), prompt);
    this.append('');

    var headers = this.getHeader();
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
        chat_session_id: this.chat_id,
        parent_message_id: this.parent_id,
        prompt,
        ref_file_ids: [],
        search_enabled: false,
        thinking_enabled: false,
      }),
    };
    const cb: HttpRequestCallback = {
      onData: (chunk: Buffer, rsp: http.IncomingMessage) => {
        if (rsp.statusCode != 200) {
          return;
        }
        try {
          chunk
            .toString()
            .split('\n')
            .forEach((line: string) => {
              if (line.length == 0) {
                return;
              }
              if (line.slice(6, 12) == '[DONE]') {
                this.append(' (END)');
                return;
              }

              const data = JSON.parse(line.slice(5)) as DeepseekChatCompletion;
              if (data.choices.length > 0) {
                for (const choice of data.choices) {
                  if (choice.delta.content) {
                    this.append(choice.delta.content, false);
                  }
                }
              }
              this.parent_id = data.message_id;
            });
        } catch (e) {
          logger.debug(chunk.toString());
          logger.error(e);
        }
      },
      onError: (err: Error) => {
        this.append(' (ERROR) ');
        this.append(err.message);
      },
    };
    await sendHttpRequestWithCallback(req, cb);
  }
}

export const deepseekChat = new DeepseekChat(
  process.env.MY_AI_DEEPSEEK_CHAT_KEY
    ? process.env.MY_AI_DEEPSEEK_CHAT_KEY
    : '',
);
