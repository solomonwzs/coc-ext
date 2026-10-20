// Xiaomi MiMo Studio (aistudio.xiaomimimo.com) web api client
// protocol reference: doc/aistudio-xiaomimimo-reverse.md
//
// auth: 3 cookies exported from a logged-in browser
//   - xiaomichatbot_serviceToken (HttpOnly)
//   - userId
//   - xiaomichatbot_ph (must also be copied into every POST query string)
//
// chat stream: SSE (text/event-stream), events:
//   dialogId / message / usage / finish / error / sensitive_query /
//   sensitive_title / web_search / doc / tip_ratio / tip_truncate
// message data carries {messageType, reasoningContent | content}; the
// messageType field may also carry 'error' / 'sensitive_*' markers

import http from 'http';
import {
  sendHttpRequest,
  sendHttpRequestWithCallback,
  HttpRequest,
  HttpRequestCallback,
} from '../comm/http';
import { ExtError } from '../comm/common';
import { BaseChat, BaseChatChannel, ChatItem, ChunkDecoder } from './base';
import { BaseLogger } from '../comm/logger';

export const globalMimo = {
  host: 'aistudio.xiaomimimo.com',
  port: 443,
  timeout: 10000,
  genTitleTimeout: 30000,
  model: 'mimo-v2.6-pro',
  enableThinking: true,
  webSearchStatus: 'disabled',
  pageSize: 50,
};

export interface MimoAuth {
  serviceToken: string;
  userId: string;
  ph: string;
}

interface MimoRespData<T = any> {
  code: number;
  msg: string;
  data: T;
  loginUrl?: string;
}

interface MimoConversationItem {
  id: number;
  title: string;
  conversationId: string;
  createTime?: string;
  updateTime?: string;
  type?: string;
}

interface MimoConversationListData {
  total?: number;
  pageNum?: number;
  dataList?: MimoConversationItem[];
}

interface MimoDialogResult {
  messageType?: string;
  reasoningContent?: string;
  content?: string;
}

interface MimoDialogDetail {
  id: number;
  result?: MimoDialogResult[];
  dialogStatus?: string;
  model?: string;
  modelConfig?: string;
  usage?: any;
  modelCostTime?: number;
  thinkingCostTime?: number;
  version?: string;
}

interface MimoDialog {
  conversationId: string;
  msgId: string;
  inputInfo?: {
    query?: string;
    multiMedias?: any[];
  };
  createTime?: string;
  updateTime?: string;
  dialogLogDetailList?: MimoDialogDetail[];
}

interface MimoStreamMessage {
  messageType?: string;
  reasoningContent?: string;
  content?: string;
}

// 32 hex chars, generated client-side (both msgId and conversationId)
function genId32(): string {
  let id = '';
  for (let i = 0; i < 16; ++i) {
    id += Math.floor(Math.random() * 256)
      .toString(16)
      .padStart(2, '0');
  }
  return id;
}

// W3C trace context header, generated per request by the web frontend
function genTraceparent(): string {
  return `00-${genId32()}-${genId32().substring(0, 16)}-01`;
}

export class MimoChat extends BaseChat {
  private currentMsgid: string;

  constructor(
    readonly auth: MimoAuth,
    chan: BaseChatChannel,
    protected logger: BaseLogger,
  ) {
    super(chan);
    this.currentMsgid = '';
  }

  public reset() {
    this.currentMsgid = '';
  }

  public getChatName(): string {
    return 'Mimo';
  }

  public setCurrentChatId(chatId: string) {
    super.setCurrentChatId(chatId);
    this.currentMsgid = '';
  }

  private getCookie(): string {
    const strip = (v: string) => v.replace(/^"|"$/g, '');
    return (
      `xiaomichatbot_serviceToken="${strip(this.auth.serviceToken)}"` +
      `; userId=${strip(this.auth.userId)}` +
      `; xiaomichatbot_ph="${strip(this.auth.ph)}"`
    );
  }

  // every open-apis POST must carry the ph cookie value as query param
  private withPh(path: string): string {
    const ph = encodeURIComponent(this.auth.ph.replace(/^"|"$/g, ''));
    const sep = path.includes('?') ? '&' : '?';
    return `${path}${sep}xiaomichatbot_ph=${ph}`;
  }

