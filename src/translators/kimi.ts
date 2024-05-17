import { ITranslation, createTranslation } from './base';
import { sendHttpRequest, HttpRequest } from '../utils/http';
import http from 'http';

export default class KimiChat {
  private refresh_token: string;
  private chat_id: string;
  private headers: http.OutgoingHttpHeaders;

  constructor() {
    this.refresh_token = process.env.MY_KIMI_REFRESH_TOKEN
      ? process.env.MY_KIMI_REFRESH_TOKEN
      : '';

    this.chat_id = '';

    const trafficID = Array.from({ length: 20 }, () =>
      Math.floor(Math.random() * 36).toString(36),
    ).join('');
    this.headers = {
      'Content-Type': 'application/json',
      'User-Agent':
        'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.77 Safari/537.36 Edg/91.0.864.41',
      Origin: 'https://kimi.moonshot.cn',
      Referer: 'https://kimi.moonshot.cn/',
      'X-Traffic-Id': trafficID,
    };
  }

  public async getAccessToken(): Promise<number> {
    this.headers['Authorization'] = `Bearer ${this.refresh_token}`;
    const refresh_req: HttpRequest = {
      args: {
        host: 'kimi.moonshot.cn',
        path: '/api/auth/token/refresh',
        method: 'GET',
        protocol: 'https:',
        headers: this.headers,
      },
    };
    const resp = await sendHttpRequest(refresh_req);
    if (resp.statusCode == 200 && resp.body) {
      const obj = JSON.parse(resp.body.toString());
      this.headers['Authorization'] = `Bearer ${obj['access_token']}`;
    }
    return resp.statusCode ? resp.statusCode : -1;
  }

  public async getChatID() {
    const test_req: HttpRequest = {
      args: {
        host: 'kimi.moonshot.cn',
        path: '/api/chat',
        method: 'POST',
        protocol: 'https:',
        headers: this.headers,
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

  public async debug() {
    console.log(await this.getAccessToken());
    console.log(await this.getChatID());
    console.log(this.chat_id);
  }
}
