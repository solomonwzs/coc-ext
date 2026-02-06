import { CocExtError } from '../utils/common';
import http from 'http';
import {
  sendHttpRequest,
  sendHttpRequestWithCallback,
  HttpRequest,
  HttpRequestCallback,
} from '../utils/http';
import { BaseChatChannel, ChatItem, getCurrentRef, ChunkDecoder } from './base';
import {
  LlmChatRequest,
  LlmChatResponseData,
  LlmContextManager,
} from './context';
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

interface LlmFunctionCall {
  id: string;
  name: string;
  arguments: string;
}

class LlmCaller {
  private endpoint: URL;
  private headers: http.OutgoingHttpHeaders;
  private proxy:
    | {
        host: string;
        port: number;
      }
    | undefined;

  constructor(servConf: LlmServConfig) {
    this.endpoint = new URL(servConf.endpoint);

    this.headers = {};
    for (let key in servConf.auth_headers) {
      this.headers[key] = servConf.auth_headers[key];
    }

    if (servConf.proxy) {
      let proxyUrl = new URL(servConf.proxy);
      this.proxy = {
        host: proxyUrl.hostname,
        port: parseInt(proxyUrl.port),
      };
    }
  }

  private async httpQuery(
    method: string,
    path: string,
    data?: any,
  ): Promise<string | CocExtError> {
    let req: HttpRequest = {
      args: {
        host: this.endpoint.hostname,
        path: `${this.endpoint.pathname}${path}`,
        method,
        protocol: this.endpoint.protocol,
        headers: this.headers,
        timeout: 1000,
      },
      proxy: this.proxy,
      data,
    };
    let resp = await sendHttpRequest(req);
    if (resp.statusCode != 200 || !resp.body) {
      return new CocExtError(
        CocExtError.ERR_COMM_AI,
        `[CommAI] statusCode: ${resp.statusCode}, path: ${req.args.path}, resp: ${resp.body?.toString()}`,
      );
    }
    return resp.body.toString();
  }

  public setConersationId(id: string) {
    this.headers['X-Conversation-Id'] = id;
  }

  public async models(): Promise<LlmModelsResponse | CocExtError> {
    delete this.headers['Content-Type'];
    delete this.headers['X-Request-Id'];

    let res = await this.httpQuery('GET', '/v1/models');
    return res instanceof Error ? res : (JSON.parse(res) as LlmModelsResponse);
  }

  public async completions(
    data: LlmChatRequest,
  ): Promise<LlmChatResponseData | CocExtError> {
    this.headers['Content-Type'] = 'application/json';
    this.headers['X-Request-Id'] = crypto.randomUUID();

    data.stream = false;
    let res = await this.httpQuery(
      'POST',
      '/v1/chat/completions',
      JSON.stringify(data),
    );
    return res instanceof Error
      ? res
      : (JSON.parse(res) as LlmChatResponseData);
  }

  public async completionsSSE(
    data: LlmChatRequest,
    cb: HttpRequestCallback,
  ): Promise<void> {
    this.headers['Content-Type'] = 'application/json';
    this.headers['X-Request-Id'] = crypto.randomUUID();

    data.stream = true;
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
      data: JSON.stringify(data),
    };
    await sendHttpRequestWithCallback(req, cb);
  }
}

class LlmCommonChat extends BaseChatChannel {
  private caller: LlmCaller;
  private chatReq: LlmChatRequest;
  private model: LlmModels | undefined;
  private ctxManager: LlmContextManager;

  constructor(servConf: LlmServConfig) {
    super();

    this.caller = new LlmCaller(servConf);

    this.chatReq = {
      model: '',
      messages: [],
      tools: [
        // {
        //   type: 'function',
        //   function: {
        //     name: 'get_weather',
        //     description: '查询指定城市天气',
        //     parameters: {
        //       type: 'object',
        //       required: ['location'],
        //       properties: {
        //         location: { type: 'string', description: '城市名称' },
        //       },
        //     },
        //   },
        // },
        // {
        //   type: 'function',
        //   function: {
        //     name: 'get_traffic_info',
        //     description: '查询指定城市交通信息',
        //     parameters: {
        //       type: 'object',
        //       required: ['location'],
        //       properties: {
        //         location: { type: 'string', description: '城市名称' },
        //       },
        //     },
        //   },
        // },
      ],
      temperature: 1,
      top_p: 0.95,
      stream: true,
      // stream: false,
      thinking: {
        type: 'enabled',
      },
    };

    this.ctxManager = new LlmContextManager();
  }