  private getHeader(): http.OutgoingHttpHeaders {
    return {
      'User-Agent': BaseChat.browserUserAgent,
      Accept: '*/*',
      'Content-Type': 'application/json',
      Origin: `https://${globalMimo.host}`,
      Referer: `https://${globalMimo.host}/`,
      'x-timezone': 'Asia/Shanghai',
      traceparent: genTraceparent(),
      cookie: this.getCookie(),
    };
  }

  private checkAuth(): ExtError | null {
    if (
      this.auth.serviceToken.length == 0 ||
      this.auth.ph.length == 0 ||
      this.auth.userId.length == 0
    ) {
      return new ExtError(
        ExtError.ERR_AUTH,
        '[Mimo] empty auth (serviceToken / userId / ph)',
      );
    }
    return null;
  }

  private async httpQuery<T>(
    method: string,
    path: string,
    d?: any,
    timeout: number = globalMimo.timeout,
  ): Promise<T | ExtError> {
    const authErr = this.checkAuth();
    if (authErr) {
      return authErr;
    }

    const req: HttpRequest = {
      args: {
        host: globalMimo.host,
        port: globalMimo.port,
        path: method == 'POST' ? this.withPh(path) : path,
        method,
        protocol: 'https:',
        headers: this.getHeader(),
        timeout,
      },
    };
    if (d !== undefined) {
      req.data = JSON.stringify(d);
    }

    const resp = await sendHttpRequest(req);
    let obj: MimoRespData | null = null;
    if (resp.body) {
      try {
        obj = JSON.parse(resp.body.toString()) as MimoRespData;
      } catch (e) {
        obj = null;
      }
    }
    if (resp.statusCode != 200 || !obj || obj.code != 0) {
      const isAuth =
        obj != null && (obj.code == 401 || obj.loginUrl != undefined);
      let msg =
        `[Mimo] statusCode: ${resp.statusCode}, ` +
        `code: ${obj ? obj.code : '-'}, msg: ${obj ? obj.msg : resp.error}, ` +
        `path: ${req.args.path}`;
      if (obj && obj.loginUrl) {
        msg += `, login: ${obj.loginUrl}`;
      }
      return new ExtError(isAuth ? ExtError.ERR_AUTH : ExtError.ERR_MIMO, msg);
    }
    return obj.data as T;
  }

  public async getChatList(): Promise<ChatItem[] | Error> {
    const data = await this.httpQuery<MimoConversationListData>(
      'POST',
      '/open-apis/chat/conversation/list',
      {
        pageInfo: { pageNum: 1, pageSize: globalMimo.pageSize },
      },
    );
    if (data instanceof Error) {
      return data;
    }

    const list: ChatItem[] = [];
    for (const item of data.dataList ?? []) {
      list.push({
        label: item.title,
        chatId: item.conversationId,
        description: item.updateTime ? item.updateTime : '',
      });
    }
    return list;
  }

  public async createChatId(name: string): Promise<string | Error> {
    const authErr = this.checkAuth();
    if (authErr) {
      return authErr;
    }

    // conversationId is generated locally, then registered via save
    const id = genId32();
    const title = name.trim().length > 0 ? name.trim() : 'New conversation';
    const err = await this.httpQuery(
      'POST',
      '/open-apis/chat/conversation/save',
      {
        conversationId: id,
        title,
        type: 'chat',
      },
    );
    if (err instanceof Error) {
      return err;
    }
    this.currentMsgid = '';
    return id;
  }

