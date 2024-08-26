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

  constructor(private readonly api_key: string) {
    super();
    this.headers = {
      Authorization: `Bearer ${this.api_key}`,
      'Content-Type': 'application/json',
    };
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
            content: 'How to close vim',
          },
        ],
        model: 'llama-3.1-70b-versatile',
      }),
    };
    const resp = await sendHttpRequest(req);
    if (resp.error) {
      logger.error(resp.error.message);
      return null;
    }
    if (resp.statusCode != 200 || !resp.body || resp.body.length == 0) {
      logger.error(`groq, status: ${resp.statusCode}`);
      return null;
    }
    const obj = JSON.parse(resp.body.toString());
    logger.debug(obj);
  }
}

export const groqChat = new GroqChat(
  process.env.MY_GROQ_API_KEY ? process.env.MY_GROQ_API_KEY : '',
);
