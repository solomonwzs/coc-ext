import {
  sendHttpRequest,
  sendHttpRequestWithCallback,
  HttpRequest,
  HttpRequestCallback,
  HttpResponse,
} from '../utils/http';
import http from 'http';
import { BaseAiChannel } from './base';
import { logger } from '../utils/logger';
import { getEnvHttpProxy } from '../utils/common';

interface GroqResponse {
  id: string;
  obj: string;
  created: number;
  model: string;
  choices: {
    index: number;
    message: {
      role: string;
      content: string;
    };
    finish_reason: string;
  }[];
  usage: {
    queue_time: number;
    prompt_tokens: number;
    prompt_time: number;
    completion_tokens: number;
    completion_time: number;
    total_tokens: number;
    total_time: number;
  };
  system_fingerprint: string;
  x_groq: {
    id: string;
  };
}

class GroqChat extends BaseAiChannel {
  private headers: http.OutgoingHttpHeaders;
  private proxy: any;

  constructor(private readonly api_key: string) {
    super();
    this.headers = {
      Authorization: `Bearer ${this.api_key}`,
      'Content-Type': 'application/json',
    };
    const proxy_url = getEnvHttpProxy(true);
    this.proxy = proxy_url
      ? { host: proxy_url.hostname, port: parseInt(proxy_url.port) }
      : undefined;
    // this.tiktoken = new TiktokenCore('llama-3.1-70b-versatile');
  }

  public async show() {
    await this.showChannel('GroqChat', 'groqchat');
  }

  public async debug() {
    const req: HttpRequest = {
      args: {
        host: 'api.groq.com',
        path: '/openai/v1/chat/completions',
        method: 'POST',
        protocol: 'https:',
        headers: this.headers,
      },
      data: JSON.stringify({
        messages: [
          {
            role: 'user',
            content: 'what is tiktoken?',
          },
        ],
        model: 'llama-3.1-70b-versatile',
      }),
      proxy: this.proxy,
    };
    const resp = await sendHttpRequest(req);
    if (resp.error) {
      logger.error(`query fail, ${resp.error.message}`);
      return null;
    }
    if (resp.statusCode != 200 || !resp.body || resp.body.length == 0) {
      logger.error(`groq, status: ${resp.statusCode}`);
      return null;
    }
    const obj = JSON.parse(resp.body.toString()) as GroqResponse;
    logger.debug(obj);
  }
}

export const groqChat = new GroqChat(
  process.env.MY_GROQ_API_KEY ? process.env.MY_GROQ_API_KEY : '',
);
