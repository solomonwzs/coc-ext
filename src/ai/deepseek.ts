import { CocExtError } from '../utils/common';
import http from 'http';
import {
  sendHttpRequest,
  sendHttpRequestWithCallback,
  HttpRequest,
  HttpRequestCallback,
  HttpResponse,
} from '../utils/http';

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
  chat_session_id: string;
  parent_message_id: number | undefined;
  prompt: string;
  ref_file_ids: string[];
  search_enabled: boolean;
  thinking_enabled: boolean;
}

class DeepseekChat {
  private auth_key: string;

  constructor(public readonly key: string) {
    this.auth_key = key;
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

  public async sessions(): Promise<DeepseekChatSession[] | CocExtError> {
    const resp = await this.httpGet(
      '/api/v0/chat_session/fetch_page?count=100',
    );
    if (resp instanceof Error) {
      return resp;
    }
    const chat_sessions = resp.data.biz_data?.chat_sessions;
    return chat_sessions == undefined
      ? new CocExtError(CocExtError.ERR_DEEPSEEK, 'get sessions fail')
      : chat_sessions;
  }

  public async historyMessages(sess_id: string) {
    const resp = await this.httpGet(
      `/api/v0/chat/history_messages?chat_session_id=${sess_id}`,
    );
    if (resp instanceof Error) {
      return resp;
    }
    const messages = resp.data.biz_data?.chat_messages;
    return messages == undefined
      ? new CocExtError(CocExtError.ERR_DEEPSEEK, 'get messages fail')
      : messages;
  }

  public async createPowChallenge(
    target_path: string,
  ): Promise<DeepseekChatChallenge | CocExtError> {
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
    return challenge == undefined
      ? new CocExtError(CocExtError.ERR_DEEPSEEK, 'get challenge fail')
      : challenge;
  }

  public async chat(
    chat_session_id: string,
    parent_message_id: number | undefined,
    prompt: string,
    challenge: DeepseekChatChallenge,
    search_enabled: boolean = false,
    thinking_enabled: boolean = false,
  ) {
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
        chat_session_id,
        parent_message_id,
        prompt,
        ref_file_ids: [],
        search_enabled,
        thinking_enabled,
      }),
    };
    const cb: HttpRequestCallback = {
      onData: (chunk: Buffer, rsp: http.IncomingMessage) => {
        console.log('>', rsp.statusCode);
        console.log('>', chunk.toString());
      },
      onError: (err: Error) => {
        console.log(err);
      },
    };
    console.log(req);
    await sendHttpRequestWithCallback(req, cb);
  }
}

export const deepseekChat = new DeepseekChat(
  process.env.MY_DEEPSEEK_CHAT_KEY ? process.env.MY_DEEPSEEK_CHAT_KEY : '',
);
