import {
  sendHttpRequest,
  sendHttpRequestWithCallback,
  HttpRequest,
  HttpRequestCallback,
} from '../utils/http';
import http from 'http';
import { logger } from '../utils/logger';
import { CocExtError } from '../utils/common';
import { BaseChatChannel, ChatItem, getCurrentRef, ChunkDecoder } from './base';
import { popup, ScratchWindow } from '../utils/helper';
import { URLSearchParams } from 'url';
import { createHmac } from 'crypto';

let globalZAi = {
  host: 'chat.z.ai',
  timeout: 5000,
  model: 'glm-5',
  enable_thinking: false,
  auto_web_search: true,
  // mcp_servers: ['advanced-search'],
  mcp_servers: [],
  user_language: 'zh-CN',
  user_agent:
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) ' +
    'AppleWebKit/537.36 (KHTML, like Gecko) ' +
    'Chrome/91.0.4472.77 ' +
    'Safari/537.36 ' +
    'Edg/91.0.864.41',
  client_version: 'prod-fe-1.0.237',
  hmac_key: 'key-@@@@)))()((9))-xxxx&&&%%%%%',
};

interface AuthResponse {
  id: string;
  email: string;
  name: string;
  role: string;
  profile_image_url: string;
  idp: string;
  token: string;
  token_type: string;
  expires_at: null;
  permissions: {
    workspace: {
      models: boolean;
      knowledge: boolean;
      prompts: boolean;
      tools: boolean;
    };
    sharing: {
      public_models: boolean;
      public_knowledge: boolean;
      public_prompts: boolean;
      public_tools: boolean;
    };
    chat: {
      controls: boolean;
      file_upload: boolean;
      delete: boolean;
      edit: boolean;
      temporary: boolean;
      temporary_enforced: boolean;
    };
    features: {
      direct_tool_servers: boolean;
      web_search: boolean;
      image_generation: boolean;
      code_interpreter: boolean;
    };
  };
}

interface ChatListItem {
  id: string;
  title: string;
  updated_at: number;
  created_ad: number;
}

interface HistoryChatMessage {
  id: string;
  parentId: string | null;
  childrenIds: string[];
  role: string;
  timestamp: number;
  content?: string;
  models?: string[];
}

interface HistoryChat {
  id: string;
  user_id: string;
  title: string;
  chat: {
    title: string;
    models: string[];
    params: any;
    history: {
      messages: {
        [index: string]: HistoryChatMessage;
      };
      currentId: string;
    };
    tags: string[];
    features: {
      type: string;
      server: string;
      status: string;
    }[];
    enable_thinking: boolean;
    timestamp: number;
    extra: any;
    updated_at: number;
    created_at: number;
    share_id: string | null;
    archived: boolean;
    pinned: boolean;
    meta: {
      auto_web_search: boolean;
      flags: string[];
      mcp_servers: [];
      models: string[];
    };
    folder_id: string | null;
    message_version: number;
  };
}

interface Browser {
  url?: string;
  refid?: string;
  title?: string;
  content?: string;
  search_result?: SearchResult[];
  session_id: string;
  total_results?: number;
  turn_count: number;
}

interface HistoryChatDataContentBlock {
  type: string;
  content:
    | string
    | {
        id: string;
        type: string;
        function: {
          name: string;
          arguments: string;
        };
      }[];
  results?: {
    status: string;
    browser: Browser;
    content: string;
    tool_call_id: string;
  }[];
  started_at?: number;
  ended_at?: number | null;
}

interface Usage {
  total_tokens: number;
  prompt_tokens: number;
  completion_tokens: number;
  prompt_tokens_details: {
    cached_tokens?: number;
  };
}

interface HistoryChatData {
  id: string;
  chat_id: string;
  user_id: string;
  parent_id: string | null;
  role: string;
  content: string | null;
  content_blocks: HistoryChatDataContentBlock[] | null;
  files: null;
  usage: Usage | null;
  status: null;
  status_history: null;
  extra: null;
  model: string | null;
  model_name: null;
  model_idx: number;
  done: boolean;
  timestamp: number;
  created_at: number;
  updated_at: number;
  childrenIds: string[];
  parentId: string | null;
}

interface HistoryChatDetail {
  chat_id: string;
  data: {
    [index: string]: HistoryChatData;
  };
  message_version: number;
}

interface ChatRequest {
  stream: boolean;
  model: string;
  messages: {
    role: string;
    content: string;
  }[];
  signature_prompt: string;
  params: any;
  extra: any;
  mcp_servers?: string[];
  features: {
    image_generation: boolean;
    web_search: boolean;
    auto_web_search: boolean;
    preview_mode: boolean;
    flags: string[];
    enable_thinking: boolean;
  };
  variables: {
    [index: string]: string;
  };
  chat_id: string;
  id: string;
  current_user_message_id: string;
  current_user_message_parent_id: string | null;
  background_tasks: {
    title_generation: boolean;
    tags_generation: boolean;
  };
}

