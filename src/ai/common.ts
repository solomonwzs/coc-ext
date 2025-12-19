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
import { popup, ScratchWindow, countTextWidth } from '../utils/helper';
import { getEnvHttpProxy } from '../utils/common';
import { window, workspace, ProviderResult } from 'coc.nvim';

interface IDictionary {
  [index: string]: string;
}

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

interface ChatMessage {
  role: string;
  content: string;
}

interface ChatRecords {
  model: string;
  messages: ChatMessage[];
  temperature: number;
  top_p: number;
  stream: boolean;
}

class CommonChat extends BaseChatChannel {
  private endpoint: URL;
  private headers: http.OutgoingHttpHeaders;
  private chatRecords: ChatRecords;
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

    this.chatRecords = {
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
    this.chatRecords.messages = [];
  }

  public getChatName(): string {
    return 'Common';
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

    let maxWidth = 0;
    for (let i of llmResp.models) {
      if (!i.enabled) {
        continue;
      }
      let w = countTextWidth(i.alias);
      if (w > maxWidth) {
        maxWidth = w;
      }
    }

    let quickItems: any[] = [];
    for (let i of llmResp.models) {
      if (!i.enabled) {
        continue;
      }
      let lableWidth = countTextWidth(i.alias);
      let spaces = ' '.repeat(maxWidth - lableWidth + 2);
      quickItems.push({
        label: `${i.alias}${spaces}f[${i.enableFunctionCall ? 'o' : 'x'}] m[${i.multimodalEnabled ? 'o' : 'x'}] t[${i.tokenLimit}]`,
        data: i,
      });
    }
    let choose: LlmModels = await window.showQuickPick(quickItems, {
      title: 'Choose model',
    });
    if (choose) {
      this.model = choose;
      this.chatRecords.model = choose.name;
    } else {
      return new CocExtError(CocExtError.ERR_COMM_AI, 'choose model fail');
    }
    return crypto.randomUUID();
  }

  public async showHistoryMessages(): Promise<null | Error> {
    return null;
  }

  public async showItem(): Promise<void> {}

  public async chat(text: string): Promise<void> {
    this.chan.appendUserInput(new Date().toISOString(), text);
  }

  public async delSession(_chatId: string): Promise<null | Error> {
    return null;
  }
}

function create_common_chat() {
  if (process.env.MY_AI_COMMON_CONF_PATH) {
    let confPath = process.env.MY_AI_COMMON_CONF_PATH;
    try {
      fs.accessSync(confPath, fs.constants.R_OK);
      let conf = JSON.parse(
        fs.readFileSync(confPath).toString(),
      ) as LlmServConfig;
      logger.debug(conf);
      return new CommonChat(conf);
    } catch (err) {
      logger.error(err);
    }
  }
  return new CommonChat({
    auth_headers: {},
    endpoint: '',
  });
}

export const commonChat = create_common_chat();
