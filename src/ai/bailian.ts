import { BaseChatChannel, ChatItem } from './base';
import http from 'http';
import {
  sendHttpRequestWithCallback,
  HttpRequest,
  HttpRequestCallback,
} from '../utils/http';
import { logger } from '../utils/logger';

interface BailianCompletion {
  choices: {
    delta: { content: string; reasoning_content: string };
    finish_reason: string | undefined;
    index: number;
    logprobs: string | undefined;
  }[];
  object: string;
  usage: string | undefined;
  created: number;
  system_fingerprint: string | undefined;
  model: string;
  id: string;
}

class BailianChat extends BaseChatChannel {
  private api_key: string;

  constructor(public readonly key: string) {
    super();
    this.api_key = key;
  }

  public getChatName(): string {
    return 'Bailian';
  }

  public async getChatList(): Promise<ChatItem[] | Error> {
    return [];
  }

  public async createChatId(name: string): Promise<string | Error> {
    return name;
  }

  public async showHistoryMessages(): Promise<null | Error> {
    return null;
  }

  public async chat(prompt: string): Promise<void> {
    this.appendUserInput(new Date().toISOString(), prompt);
    this.append('');

    const req: HttpRequest = {
      args: {
        host: 'dashscope.aliyuncs.com',
        path: '/compatible-mode/v1/chat/completions',
        method: 'POST',
        protocol: 'https:',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${this.api_key}`,
        },
      },
      data: JSON.stringify({
        model: 'deepseek-v3',
        messages: [
          {
            role: 'user',
            content: prompt,
          },
        ],
        stream: true,
        stream_options: {
          include_usage: true,
        },
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

              const data = JSON.parse(line.slice(5)) as BailianCompletion;
              if (data.choices.length > 0) {
                for (const choice of data.choices) {
                  if (choice.delta.content) {
                    this.append(choice.delta.content, false);
                  } else if (choice.delta.reasoning_content) {
                    this.append(choice.delta.reasoning_content, false);
                  }
                }
              }
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

export const bailianChat = new BailianChat(
  process.env.MY_AI_BAILIAN_KEY ? process.env.MY_AI_BAILIAN_KEY : '',
);
