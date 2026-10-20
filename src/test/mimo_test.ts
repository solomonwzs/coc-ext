// offline end-to-end test for MimoChat:
// a local https server replays the real SSE stream captured from
// aistudio.xiaomimimo.com (see doc/aistudio-xiaomimimo-reverse.md),
// then MimoChat.chat() / getChatList() / createChatId() / delSession()
// run against it with a mock channel.
//
// run: npm run build_test && node dist/test.js

import fs from 'fs';
import os from 'os';
import path from 'path';
import https from 'https';
import http from 'http';
import { MimoChat, MimoAuth, globalMimo } from '../lib/ai/mimo';
import { BaseChatChannel, ChatRefItem } from '../lib/ai/base';
import { BaseLogger } from '../lib/comm/logger';

const TEST_PORT = 18443;

// self-signed cert for the local test server (generated for 127.0.0.1)
const TEST_CERT = fs.readFileSync(path.join(__dirname, '../testdata/test-cert.pem'));
const TEST_KEY = fs.readFileSync(path.join(__dirname, '../testdata/test-key.pem'));

class MockChannel extends BaseChatChannel {
  public output: string[] = [];
  public popupContent: string[] = [];
  public searchLines: string[][] = [];
  public currentRef: { refText: string; segmentId: string } | null = null;

  public async show() {}
  public async hide() {}
  public async beforeChat() {}
  public async afterChat() {}

  public append(text: string) {
    this.output.push(text);
  }

  public appendLine(text: string) {
    this.output.push(text + '\n');
  }

  public appendUserInput(datetime: string, text: string) {
    this.output.push(`\n>> ${datetime}\n`);
    for (const line of text.split('\n')) {
      this.output.push(`>> ${line}\n`);
    }
  }

  public clear() {
    this.output = [];
  }

  public flush() {}

  public async getCurrentRef() {
    return this.currentRef;
  }

  public async openSearchWindow(lines: string[]) {
    this.searchLines.push(lines);
  }

  public async popup(content: string, _title?: string, _filetype?: string) {
    this.popupContent.push(content);
  }
}

class MockLogger extends BaseLogger {
  public logs: string[] = [];

  protected logLevel(level: string, value: any): void {
    this.logs.push(`${level}: ${JSON.stringify(value)}`);
  }
}

interface RecordedRequest {
  method?: string;
  url?: string;
  headers: any;
  body: string;
}

function readBody(req: http.IncomingMessage): Promise<string> {
  return new Promise((resolve) => {
    const chunks: Buffer[] = [];
    req.on('data', (c: Buffer) => chunks.push(c));
    req.on('end', () => resolve(Buffer.concat(chunks).toString()));
  });
}

// the exact SSE stream captured from POST /open-apis/react/chat
// (reconstructed from a real webSearchStatus=auto conversation)
function capturedSseStream(): Buffer {
  const events: string[] = [];
  const push = (ev: string, data: string) => {
    events.push(`id:602002643e5ce05026de3013f74978c7\nevent:${ev}\ndata:${data}\n`);
  };
  push('dialogId', '{"content":"31905223"}');
  push('message', '{"messageType":"assistant","reasoningContent":"The user is"}');
  push('message', '{"messageType":"assistant","reasoningContent":" asking me"}');
  push('message', '{"messageType":"assistant","content":"我先检索一下。"}');
  push(
    'message',
    JSON.stringify({
      messageType: 'assistant',
      toolCalls: [
        {
          arguments: '{"queries":["RTX GTX 区别"]}',
          id: 'call_ecad4e1137674311a5881237',
          name: 'search',
          type: 'function',
        },
      ],
    }),
  );
  push(
    'message',
    JSON.stringify({
      messageType: 'tool',
      responses: [
        {
          id: 'call_ecad4e1137674311a5881237',
          name: 'search',
          responseData: JSON.stringify([
            {
              url: 'https://example.com/rtx',
              title: 'RTX 与 GTX 区别',
              site: '示例站',
              summary: 'RTX 有光追核心。',
              index: 1,
            },
            {
              url: 'https://example.com/gtx',
              title: 'GTX 停产',
              site: '示例站2',
              summary: 'GTX 已停产。',
              index: 2,
            },
          ]),
        },
      ],
    }),
  );
  push('message', '{"messageType":"assistant","reasoningContent":"Let me think."}');
  push(
    'message',
    '{"messageType":"assistant","content":"RTX 有光追 [citation:1]，GTX 已停产 [citation:2]。"}',
  );
  push('usage', '{"promptTokens":3752,"completionTokens":56,"totalTokens":3808}');
  push('finish', '{"content":"[DONE]"}');
  return Buffer.from(events.join('\n'));
}

