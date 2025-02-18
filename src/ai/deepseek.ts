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
  algorithm: string;
  challenge: string;
  salt: string;
  answer: number;
  signature: string;
  target_path: string;
}

interface DeepseekChatResponse {
  code: number;
  msg: string;
  data: {
    biz_code: number;
    biz_msg: string;
    biz_data:
      | {
          chat_session: DeepseekChatSession | undefined;
          chat_sessions: DeepseekChatSession[] | undefined;
          chat_messages: DeepseekChatMessage[] | undefined;
          challenge: DeepseekChatChallenge | undefined;
        }
      | undefined;
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

class DeepseekChat extends BaseChatChannel {
  private auth_key: string;
  private parent_id: number | null;
  private challenge: Record<string, DeepseekChatChallenge>;

  constructor(public readonly key: string) {
    super();
    this.auth_key = key;
    this.parent_id = null;
    this.challenge = {};
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
    return new CocExtError(CocExtError.ERR_DEEPSEEK, '[Deepseek] not impl');
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

  private async getPowChallenge(
    target_path: string,
  ): Promise<DeepseekChatChallenge | CocExtError> {
    const ch = this.challenge[target_path];
    if (ch && ch.expire_at + ch.expire_after < Date.now()) {
      return ch;
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
      this.challenge[target_path] = challenge;
      return challenge;
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

    const req_challenge: DeepseekChatRequestChallenge = {
      algorithm: challenge.algorithm,
      challenge: challenge.challenge,
      salt: challenge.salt,
      answer: Math.floor(Math.random() * 100000),
      signature: challenge.signature,
      target_path: challenge.target_path,
    };
    const x_ds_pow_response = Buffer.from(
      JSON.stringify(req_challenge),
    ).toString('base64');

    var headers = this.getHeader();
    headers['x-ds-pow-response'] = x_ds_pow_response;
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