interface SearchResult {
  title: string;
  url: string;
  text: string;
  index: number;
  favicon: string;
  ref_id: string;
  host_name: string;
}

interface ChatResponseData {
  type: string;
  data: {
    phase: string;
    delta_content?: string;
    delta_arguments?: string;
    tool_name?: string;
    status?: string;
    done?: boolean;
    metadata?: {
      type?: string;
      tool_call_id?: string;
      browser?: Browser;
    };
    usage?: Usage;
  };
}

function hmacSha256Hex(key: string, data: string): string {
  const hmac = createHmac('sha256', key);
  hmac.update(data);
  return hmac.digest('hex');
}

function generateSignature(
  userId: string,
  requestId: string,
  userContent: string,
  timestamp: number,
): string {
  const requestInfo = `requestId,${requestId},timestamp,${timestamp},user_id,${userId}`;
  const contentBase64 = Buffer.from(userContent).toString('base64');
  const signData = `${requestInfo}|${contentBase64}|${timestamp}`;

  const period = Math.floor(timestamp / (5 * 60 * 1000));
  const firstHmac = hmacSha256Hex(globalZAi.hmac_key, `${period}`);
  const signature = hmacSha256Hex(firstHmac, signData);

  return signature;
}

class ZAiChat extends BaseChatChannel {
  private headers: http.OutgoingHttpHeaders;
  private currentId: string | null;
  private userId: string;

  constructor(private token: string) {
    super();
    this.headers = {
      'User-Agent': globalZAi.user_agent,
      'Content-Type': 'application/json',
      Authorization: `Bearer ${this.token}`,
      'X-FE-Version': 'prod-fe-1.0.237',
    };
    this.currentId = null;
    this.userId = '';
  }

  public reset() {}

  public getChatName() {
    return 'ZAi';
  }

  private async sendRequest(
    method: string,
    path: string,
    data: any = null,
  ): Promise<Buffer | Error> {
    let req: HttpRequest = {
      args: {
        host: globalZAi.host,
        path,
        method,
        protocol: 'https:',
        headers: this.headers,
        timeout: globalZAi.timeout,
      },
      data: data == null ? undefined : JSON.stringify(data),
    };

    let resp = await sendHttpRequest(req);
    if (resp.statusCode != 200 || !resp.body) {
      return new CocExtError(
        CocExtError.ERR_ZAI,
        `[Z.ai] statusCode: ${resp.statusCode}, path: ${path}, resp: ${resp.body?.toString()}`,
      );
    }
    return resp.body;
  }

  public async auth(): Promise<void | Error> {
    let resp = await this.sendRequest('GET', '/api/v1/auths/');
    if (resp instanceof Error) {
      return resp;
    }
    let au = JSON.parse(resp.toString()) as AuthResponse;
    logger.debug(au);
    if (au.token) {
      this.token = au.token;
    }
  }

  public async getChatList(): Promise<ChatItem[] | Error> {
    let chats: ChatItem[] = [];
    for (let page = 1; page < 10; ++page) {
      let resp = await this.sendRequest('GET', `/api/v1/chats/?page=${page}`);
      if (resp instanceof Error) {
        return resp;
      }

      let list = JSON.parse(resp.toString()) as ChatListItem[];
      if (list.length == 0) {
        break;
      }
      for (const i of list) {
        chats.push({
          label: i.title,
          chatId: i.id,
          description: new Date(i.updated_at * 1000).toISOString(),
        });
      }
    }
    return chats;
  }

  public async createChatId(_name: string): Promise<string | Error> {
    return '';
  }

  public async showHistoryMessages(): Promise<null | Error> {
    let resp = await this.sendRequest('GET', `/api/v1/chats/${this.chatId}`);
    if (resp instanceof Error) {
      return resp;
    }
    let firstMsg: HistoryChatMessage | null = null;
    let historyMsgids: string[] = [];
    let chatInfo = JSON.parse(resp.toString()) as HistoryChat;
    Object.entries(chatInfo.chat.history.messages).forEach(([key, value]) => {
      historyMsgids.push(key);
      if (value.parentId == null) {
        firstMsg = value;
      }
    });
    if (firstMsg == null) {
      return null;
    }
    this.currentId = chatInfo.chat.history.currentId;
    this.userId = chatInfo.user_id;

    resp = await this.sendRequest(
      'POST',
      `/api/v1/chats/${this.chatId}/messages/batch`,
      { ids: historyMsgids },
    );
    if (resp instanceof Error) {
      return resp;
    }
    let historyChatDetail = JSON.parse(resp.toString()) as HistoryChatDetail;

    let messages: HistoryChatMessage[] = [firstMsg];
    let currIdx = 0;
    while (currIdx < messages.length) {
      let currMsg = messages[currIdx];
      let detail = historyChatDetail.data[currMsg.id];
      // logger.debug(detail);

      if (detail.role == 'user') {
        let time = new Date(detail.created_at * 1000).toISOString();
        if (detail.content) {
          this.chan.appendUserInput(time, detail.content);
        } else if (detail.content_blocks) {
          let cont: string = '';
          for (const i of detail.content_blocks) {
            cont += i.content;
          }
          this.chan.appendUserInput(time, cont);
        }
        this.chan.append('');
      } else {
        if (detail.content) {
          this.chan.append(detail.content);
        } else if (detail.content_blocks) {
          for (let i of detail.content_blocks) {
            if (typeof i.content == 'string') {
              if (i.type == 'reasoning') {
                this.chan.append('---');
                this.chan.append(i.content);
                this.chan.append('---');
              } else {
                this.chan.append(i.content);
              }
            }
          }
        }
      }

      for (let id of currMsg.childrenIds) {
        messages.push(chatInfo.chat.history.messages[id]);
      }
      currIdx += 1;
    }

    return null;
  }

