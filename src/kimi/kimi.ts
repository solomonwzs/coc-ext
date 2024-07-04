import {
  sendHttpRequest,
  sendHttpRequestWithCallback,
  HttpRequest,
  HttpRequestCallback,
} from '../utils/http';
import http from 'http';
import { OutputChannel, window, workspace } from 'coc.nvim';
// import { logger } from '../utils/logger';

export interface KimiChatItem {
  id: string;
  name: string;
  created_at: string;
  updated_at: string;
  status: string;
  type: string;
}

export interface KimiChatScrollItem {
  id: string;
  context_type: string;
  role: string;
  created_at: string;
  content: string;
}

class KimiChat {
  private rtoken: string;
  private chat_id: string;
  private headers: http.OutgoingHttpHeaders;
  private channel: OutputChannel | null;
  private name: string;
  private winid: number;

  constructor(public readonly refresh_token: string) {
    this.rtoken = refresh_token;
    this.chat_id = '';
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
    };
    this.channel = null;
    this.name = '';
    this.winid = -1;
  }

  public async openAutoScroll() {
    let { nvim } = workspace;
    this.winid = await nvim.call('bufwinid', `Kimi-${this.chat_id}`);
  }

  public closeAutoScroll() {
    this.winid = -1;
  }

  private getHeaders() {
    this.headers['X-Traffic-Id'] = Array.from({ length: 20 }, () =>
      Math.floor(Math.random() * 36).toString(36),
    ).join('');
    return this.headers;
  }

  public async append(text: string, newline: boolean = true) {
    if (this.channel) {
    } else if (this.chat_id && this.name) {
      this.channel = window.createOutputChannel(`Kimi-${this.chat_id}`);
    } else {
      return;
    }
    if (newline) {
      this.channel.appendLine(text);
    } else {
      this.channel.append(text);
    }

    if (this.winid != -1) {
      let { nvim } = workspace;
      await nvim.call('win_execute', [this.winid, 'norm G']);
    }
  }

  public async appendUserInput(datetime: string, text: string) {
    await this.append(`\n>> ${datetime}`);
    let lines = text.split('\n');
    for (const i of lines) {
      await this.append(`>> ${i}`);
    }
  }

  public async show() {
    if (this.channel) {
    } else if (this.chat_id && this.name) {
      this.channel = window.createOutputChannel(`Kimi-${this.chat_id}`);
    } else {
      return;
    }

    let { nvim } = workspace;
    let winid = await nvim.call('bufwinid', `Kimi-${this.chat_id}`);
    if (winid == -1) {
      this.channel.show();
      winid = await nvim.call('bufwinid', `Kimi-${this.chat_id}`);
      await nvim.call('coc#compat#execute', [winid, 'setl wrap']);
      await nvim.call('win_execute', [winid, 'set ft=kimichat']);
    } else {
      await nvim.call('win_gotoid', [winid]);
    }
    await nvim.call('win_execute', [winid, 'norm G']);
  }

  public async getAccessToken(): Promise<number> {
    this.headers['Authorization'] = `Bearer ${this.rtoken}`;
    const refresh_req: HttpRequest = {
      args: {
        host: 'kimi.moonshot.cn',
        path: '/api/auth/token/refresh',
        method: 'GET',
        protocol: 'https:',
        headers: this.getHeaders(),
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

  public getChatId(): string {
    return this.chat_id;
  }

  public setChatIdAndName(chat_id: string, name: string) {
    this.chat_id = chat_id;
    this.name = name;
  }

  public async createChatId(name: string) {
    const test_req: HttpRequest = {
      args: {
        host: 'kimi.moonshot.cn',
        path: '/api/chat',
        method: 'POST',
        protocol: 'https:',
        headers: this.getHeaders(),
        timeout: 1000,
      },
      data: JSON.stringify({ name, is_example: false }),
    };
    const resp = await sendHttpRequest(test_req);
    if (resp.statusCode == 200 && resp.body) {
      const obj = JSON.parse(resp.body.toString());
      this.chat_id = obj['id'];
      this.name = name;
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
        headers: this.getHeaders(),
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

  public async chatScroll(
    chat_id: string,
  ): Promise<KimiChatScrollItem[] | Error> {
    if (
      !this.headers['Authorization'] &&
      (await this.getAccessToken()) != 200
    ) {
      return { name: 'ERR_AUTH_FAIL', message: 'auth fail' };
    }

    const req: HttpRequest = {
      args: {
        host: 'kimi.moonshot.cn',
        path: `/api/chat/${chat_id}/segment/scroll`,
        method: 'POST',
        protocol: 'https:',
        headers: this.getHeaders(),
        timeout: 1000,
      },
      data: JSON.stringify({ last: 50 }),
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
    if (this.chat_id.length == 0) {
      return;
    }
    await this.appendUserInput(new Date().toISOString(), text);

    // for (let i = 0; i < 10; i++) {
    //   await new Promise((resolve) => {
    //     setTimeout(resolve, 500);
    //   });
    //   await this.append(text);
    // }

    let statusCode = -1;
    const cb: HttpRequestCallback = {
      onData: async (chunk: Buffer) => {
        chunk
          .toString()
          .split('\n')
          .forEach(async (line: string) => {
            if (line.length == 0) {
              return;
            }
            const data = JSON.parse(line.slice(5));
            if (data['event'] == 'cmpl') {
              await this.append(data['text'], false);
            } else if (data['event'] == 'all_done') {
              await this.append(' (END)');
            }
          });
      },
      onEnd: (rsp: http.IncomingMessage) => {
        statusCode = rsp.statusCode ? rsp.statusCode : -1;
      },
      onError: async (err: Error) => {
        await this.append(' (ERROR) ');
        await this.append(JSON.stringify(err));
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
        headers: this.getHeaders(),
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
        return;
      }
      await sendHttpRequestWithCallback(req, cb);
    }
  }

  public async debug() {
    console.log(await this.getAccessToken());
    console.log(await this.createChatId('Kimi'));
    console.log(this.chat_id);

    const req: HttpRequest = {
      args: {
        host: 'kimi.moonshot.cn',
        path: `/api/chat/${this.chat_id}/completion/stream`,
        method: 'POST',
        protocol: 'https:',
        headers: this.getHeaders(),
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
