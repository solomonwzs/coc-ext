import {
  sendHttpRequest,
  sendHttpRequestWithCallback,
  HttpRequest,
  HttpRequestCallback,
} from '../utils/http';
import http from 'http';

export interface KimiChatItem {
  id: string;
  name: string;
  created_at: string;
  updated_at: string;
  status: string;
  type: string;
}

class KimiChat {
  private rtoken: string;
  private chat_id: string;
  private headers: http.OutgoingHttpHeaders;

  constructor(public readonly refresh_token: string) {
    this.rtoken = refresh_token;
    this.chat_id = '';
    const trafficID = Array.from({ length: 20 }, () =>
      Math.floor(Math.random() * 36).toString(36),
    ).join('');
    this.headers = {
      'Content-Type': 'application/json',
      'User-Agent':
        'Mozilla/5.0 (Windows NT 10.0; Win64; x64) ' +
        'AppleWebKit/537.36 (KHTML, like Gecko) ' +
        'Chrome/91.0.4472.77 ' +
        'Safari/537.36 ' +
        'Edg/91.0.864.41',
      Origin: 'https://kimi.moonshot.cn',
      Referer: 'https://kimi.moonshot.cn/',
      'X-Traffic-Id': trafficID,
    };
  }

  public async getAccessToken(): Promise<number> {
    this.headers['Authorization'] = `Bearer ${this.rtoken}`;
    const refresh_req: HttpRequest = {
      args: {
        host: 'kimi.moonshot.cn',
        path: '/api/auth/token/refresh',
        method: 'GET',
        protocol: 'https:',
        headers: this.headers,
        timeout: 1000,
      },
    };
    const resp = await sendHttpRequest(refresh_req);
    if (resp.statusCode == 200 && resp.body) {
      const obj = JSON.parse(resp.body.toString());
      this.headers['Authorization'] = `Bearer ${obj['access_token']}`;
    }
    return resp.statusCode ? resp.statusCode : -1;
  }

  public getChatID(): string {
    return this.chat_id;
  }

  public setChatID(chat_id: string) {
    this.chat_id = chat_id;
  }

  public async createChatID() {
    const test_req: HttpRequest = {
      args: {
        host: 'kimi.moonshot.cn',
        path: '/api/chat',
        method: 'POST',
        protocol: 'https:',
        headers: this.headers,
        timeout: 1000,
      },
      data: JSON.stringify({ name: 'Kimi', is_example: false }),
    };
    const resp = await sendHttpRequest(test_req);
    if (resp.statusCode == 200 && resp.body) {
      const obj = JSON.parse(resp.body.toString());
      this.chat_id = obj['id'];
    }
    return resp.statusCode ? resp.statusCode : -1;
  }

  public async chatList(): Promise<KimiChatItem[] | Error> {
    if (
      !this.headers['Authorization'] &&
      (await this.getAccessToken()) != 200
    ) {
      return { name: 'ERR_AUTH_FAIL', message: 'auth fail' };
    }
    const req: HttpRequest = {
      args: {
        host: 'kimi.moonshot.cn',
        path: '/api/chat/list',
        method: 'POST',
        protocol: 'https:',
        headers: this.headers,
        timeout: 1000,
      },
      data: JSON.stringify({ kimiplus_id: '', offset: 0, size: 50 }),
    };
    const resp = await sendHttpRequest(req);
    if (resp.statusCode == 200 && resp.body) {
      let obj = JSON.parse(resp.body.toString());
      if (obj['items']) {
        return obj['items'];
      } else {
        return [];
      }
    } else {
      return {
        name: 'ERR_GET_CHAT_LIST',
        message: `statusCode: ${resp.statusCode}, error: ${resp.error}`,
      };
    }
  }

  public async chat(text: string) {
    if (
      !this.headers['Authorization'] ||
      (!this.chat_id && (await this.createChatID()) == 401)
    ) {
      if ((await this.getAccessToken()) != 200) {
        return -1;
      }
    }
    if (!this.chat_id && (await this.createChatID()) != 200) {
      return -1;
    }

    let statusCode = -1;
    const cb: HttpRequestCallback = {
      onData: (chunk: Buffer) => {
        chunk
          .toString()
          .split('\n')
          .forEach((line: string) => {
            if (line.length == 0) {
              return;
            }
            const data = JSON.parse(line.slice(5));
            if (data['event'] == 'cmpl') {
              process.stdout.write(data['text']);
            }
          });
      },
      onEnd: (rsp: http.IncomingMessage) => {
        statusCode = rsp.statusCode ? rsp.statusCode : -1;
      },
      onError: (_err: Error) => {
        statusCode = -1;
      },
      onTimeout: () => {
        statusCode = -1;
      },
    };
    const req: HttpRequest = {
      args: {
        host: 'kimi.moonshot.cn',
        path: `/api/chat/${this.chat_id}/completion/stream`,
        method: 'POST',
        protocol: 'https:',
        headers: this.headers,
        timeout: 1000,
      },
      data: JSON.stringify({
        messages: [
          {
            role: 'user',
            content: text,
          },
        ],
        refs: [],
        user_search: true,
      }),
    };
    await sendHttpRequestWithCallback(req, cb);
    if (statusCode == 401) {
      if ((await this.getAccessToken()) != 200) {
        return -1;
      }
      await sendHttpRequestWithCallback(req, cb);
    }
  }

  public async debug() {
    console.log(await this.getAccessToken());
    console.log(await this.createChatID());
    console.log(this.chat_id);

    const req: HttpRequest = {
      args: {
        host: 'kimi.moonshot.cn',
        path: `/api/chat/${this.chat_id}/completion/stream`,
        method: 'POST',
        protocol: 'https:',
        headers: this.headers,
      },
      data: JSON.stringify({
        messages: [
          {
            role: 'user',
            content: '你是翻译员，请翻译成中文：I has a pen',
          },
        ],
        refs: [],
        user_search: true,
      }),
    };
    sendHttpRequestWithCallback(req, {
      onData: (chunk: Buffer) => {
        console.log(chunk.toString());
      },
    });
  }
}

export const kimiChat = new KimiChat(
  process.env.MY_KIMI_REFRESH_TOKEN ? process.env.MY_KIMI_REFRESH_TOKEN : '',
);