  public reset(): void {
    this.chatReq.messages = [];
  }

  public getChatName(): string {
    return 'LlmCommon';
  }

  public async getChatList(): Promise<ChatItem[] | Error> {
    return [];
  }

  public async createChatId(_name: string): Promise<string | Error> {
    let llmResp = await this.caller.models();
    if (llmResp instanceof Error) {
      return llmResp;
    }

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
      this.chatReq.model = choose.data.name;
    } else {
      return new CocExtError(CocExtError.ERR_COMM_AI, 'choose model fail');
    }
    let chatId = crypto.randomUUID();
    this.caller.setConersationId(chatId);
    return chatId;
  }

  public async showHistoryMessages(): Promise<null | Error> {
    return null;
  }

  public async showItem(): Promise<void> {}

  public async chat(text: string): Promise<void> {
    this.chan.appendUserInput(new Date().toISOString(), text);

    this.ctxManager.appendMessage({
      oriMessage: {
        role: 'user',
        content: text,
      },
    });

    const kStatusNone = 0;
    const kStatusReasoning = 1;
    const kStatusContent = 2;
    const kStatusStop = 3;

    let reqId: string = '';
    let fcList: LlmFunctionCall[] = [];
    let decoder = new ChunkDecoder();
    let respText: string = '';
    let status: number = kStatusNone;
    let promptTokens: number = 0;
    let completionTokens: number = 0;
    let cb: HttpRequestCallback = {
      onData: (chunk: Buffer, rsp: http.IncomingMessage) => {
        // logger.debug(chunk.toString());
        if (rsp.statusCode != 200) {
          logger.error(`statusCode: ${rsp.statusCode}, ${chunk.toString()}`);
          return;
        }

        let msgList = decoder.decode(chunk);
        for (let m of msgList) {
          if (m.data == '[DONE]') {
            continue;
          }

          try {
            let data = JSON.parse(m.data) as LlmChatResponseData;
            logger.debug(data);
            if (reqId.length == 0) {
              reqId = data.id;
              this.chan.append(`>> id:${reqId}\n`);
            }

            for (let c of data.choices) {
              if (c.delta && c.delta.reasoning_content) {
                if (status != kStatusReasoning) {
                  this.chan.append('\n---');
                }
                status = kStatusReasoning;

                respText += c.delta.reasoning_content;
                this.chan.append(c.delta.reasoning_content, false);
              }

              if (c.delta && c.delta.content) {
                if (status == kStatusReasoning) {
                  this.chan.append('\n---');
                }
                status = kStatusContent;

                respText += c.delta.content;
                this.chan.append(c.delta.content, false);
              }

              if (c.delta && c.delta.tool_calls) {
                for (let t of c.delta.tool_calls) {
                  if (fcList.length == 0 || t.id) {
                    fcList.push({
                      id: t.id,
                      name: t.function.name ? t.function.name : '',
                      arguments: t.function.arguments
                        ? t.function.arguments
                        : '',
                    });
                  } else {
                    let func = fcList[fcList.length - 1];
                    if (t.function.name) {
                      func.name += t.function.name;
                    }
                    if (t.function.arguments) {
                      func.arguments += t.function.arguments;
                    }
                  }
                }
              }

              if (c.finish_reason) {
                status = kStatusStop;

                this.ctxManager.appendMessage({
                  oriMessage: {
                    role: 'assistant',
                    content: respText,
                  },
                });
              }
            }

            if (data.usage) {
              promptTokens = data.usage.prompt_tokens;
              completionTokens = data.usage.completion_tokens;
            }
          } catch (e) {
            logger.error(e);
            logger.debug(m.data);
          }
        }
      },
      onEnd: (rsp: http.IncomingMessage) => {
        logger.debug(rsp.statusCode);
        this.chan.append(
          `\n(\`END\`, usage: in \`${promptTokens}\`, out \`${completionTokens}\`, total \`${promptTokens + completionTokens}\`)`,
        );
        logger.debug(fcList);
      },
    };

    this.chatReq.messages = this.ctxManager.getMessages();
    await this.caller.completionsSSE(this.chatReq, cb);
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