export async function mimoTest() {
  process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';

  const requests: RecordedRequest[] = [];
  const sseBytes = capturedSseStream();

  const server = https.createServer({ key: TEST_KEY, cert: TEST_CERT }, (req, res) => {
    readBody(req).then((body) => {
      requests.push({
        method: req.method,
        url: req.url,
        headers: req.headers,
        body,
      });

      if (req.url?.startsWith('/open-apis/react/chat')) {
        // stream the SSE bytes in small uneven chunks to stress the decoder
        res.writeHead(200, { 'content-type': 'text/event-stream' });
        let pos = 0;
        const step = () => {
          if (pos >= sseBytes.length) {
            res.end();
            return;
          }
          const size = 7;
          res.write(sseBytes.subarray(pos, pos + size));
          pos += size;
          setTimeout(step, 1);
        };
        step();
      } else if (req.url?.startsWith('/open-apis/chat/conversation/list')) {
        res.writeHead(200, { 'content-type': 'application/json' });
        res.end(
          JSON.stringify({
            code: 0,
            msg: '成功',
            data: {
              total: 1,
              pageNum: 1,
              dataList: [
                {
                  id: 9211206,
                  title: 'Vim退出方法大全',
                  conversationId: 'c90b68341131e4f0dc533884f2a709a3',
                  updateTime: '2026-09-22 11:22:50',
                  type: 'chat',
                },
              ],
            },
          })
        );
      } else if (req.url?.startsWith('/open-apis/chat/conversation/save')) {
        res.writeHead(200, { 'content-type': 'application/json' });
        res.end(
          JSON.stringify({
            code: 0,
            msg: '成功',
            data: { id: 9776342, title: 'New conversation' },
          })
        );
      } else if (req.url?.startsWith('/open-apis/chat/conversation/genTitle')) {
        res.writeHead(200, { 'content-type': 'application/json' });
        res.end(JSON.stringify({ code: 0, msg: '成功', data: 'AI智能助手介绍' }));
      } else if (req.url?.startsWith('/open-apis/chat/conversation/delete')) {
        res.writeHead(200, { 'content-type': 'application/json' });
        res.end(JSON.stringify({ code: 0, msg: '成功', data: null }));
      } else if (req.url?.startsWith('/open-apis/react/dialog/list')) {
        res.writeHead(200, { 'content-type': 'application/json' });
        res.end(
          JSON.stringify({
            code: 0,
            msg: '成功',
            data: [
              {
                conversationId: 'a119746bdf99b1e90b78f357bcf9f60e',
                msgId: '58fbbe5ebb0e4909d03e2f8287e0e590',
                inputInfo: { query: '如何关闭 vim', multiMedias: [] },
                createTime: '2026-09-22 11:22:23',
                updateTime: '2026-09-22 11:22:49',
                dialogLogDetailList: [
                  {
                    id: 30109200,
                    result: [
                      { messageType: 'assistant', reasoningContent: 'Let me think.' },
                      {
                        messageType: 'assistant',
                        toolCalls: [
                          {
                            arguments: '{"queries":["vim 退出"]}',
                            id: 'call_history123',
                            name: 'search',
                            type: 'function',
                          },
                        ],
                      },
                      {
                        messageType: 'tool',
                        responses: [
                          {
                            id: 'call_history123',
                            name: 'search',
                            responseData: JSON.stringify([
                              {
                                url: 'https://example.com/rtx',
                                title: 'RTX 与 GTX 区别',
                                site: '示例站',
                                summary: 'RTX 有光追核心。',
                                index: 1,
                              },
                              {
                                url: 'https://example.com/gtx',
                                title: 'GTX 停产',
                                site: '示例站2',
                                summary: 'GTX 已停产。',
                                index: 2,
                              },
                            ]),
                          },
                        ],
                      },
                      { messageType: 'assistant', content: '按 :q 退出 [citation:1]' },
                    ],
                    dialogStatus: 'success',
                    model: 'mimo-v2.6-pro',
                    usage: { promptTokens: 2229, completionTokens: 602 },
                  },
                ],
              },
            ],
          })
        );
      } else {
        res.writeHead(404);
        res.end('{}');
      }
    });
  });

  await new Promise<void>((resolve) => server.listen(TEST_PORT, '127.0.0.1', resolve));

  // redirect the client to the local test server
  const savedHost = globalMimo.host;
  const savedPort = globalMimo.port;
  globalMimo.host = '127.0.0.1';
  globalMimo.port = TEST_PORT;

  const auth: MimoAuth = {
    serviceToken: 'B2xl2Ue8E3UqVP/tTGOSJxdsln/PSoAa',
    userId: '1504903118',
    ph: 'b5OyYDPaoyV/atkY+v7ukw==',
  };
  const chan = new MockChannel();
  const logger = new MockLogger();
  const chat = new MimoChat(auth, chan, logger);

  let failed = 0;
  const check = (name: string, ok: boolean) => {
    console.log(`${ok ? 'PASS' : 'FAIL'} ${name}`);
    if (!ok) {
      failed += 1;
    }
  };

  // ---- getChatList ----
  {
    const list = await chat.getChatList();
    check(
      'getChatList returns 1 item',
      !(list instanceof Error) && list.length == 1 && list[0].chatId == 'c90b68341131e4f0dc533884f2a709a3'
    );
    const req = requests.find((r) => r.url?.includes('conversation/list'));
    check(
      'conversation/list carries ph query param',
      req?.url == '/open-apis/chat/conversation/list?xiaomichatbot_ph=b5OyYDPaoyV%2FatkY%2Bv7ukw%3D%3D'
    );
    check(
      'conversation/list carries cookie auth',
      String(req?.headers['cookie']).includes('xiaomichatbot_serviceToken="B2xl2Ue8E3UqVP/tTGOSJxdsln/PSoAa"') &&
        String(req?.headers['cookie']).includes('userId=1504903118')
    );
  }

  // ---- createChatId ----
  let newId = '';
  {
    const id = await chat.createChatId('测试会话');
    check('createChatId returns 32-hex id', !(id instanceof Error) && /^[0-9a-f]{32}$/.test(id));
    if (!(id instanceof Error)) {
      newId = id;
    }
    const req = requests.find((r) => r.url?.includes('conversation/save'));
    const body = JSON.parse(req?.body ? req.body : '{}');
    check('conversation/save body', body.conversationId == newId && body.title == '测试会话' && body.type == 'chat');
  }

  // ---- chat (first message, SSE stream) ----
  chat.setCurrentChatId(newId);
  await chat.chat('你好,请用一句话介绍你自己');
  {
    const text = chan.output.join('');
    check('stream prints dialog id', text.includes('>> id:31905223'));
    check('stream prints thinking block', text.includes('---') && text.includes('The user is asking me'));
    check(
      'stream prints content with citation markers',
      text.includes('RTX 有光追 [citation:1]，GTX 已停产 [citation:2]。'),
    );
    check(
      'stream prints search markers',
      text.includes(' [searching...]') && text.includes(' [search result (2)]'),
    );
    check('stream ends with (END)', text.includes('(END)'));
    check('currentMsgid updated', (chat as any).currentMsgid == '31905223');

    const req = requests.find((r) => r.url?.includes('react/chat'));
    check(
      'react/chat carries ph param',
      req?.url?.includes('xiaomichatbot_ph=b5OyYDPaoyV%2FatkY%2Bv7ukw%3D%3D') == true
    );
    check('react/chat has traceparent', typeof req?.headers['traceparent'] == 'string');
    const body = JSON.parse(req?.body ? req.body : '{}');
    check(
      'react/chat body',
      body.conversationId == newId &&
        body.query == '你好,请用一句话介绍你自己' &&
        body.isEditedQuery == false &&
        Array.isArray(body.multiMedias) &&
        body.multiMedias.length == 0
    );
    check(
      'react/chat modelConfig',
      body.modelConfig.model == 'mimo-v2.6-pro' && body.modelConfig.enableThinking == true
    );
    check('first message has no previousDialogueId', body.previousDialogueId == undefined);
  }

  // ---- chat (second message, previousDialogueId) ----
  await chat.chat('第二条消息');
  {
    const req = requests.filter((r) => r.url?.includes('react/chat')).pop();
    const body = JSON.parse(req?.body ? req.body : '{}');
    check('second message has previousDialogueId', body.previousDialogueId == 31905223);
  }

  // ---- genTitle called after first exchange ----
  {
    const req = requests.find((r) => r.url?.includes('genTitle'));
    const body = JSON.parse(req?.body ? req.body : '{}');
    check(
      'genTitle called with query + answer',
      req != undefined && body.conversationId == newId && String(body.content).includes('你好,请用一句话介绍你自己')
    );
  }

  // ---- showHistoryMessages ----
  {
    chan.clear();
    chat.setCurrentChatId('c90b68341131e4f0dc533884f2a709a3');
    const err = await chat.showHistoryMessages();
    check('showHistoryMessages ok', err == null);
    const text = chan.output.join('');
    check('history renders user query', text.includes('如何关闭 vim'));
    check('history renders dialog id', text.includes('>> id:30109200'));
    check(
      'history renders thinking + content',
      text.includes('Let me think.') && text.includes('按 :q 退出'),
    );
    check(
      'history renders search markers',
      text.includes(' [searching...]') && text.includes(' [search result (2)]'),
    );
  }

  // ---- showItem: cursor on [citation:N] ----
  {
    chan.currentRef = { refText: '[citation:2]', segmentId: '30109200' };
    await chat.showItem();
    check(
      'showItem pops up cited source',
      chan.popupContent.length == 1 &&
        chan.popupContent[0].includes('GTX 停产') &&
        chan.popupContent[0].includes('https://example.com/gtx'),
    );
  }

  // ---- showItem: cursor on [search result (N)] ----
  {
    chan.currentRef = { refText: '[search result (2)]', segmentId: '30109200' };
    await chat.showItem();
    check(
      'showItem opens search result window',
      chan.searchLines.length == 1 &&
        chan.searchLines[0].join('\n').includes('RTX 与 GTX 区别') &&
        chan.searchLines[0].join('\n').includes('# 2 - GTX 停产'),
    );
  }

  // ---- showItem: cursor elsewhere ----
  {
    chan.currentRef = null;
    await chat.showItem();
    check(
      'showItem no-op without ref',
      chan.popupContent.length == 1 && chan.searchLines.length == 1,
    );
  }

  // ---- delSession ----
  {
    const err = await chat.delSession(newId);
    check('delSession ok', err == null);
    const req = requests.find((r) => r.url?.includes('conversation/delete'));
    check('delete body is id array', req != undefined && JSON.parse(req.body)[0] == newId);
  }

  globalMimo.host = savedHost;
  globalMimo.port = savedPort;
  server.close();

  // clean up cache files written by the test
  try {
    const cacheDir = `${os.homedir()}/.cache/chat_Mimo`;
    fs.unlinkSync(path.join(cacheDir, `${newId}-31905223-search.json`));
    fs.unlinkSync(
      path.join(cacheDir, 'c90b68341131e4f0dc533884f2a709a3-30109200-search.json'),
    );
  } catch (e) {
    console.log('cache cleanup skipped:', String(e));
  }

  console.log(failed == 0 ? '\nmimoTest all passed' : `\nmimoTest FAILED: ${failed}`);
}