  public async showHistoryMessages(): Promise<null | Error> {
    const data = await this.httpQuery<MimoDialog[]>(
      'POST',
      '/open-apis/react/dialog/list',
      {
        queryParam: { conversationId: this.chatId },
        pageInfo: { pageNum: 1, pageSize: globalMimo.pageSize },
      },
    );
    if (data instanceof Error) {
      return data;
    }

    this.currentMsgid = '';
    // render in chronological order (api may return newest first)
    const dialogs = [...data].sort((a, b) => {
      const ta = a.createTime ? a.createTime : '';
      const tb = b.createTime ? b.createTime : '';
      return ta < tb ? -1 : 1;
    });

    for (const dialog of dialogs) {
      if (dialog.inputInfo && dialog.inputInfo.query) {
        this.chan.appendUserInput(
          dialog.createTime ? dialog.createTime : '',
          dialog.inputInfo.query,
        );
      }

      for (const detail of dialog.dialogLogDetailList ?? []) {
        this.currentMsgid = String(detail.id);
        this.chan.appendLine(`>> id:${detail.id}\n`);
        if (detail.dialogStatus && detail.dialogStatus != 'success') {
          this.chan.appendLine(` ${detail.dialogStatus}\n`);
        }

        let inThinking = false;
        for (const r of detail.result ?? []) {
          if (r.reasoningContent) {
            if (!inThinking) {
              this.chan.appendLine('---');
              inThinking = true;
            }
            this.chan.appendLine(r.reasoningContent);
          } else if (r.content) {
            if (inThinking) {
              this.chan.appendLine('\n---\n');
              inThinking = false;
            }
            this.chan.appendLine(r.content);
          }
        }
        if (inThinking) {
          this.chan.appendLine('\n---\n');
        }
      }
    }
    return null;
  }

  public async showItem() {
    // no citation / search-result marker protocol (webSearch disabled)
  }

  private async genTitle(content: string): Promise<null | Error> {
    const data = await this.httpQuery<string>(
      'POST',
      '/open-apis/chat/conversation/genTitle',
      { conversationId: this.chatId, content },
      globalMimo.genTitleTimeout,
    );
    if (data instanceof Error) {
      return data;
    }
    this.logger.info(`[Mimo] genTitle: ${data}`);
    return null;
  }