  public async showItem(): Promise<void> {
    return;
  }

  public async chat(text: string): Promise<void> {
    if (!this.chatId) {
      return;
    }
    this.chan.appendUserInput(new Date().toISOString(), text);

    let chatReq: ChatRequest = {
      stream: true,
      model: globalZAi.model,
      messages: [{ role: 'user', content: text }],
      signature_prompt: text,
      params: {},
      extra: {},
      mcp_servers: globalZAi.mcp_servers,
      features: {
        image_generation: false,
        web_search: true,
        auto_web_search: globalZAi.auto_web_search,
        preview_mode: true,
        flags: [],
        enable_thinking: globalZAi.enable_thinking,
      },
      variables: {
        '{{USER_LANGUAGE}}': globalZAi.user_language,
      },
      chat_id: this.chatId,
      id: crypto.randomUUID(),
      current_user_message_id: crypto.randomUUID(),
      current_user_message_parent_id: this.currentId,
      background_tasks: {
        title_generation: true,
        tags_generation: true,
      },
    };
    logger.debug(chatReq);

    const kStatusNone = 0;
    const kStatusReasoning = 1;
    const kStatusContent = 2;
    const kStatusStop = 3;

    let decoder = new ChunkDecoder();
    let status = kStatusNone;
    let cb: HttpRequestCallback = {
      onData: (chunk: Buffer, rsp: http.IncomingMessage) => {
        if (rsp.statusCode != 200) {
          logger.error(`statusCode: ${rsp.statusCode}, ${chunk.toString()}`);
          return;
        }

        let msgList = decoder.decode(chunk);
        for (let m of msgList) {
          try {
            let d = JSON.parse(m.data) as ChatResponseData;
            logger.debug(d);

            if (d.data.phase == 'thinking' && d.data.delta_content) {
              if (status != kStatusReasoning) {
                this.chan.append('\n---');
              }
              status = kStatusReasoning;
              this.chan.append(d.data.delta_content, false);
            } else if (d.data.phase == 'answer' && d.data.delta_content) {
              if (status == kStatusReasoning) {
                this.chan.append('\n---');
              }
              status = kStatusContent;
              this.chan.append(d.data.delta_content, false);
            } else if (
              d.data.phase == 'tool_response' &&
              d.data.metadata &&
              d.data.metadata.browser &&
              d.data.metadata.browser.search_result
            ) {
              // let searchResult = d.data.metadata.browser.search_result;
            } else if (d.data.done) {
              status = kStatusStop;
              this.chan.append('\n(END)');
            }
          } catch (e) {
            logger.error(e);
            logger.debug(m.data);
          }
        }
      },
    };

    let timestamp = Date.now();
    let requestId = crypto.randomUUID();
    let params = new URLSearchParams({
      timestamp: timestamp.toString(),
      requestId,
      user_id: this.userId,
      version: '0.0.1',
      platform: 'web',
      user_agent: globalZAi.user_agent,
      browser_name: 'Firefox',
      signature_timestamp: timestamp.toString(),
    });
    let sign = generateSignature(this.userId, requestId, text, timestamp);
    logger.debug(params.toString());

    this.headers['X-Signature'] = sign;
    let req: HttpRequest = {
      args: {
        host: globalZAi.host,
        path: `/api/v2/chat/completions?${params.toString()}`,
        method: 'POST',
        protocol: 'https:',
        headers: this.headers,
      },
      data: JSON.stringify(chatReq),
    };
    await sendHttpRequestWithCallback(req, cb);

    return;
  }

  public async delSession(_chatId: string): Promise<null | Error> {
    return null;
  }
}

export const zaiChat = new ZAiChat(
  process.env.MY_AI_ZAI_CHAT_KEY ? process.env.MY_AI_ZAI_CHAT_KEY : '',
);
