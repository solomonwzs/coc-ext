import { window, workspace, Position } from 'coc.nvim';
import { logger } from '../utils/logger';
import { CocExtError } from '../utils/common';
import { BaseChatChannel, ChatItem } from './base';

function sleepMs(ms: number) {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

class DebugChat extends BaseChatChannel {
  constructor() {
    super();
  }

  public getChatName(): string {
    return 'Debug';
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

    await sleepMs(2000);
    for (let i = 0; i < 50; ++i) {
      this.append(`=> ${i}`);
      await sleepMs(30);
    }
  }
}

export const debugChat = new DebugChat();
