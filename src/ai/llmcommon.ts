import { CocExtError } from '../utils/common';
import http from 'http';
import {
  sendHttpRequest,
  sendHttpRequestWithCallback,
  HttpRequest,
  HttpRequestCallback,
} from '../utils/http';
import { BaseChatChannel, ChatItem, getCurrentRef, ChunkDecoder } from './base';
import { logger } from '../utils/logger';
import { fsAccess, fsReadFile } from '../utils/file';
import { simpleHttpDownloadFile } from '../utils/http';
import fs from 'fs';
import { getcfg } from '../utils/config';
import { CocExtAIChatConfig } from '../utils/types';
import {
  popup,
  ScratchWindow,
  countTextWidth,
  StringAlignHelper,
} from '../utils/helper';
import { getEnvHttpProxy } from '../utils/common';
import { window, workspace, ProviderResult } from 'coc.nvim';

interface LlmServConfig {
  auth_headers: {
    [index: string]: string;
  };
  endpoint: string;
  proxy?: string;
}

interface LlmModels {
  name: string;
  alias: string;
  description: string;
  tokenLimit: number;
  enableFunctionCall: boolean;
  multimodalEnabled: boolean;
  enabled: boolean;
}

interface LlmModelsResponse {
  models: LlmModels[];
}

interface LlmChatMessage {
  role: string;
  content: string;
}

interface LlmChatRequest {
  model: string;
  messages: LlmChatMessage[];
  temperature: number;
  top_p: number;
  stream: boolean;
}

interface LlmChatResponseData {
  choices: {
    delta: {
      role?: string;
      content?: string;
      tool_calls: any[];
    };
    index: number;
    finish_reason?: string;
  }[];
  created: number;
  id: string;
  model: string;
  object: string;
  usage: {
    completion_tokens: number;
    prompt_tokens: number;
    total_tokens: number;
  };
}

class LlmCommonChat extends BaseChatChannel {
  private endpoint: URL;
  private headers: http.OutgoingHttpHeaders;
  private chatChain: LlmChatRequest;
  private proxy:
    | {
        host: string;
        port: number;
      }
    | undefined;
  private model: LlmModels | undefined;

  constructor(servConf: LlmServConfig) {
    super();

    this.endpoint = new URL(servConf.endpoint);

    this.headers = {};
    for (let key in servConf.auth_headers) {
      this.headers[key] = servConf.auth_headers[key];
    }

    this.chatChain = {
      model: '',
      messages: [],
      temperature: 1,
      top_p: 0.95,
      stream: true,
    };

    if (servConf.proxy) {
      let proxyUrl = new URL(servConf.proxy);
      this.proxy = {
        host: proxyUrl.hostname,
        port: parseInt(proxyUrl.port),
      };
    }
  }

  public reset(): void {
    this.chatChain.messages = [];
  }

  public getChatName(): string {
    return 'LlmCommon';
  }

  public async getChatList(): Promise<ChatItem[] | Error> {
    return [];
  }

  public async createChatId(_name: string): Promise<string | Error> {
    let req: HttpRequest = {
      args: {
        host: this.endpoint.hostname,
        path: `${this.endpoint.pathname}/v1/models`,
        method: 'GET',
        protocol: this.endpoint.protocol,
        headers: this.headers,
        timeout: 1000,
      },
      proxy: this.proxy,
    };
    let resp = await sendHttpRequest(req);
    if (resp.statusCode != 200 || !resp.body) {
      return new CocExtError(
        CocExtError.ERR_COMM_AI,
        `[CommAI] statusCode: ${resp.statusCode}, path: ${req.args.path}, resp: ${resp.body?.toString()}`,
      );
    }

    let llmResp = JSON.parse(resp.body.toString()) as LlmModelsResponse;
    let alignHelper = new StringAlignHelper('LR');
    for (let i of llmResp.models) {
      if (!i.enabled) {
        continue;
      }
      alignHelper.put(i.alias, i.tokenLimit.toString());
    }

    let quickItems: any[] = [];
    for (let i of llmResp.models) {
      if (!i.enabled) {
        continue;
      }
      let n = quickItems.length;
      quickItems.push({
        label: `${alignHelper.get(n, 0)}    f[${i.enableFunctionCall ? 'o' : 'x'}] m[${i.multimodalEnabled ? 'o' : 'x'}] t[${alignHelper.get(n, 1)}]`,
        data: i,
      });
    }

    let choose = await window.showQuickPick(quickItems, {
      title: 'Choose model',
    });
    if (choose) {
      logger.debug(choose);
      this.model = choose.data;
      this.chatChain.model = choose.data.name;
    } else {
      return new CocExtError(CocExtError.ERR_COMM_AI, 'choose model fail');
    }
    let chatId = crypto.randomUUID();
    this.headers['X-Conversation-Id'] = chatId;
    return chatId;
  }

  public async showHistoryMessages(): Promise<null | Error> {
    return null;
  }

  public async showItem(): Promise<void> {}

  public async chat(text: string): Promise<void> {
    let reqId = crypto.randomUUID();
    this.chan.appendUserInput(new Date().toISOString(), text);
    this.chan.append(`>> id:${reqId}\n`);

    this.chatChain.messages.push({
      role: 'user',
      content: text,
    });

    let decoder = new ChunkDecoder();
    let respText: string = '';
    let cb: HttpRequestCallback = {
      onData: (chunk: Buffer, rsp: http.IncomingMessage) => {
        if (rsp.statusCode != 200) {
          logger.error(`statusCode: ${rsp.statusCode}, ${chunk.toString()}`);
          return;
        }

        let msgList = decoder.decode(chunk);
        for (let m of msgList) {
          let data = JSON.parse(m.data) as LlmChatResponseData;
          for (let c of data.choices) {
            if (c.finish_reason === 'stop') {
              this.chatChain.messages.push({
                role: 'assistant',
                content: respText,
              });
              this.chan.append(
                ` (END, tokens: in ${data.usage.prompt_tokens}, out ${data.usage.completion_tokens}, all ${data.usage.total_tokens})`,
              );
            } else if (c.delta.content) {
              respText += c.delta.content;
              this.chan.append(c.delta.content, false);
            }
          }
        }
      },
    };

    this.headers['Content-Type'] = 'application/json';
    this.headers['X-Request-Id'] = reqId;
    let req: HttpRequest = {
      args: {
        host: this.endpoint.hostname,
        path: `${this.endpoint.pathname}/v1/chat/completions?alt=sse`,
        method: 'POST',
        protocol: this.endpoint.protocol,
        headers: this.headers,
        timeout: 1000,
      },
      proxy: this.proxy,
      data: JSON.stringify(this.chatChain),
    };
    await sendHttpRequestWithCallback(req, cb);
  }

  public async delSession(_chatId: string): Promise<null | Error> {
    return null;
  }
}

function create_llm_common_chat() {
  if (process.env.MY_AI_COMMON_CONF_PATH) {
    let confPath = process.env.MY_AI_COMMON_CONF_PATH;
    try {
      fs.accessSync(confPath, fs.constants.R_OK);
      let conf = JSON.parse(
        fs.readFileSync(confPath).toString(),
      ) as LlmServConfig;
      return new LlmCommonChat(conf);
    } catch (err) {
      logger.error(err);
    }
  }
  return new LlmCommonChat({
    auth_headers: {},
    endpoint: 'http://127.0.0.1',
  });
}

export const llmCommonChat = create_llm_common_chat();