  public async chat(prompt: string) {
    if (!this.chatId) {
      return;
    }
    const authErr = this.checkAuth();
    if (authErr) {
      this.logger.error(authErr);
      return;
    }
    this.chan.appendUserInput(new Date().toISOString(), prompt);

    // first message of this conversation (no dialog yet) => genTitle after
    const firstMsg = this.currentMsgid.length == 0;
    // previous assistant dialog id, for multi-turn continuity
    let previousDialogueId: number | undefined = parseInt(this.currentMsgid);
    if (!Number.isFinite(previousDialogueId) || previousDialogueId <= 0) {
      previousDialogueId = undefined;
    }

    const body: any = {
      msgId: genId32(),
      conversationId: this.chatId,
      query: prompt,
      isEditedQuery: false,
      modelConfig: {
        enableThinking: globalMimo.enableThinking,
        webSearchStatus: globalMimo.webSearchStatus,
        model: globalMimo.model,
      },
      multiMedias: [],
    };
    if (previousDialogueId !== undefined) {
      body.previousDialogueId = previousDialogueId;
    }

    const req: HttpRequest = {
      args: {
        host: globalMimo.host,
        port: globalMimo.port,
        path: this.withPh('/open-apis/react/chat'),
        method: 'POST',
        protocol: 'https:',
        headers: this.getHeader(),
      },
      data: JSON.stringify(body),
    };

    const decoder = new ChunkDecoder(this.logger);
    let event = '';
    let inThinking = false;
    let reasoningText = '';
    let contentText = '';
    let gotError = false;
    const errBuf: Buffer[] = [];

    const closeThinking = () => {
      if (!inThinking) {
        return;
      }
      this.chan.appendLine('\n\n---\n');
      inThinking = false;
    };

    const onStreamMessage = (data: string) => {
      let obj: MimoStreamMessage;
      try {
        obj = JSON.parse(data) as MimoStreamMessage;
      } catch (e) {
        this.logger.debug(data);
        return;
      }

      const msgType = obj.messageType ? obj.messageType : '';
      if (msgType == 'error') {
        closeThinking();
        gotError = true;
        this.chan.appendLine(` (ERROR) ${obj.content ? obj.content : ''}`);
        return;
      } else if (msgType == 'sensitive_query') {
        closeThinking();
        this.chan.appendLine(' (sensitive query) ');
        return;
      } else if (msgType == 'sensitive_title') {
        this.logger.debug(data);
        return;
      }

      if (typeof obj.reasoningContent == 'string') {
        if (!inThinking) {
          this.chan.appendLine('---');
          inThinking = true;
        }
        reasoningText += obj.reasoningContent;
        this.chan.append(obj.reasoningContent);
      }
      if (typeof obj.content == 'string') {
        closeThinking();
        contentText += obj.content;
        this.chan.append(obj.content);
      }
    };

    const parseData = (data: string): any | null => {
      try {
        return JSON.parse(data);
      } catch (e) {
        this.logger.debug(data);
        return null;
      }
    };

    // dispatch one sse data frame by its event name
    const dispatch = (ev: string, data: string) => {
      if (ev == 'message') {
        onStreamMessage(data);
      } else if (ev == 'dialogId') {
        const obj = parseData(data);
        const id = obj && obj.content != undefined ? String(obj.content) : '';
        if (id.length > 0) {
          this.currentMsgid = id;
          this.chan.appendLine(`>> id:${id}\n`);
        }
      } else if (ev == 'finish') {
        const obj = parseData(data);
        closeThinking();
        this.chan.appendLine('\n(END)');
        if (obj && obj.thinkingCostTime != undefined) {
          this.logger.debug(`[Mimo] thinkingCostTime: ${obj.thinkingCostTime}`);
        }
      } else if (ev == 'error') {
        const obj = parseData(data);
        closeThinking();
        gotError = true;
        this.chan.appendLine(
          ` (ERROR) ${obj && obj.content ? obj.content : data}`,
        );
      } else if (ev == 'sensitive_query') {
        closeThinking();
        this.chan.appendLine(' (sensitive query) ');
      } else {
        // usage / web_search / doc / tip_ratio / tip_truncate / sensitive_title
        this.logger.debug({ event: ev, data });
      }
    };

    const cb: HttpRequestCallback = {
      onData: (chunk: Buffer, rsp: http.IncomingMessage) => {
        if (rsp.statusCode != 200) {
          errBuf.push(chunk);
          return;
        }

        for (const m of decoder.decode(chunk)) {
          if (m.type == 'event') {
            event = m.data;
          } else if (m.type == 'data') {
            if (event.length > 0) {
              dispatch(event, m.data);
            }
          } else if (m.type != 'id') {
            this.logger.debug(m);
          }
        }
      },
      onError: (err: Error) => {
        this.chan.appendLine(' (ERROR) ');
        this.chan.appendLine(err.message);
      },
      onEnd: (rsp: http.IncomingMessage) => {
        if (rsp.statusCode != 200) {
          let msg = '';
          try {
            const obj = JSON.parse(Buffer.concat(errBuf).toString());
            if (obj.msg) {
              msg = obj.msg;
            }
            if (obj.loginUrl) {
              msg += ` (login: ${obj.loginUrl})`;
            }
          } catch (e) {
            msg = Buffer.concat(errBuf).toString().substring(0, 200);
          }
          closeThinking();
          this.chan.appendLine(` (ERROR) ${rsp.statusCode} ${msg}`);
        }
        this.logger.info(
          `[Mimo] chat statusCode: ${rsp.statusCode}, msg: ${rsp.statusMessage}`,
        );
      },
      onTimeout: () => {
        this.logger.error('[Mimo] timeout');
      },
    };
    await sendHttpRequestWithCallback(req, cb);
    closeThinking();
    // push any partial line still sitting in the channel buffer
    this.chan.flush();

    // web frontend generates the conversation title from the first exchange
    if (firstMsg && !gotError && contentText.length > 0) {
      const err = await this.genTitle(
        `${prompt} ${reasoningText}\n\n${contentText}`,
      );
      if (err instanceof Error) {
        this.logger.error(err);
      }
    }
  }

  public async delSession(chatId: string): Promise<null | Error> {
    // batch delete endpoint, body is the raw conversationId array
    const err = await this.httpQuery(
      'POST',
      '/open-apis/chat/conversation/delete',
      [chatId],
    );
    return err instanceof Error ? err : null;
  }
}
