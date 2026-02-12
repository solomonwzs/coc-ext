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

let globalZAi = {
  host: 'chat.z.ai',
  timeout: 5000,
};

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

interface HistoryChatDataContentBlock {
  type: string;
  content: string;
  started_at?: number;
  ended_at?: number | null;
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
  usage: {
    total_tokens: number;
    prompt_tokens: number;
    completion_tokens: number;
    prompt_tokens_details: any;
  } | null;
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

class ZAiChat extends BaseChatChannel {
  private headers: http.OutgoingHttpHeaders;

  constructor(readonly token: string) {
    super();
    this.headers = {
      'User-Agent':
        'Mozilla/5.0 (Windows NT 10.0; Win64; x64) ' +
        'AppleWebKit/537.36 (KHTML, like Gecko) ' +
        'Chrome/91.0.4472.77 ' +
        'Safari/537.36 ' +
        'Edg/91.0.864.41',
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
    };
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

      logger.debug(detail.role);
      logger.debug(detail.content ? detail.content : detail.content_blocks);

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

  public async chat(_text: string): Promise<void> {
    return;
  }

  public async delSession(_chatId: string): Promise<null | Error> {
    return null;
  }
}

export const zaiChat = new ZAiChat(
  process.env.MY_AI_ZAI_CHAT_KEY ? process.env.MY_AI_ZAI_CHAT_KEY : '',
);
