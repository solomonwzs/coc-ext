import { CocExtError } from '../utils/common';
import http from 'http';
import {
  sendHttpRequest,
  sendHttpRequestWithCallback,
  HttpRequest,
  HttpRequestCallback,
} from '../utils/http';
import { BaseChatChannel, ChatItem, getCurrentRef } from './base';
import { logger } from '../utils/logger';
import { fsAccess, fsReadFile } from '../utils/file';
import { simpleHttpDownloadFile } from '../utils/http';
import fs from 'fs';
import { getcfg } from '../utils/config';
import { CocExtAIChatConfig } from '../utils/types';
import { popup, ScratchWindow } from '../utils/helper';

interface IDictionary {
  [index: string]: string;
}

interface ChatMessage {
  role: string;
  content: string;
}

interface ChatRecords {
  model: string;
  messages: ChatMessage[];
  temperature: number;
  top_p: number;
  stream: boolean;
}

class CommonChat extends BaseChatChannel {
  private headers: http.OutgoingHttpHeaders;
  private chatRecords: ChatRecords;

  constructor(
    readonly endpoint: string,
    authInfo: string,
  ) {
    super();

    let auth: Record<string, string> = JSON.parse(authInfo);
    this.headers = {};
    for (let key in auth) {
      this.headers[key] = auth[key];
    }

    this.chatRecords = {
      model: '',
      messages: [],
      temperature: 1,
      top_p: 0.95,
      stream: true,
    };
  }

  public reset(): void {
    this.chatRecords.messages = [];
  }

  public getChatName(): string {
    return 'Common';
  }

  public async getChatList(): Promise<ChatItem[] | Error> {
    return [];
  }

  public async showHistoryMessages(): Promise<null | Error> {
    return null;
  }

  public async showItem(): Promise<void> {}

  public async chat(text: string): Promise<void> {
  }

  public async delSession(_chatId: string): Promise<null | Error> {
    return null;
  }
}
