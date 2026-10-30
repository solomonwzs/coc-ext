import fs from 'fs';
import path from 'path';
import http from 'http';
import https from 'https';
import { DeepseekChat, globalDeepseek } from '../lib/ai/deepseek';
import { BaseChatChannel } from '../lib/ai/base';
import { BaseLogger } from '../lib/comm/logger';
import { fsAccess, fsReadFile } from '../lib/comm/file';
import { ExtError } from '../lib/comm/common';
import { simpleHttpDownloadFile } from '../lib/comm/http';

class DeepseekWasm {
  private memory: WebAssembly.Memory;
  private addToStack: (delta: number) => number;
  private alloc: (size: number, align: number) => number;
  private wasmSolve: (
    retptr: number,
    ptrChallenge: number,
    lenChallenge: number,
    ptrPrefix: number,
    lenPrefix: number,
    difficulty: number,
  ) => void;

  constructor(public readonly src: WebAssembly.WebAssemblyInstantiatedSource) {
    let { instance } = src;
    let exports = instance.exports;

    this.memory = exports.memory as WebAssembly.Memory;
    this.addToStack = exports.__wbindgen_add_to_stack_pointer as (
      delta: number,
    ) => number;
    this.alloc = exports.__wbindgen_export_0 as (
      size: number,
      align: number,
    ) => number;
    this.wasmSolve = exports.wasm_solve as (
      retptr: number,
      ptrChallenge: number,
      lenChallenge: number,
      ptrPrefix: number,
      lenPrefix: number,
      difficulty: number,
    ) => void;
  }

  private writeMemory(offset: number, data: ArrayLike<number>): void {
    let view = new Uint8Array(this.memory.buffer);
    view.set(data, offset);
  }

  private readMemory(offset: number, size: number): Uint8Array {
    let view = new Uint8Array(this.memory.buffer);
    return view.slice(offset, offset + size);
  }

  private encodeString(text: string): [number, number] {
    let data = Buffer.from(text);
    let ptr = this.alloc(data.length, 1);
    this.writeMemory(ptr, data);
    return [ptr, data.length];
  }

  public computePowAnswer(
    challenge: string,
    salt: string,
    difficulty: number,
    expire_at: number,
  ): number | Error {
    let retptr = this.addToStack(-16);
    let [ptrChallenge, lenChallenge] = this.encodeString(challenge);
    let [ptrPrefix, lenPrefix] = this.encodeString(`${salt}_${expire_at}_`);
    this.wasmSolve(
      retptr,
      ptrChallenge,
      lenChallenge,
      ptrPrefix,
      lenPrefix,
      difficulty,
    );

    const statusBytes = this.readMemory(retptr, 4);
    if (statusBytes.length !== 4) {
      this.addToStack(16);
      return new ExtError(ExtError.ERR_DEEPSEEK, 'read status fail');
    }
    let status = new DataView(statusBytes.buffer).getInt32(0, true);

    let valueBytes = this.readMemory(retptr + 8, 8);
    if (valueBytes.length !== 8) {
      this.addToStack(16);
      return new ExtError(ExtError.ERR_DEEPSEEK, 'read value fail');
    }
    let value = new DataView(valueBytes.buffer).getFloat64(0, true);

    this.addToStack(16);
    if (status !== 1) {
      return new ExtError(ExtError.ERR_DEEPSEEK, 'computePowAnswer fail');
    }
    return Math.floor(value);
  }
}

async function getWasm(): Promise<DeepseekWasm | Error> {
  const wasmPath = '/tmp/deepseek_sha3.wasm';
  const downloadUrl =
    'https://chat.deepseek.com/static/sha3_wasm_bg.7b9ca65ddd.wasm';
  if ((await fsAccess(wasmPath, fs.constants.R_OK)) != null) {
    if ((await simpleHttpDownloadFile(downloadUrl, wasmPath)) == -1) {
      return new ExtError(
        ExtError.ERR_DEEPSEEK,
        '[Deepseek] get wasm fail',
      );
    }
  }

  let wasmBuf = await fsReadFile(wasmPath);
  if (wasmBuf instanceof Error) {
    return wasmBuf;
  }
  return new DeepseekWasm(await WebAssembly.instantiate(wasmBuf, {}));
}

export async function computePowAnswerTest() {
  let challenge =
    'a77607969d00de0f337ecc6a72dc6536d9715ccd08bc6301cbbd53d5baa8e021';
  let salt = '0767fabce5c03f98718b';
  let difficulty = 144000.0;
  let expire_at = 1739956551682;
  // wasm_path: string,

  let buf = await fsReadFile('/home/solomon/tmp/sha3_wasm_bg.7b9ca65ddd.wasm');
  if (buf instanceof Error) {
    return;
  }

  const m = await WebAssembly.compile(buf);
  const ins = await WebAssembly.instantiate(m);
  console.log(ins.exports);

  let memory = ins.exports['memory'] as WebAssembly.Memory;
  let addToStack = ins.exports['__wbindgen_add_to_stack_pointer'] as (
    pos: number,
  ) => number;
  let alloc = ins.exports['__wbindgen_export_0'] as (
    nmemb: number,
    size: number,
  ) => any;
  let wasmSolve = ins.exports['wasm_solve'] as (
    ret: number,
    pc: number,
    lc: number,
    pp: number,
    lp: number,
    diff: number,
  ) => any;

  function writeMemory(offset: number, data: Buffer): void {
    const view = new Uint8Array(memory.buffer);
    view.set(data, offset);
  }

  const readMemory = (offset: number, size: number) => {
    const view = new Uint8Array(memory.buffer);
    return view.slice(offset, offset + size);
  };

  const encodeString = (text: string): [number, number] => {
    const data = Buffer.from(text, 'utf-8');
    const length = data.length;
    const ptrVal = alloc(length, 1);
    const ptr = ptrVal instanceof Number ? ptrVal.valueOf() : ptrVal;
    writeMemory(ptr, data);
    return [ptr, length];
  };

  // 1. 申请 16 字节栈空间
  const retptr = addToStack(-16);

  // 2. 编码 challenge 与 prefix 到 wasm 内存中
  const [ptrChallenge, lenChallenge] = encodeString(challenge);
  const [ptrPrefix, lenPrefix] = encodeString(`${salt}_${expire_at}_`);

  // 3. 调用 wasm_solve（注意：difficulty 以 float 形式传入）
  wasmSolve(
    retptr,
    ptrChallenge,
    lenChallenge,
    ptrPrefix,
    lenPrefix,
    difficulty,
  );

  // 4. 从 retptr 处读取 4 字节状态和 8 字节求解结果
  const statusBytes = readMemory(retptr, 4);
  if (statusBytes.length !== 4) {
    addToStack(16);
    throw new Error('读取状态字节失败');
  }
  const status = new DataView(statusBytes.buffer).getInt32(0, true);

  const valueBytes = readMemory(retptr + 8, 8);
  if (valueBytes.length !== 8) {
    addToStack(16);
    throw new Error('读取结果字节失败');
  }
  const value = new DataView(valueBytes.buffer).getFloat64(0, true);

  // 5. 恢复栈指针
  addToStack(16);

  console.log(status, Math.floor(value));
}

export async function computePowAnswerTest2() {
  let challenge =
    'a77607969d00de0f337ecc6a72dc6536d9715ccd08bc6301cbbd53d5baa8e021';
  let salt = '0767fabce5c03f98718b';
  let difficulty = 144000;
  let expire_at = 1739956551682;

  let deepseekWasm = await getWasm();
  if (deepseekWasm instanceof Error) {
    console.error(deepseekWasm);
    return;
  }
  console.log(
    deepseekWasm.computePowAnswer(challenge, salt, difficulty, expire_at),
  );
  console.log(
    deepseekWasm.computePowAnswer(challenge, salt, difficulty, expire_at),
  );
}

// ---------------------------------------------------------------------------
// DeepseekChat tests: offline (mock https server) + live (DEEPSEEK_LIVE=1)
// ---------------------------------------------------------------------------

class MockChannel extends BaseChatChannel {
  public output: string[] = [];

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
    this.output.push(`\n>> ${datetime}\n>> ${text}\n`);
  }
  public clear() {
    this.output = [];
  }
  public flush() {}
  public async getCurrentRef() {
    return null;
  }
  public async openSearchWindow(_lines: string[]) {}
  public async popup(_content: string, _title?: string, _filetype?: string) {}
}

class MockLogger extends BaseLogger {
  public logs: string[] = [];
  protected logLevel(level: string, value: any): void {
    this.logs.push(`${level}: ${JSON.stringify(value)}`);
  }
}

let deepseekFailed = 0;
function check(name: string, ok: boolean, detail?: any) {
  if (ok) {
    console.log(`PASS ${name}`);
  } else {
    deepseekFailed++;
    console.log(`FAIL ${name}`, detail === undefined ? '' : detail);
  }
}

function readBody(req: http.IncomingMessage): Promise<string> {
  return new Promise((resolve) => {
    const chunks: Buffer[] = [];
    req.on('data', (c: Buffer) => chunks.push(c));
    req.on('end', () => resolve(Buffer.concat(chunks).toString()));
  });
}

const DS_TEST_PORT = 18444;
const DS_SESSION_ID = '22e56aac-901a-4a65-a41d-87974b6213cf';

// responses shaped like the ones the real server returned on 2026-10-30
function ok(biz_data: any) {
  return JSON.stringify({ code: 0, msg: '', data: { biz_code: 0, biz_msg: '', biz_data } });
}

const SESSION_CREATE_NEW = ok({
  chat_session: {
    id: DS_SESSION_ID,
    title: null,
    title_type: 'WIP',
    model_type: 'default',
    pinned: false,
    updated_at: 1793326380.72,
    seq_id: 215489580,
    agent: 'chat',
    version: 0,
    is_empty: true,
    current_message_id: null,
    inserted_at: 1793326380.72,
  },
  ttl_seconds: 259200,
});

// legacy shape: id directly under biz_data
const SESSION_CREATE_OLD = ok({ id: DS_SESSION_ID });

const SESSION_LIST = ok({
  chat_sessions: [
    { id: 'aaaaaaaa-0000', title: 'first', title_type: 'SYSTEM', model_type: 'default', pinned: false, updated_at: 1793195820.5 },
    { id: 'bbbbbbbb-0000', title: 'second', title_type: 'SYSTEM', model_type: 'default', pinned: false, updated_at: 1793169386.7 },
    { id: 'aaaaaaaa-0000', title: 'dup', title_type: 'SYSTEM', model_type: 'default', pinned: false, updated_at: 1793169386.7 },
  ],
  has_more: false,
});

const HISTORY = ok({
  chat_messages: [
    {
      message_id: 1,
      role: 'USER',
      inserted_at: 1793326380,
      fragments: [{ type: 'REQUEST', content: '如何退出 vim' }],
    },
    {
      message_id: 2,
      role: 'ASSISTANT',
      inserted_at: 1793326390,
      fragments: [
        { type: 'THINKING', content: 'think it over' },
        { type: 'RESPONSE', content: '输入 :q 退出' },
      ],
    },
  ],
});

export async function deepseekOfflineTest() {
  process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';

  const cert = fs.readFileSync(path.join(__dirname, '../testdata/test-cert.pem'));
  const key = fs.readFileSync(path.join(__dirname, '../testdata/test-key.pem'));

  const requests: { method?: string; url?: string; headers: any; body: string }[] = [];
  let createBody = SESSION_CREATE_NEW;

  const server = https.createServer({ key, cert }, (req, res) => {
    readBody(req).then((body) => {
      requests.push({ method: req.method, url: req.url, headers: req.headers, body });
      res.writeHead(200, { 'content-type': 'application/json' });
      if (req.url?.startsWith('/api/v0/chat_session/create')) {
        res.end(createBody);
      } else if (req.url?.startsWith('/api/v0/chat_session/fetch_page')) {
        res.end(SESSION_LIST);
      } else if (req.url?.startsWith('/api/v0/chat/history_messages')) {
        res.end(HISTORY);
      } else if (req.url?.startsWith('/api/v0/chat_session/delete')) {
        res.end(ok(null));
      } else {
        res.writeHead(404);
        res.end('{}');
      }
    });
  });
  await new Promise<void>((resolve) => server.listen(DS_TEST_PORT, '127.0.0.1', resolve));

  const savedHost = globalDeepseek.host;
  const savedPort = globalDeepseek.port;
  globalDeepseek.host = '127.0.0.1';
  globalDeepseek.port = DS_TEST_PORT;

  const chan = new MockChannel();
  const chat = new DeepseekChat('test-key', chan, new MockLogger());

  console.log('--- deepseek offline ---');

  // ---- getChatList ----
  {
    const list = await chat.getChatList();
    check('getChatList ok', !(list instanceof Error), list);
    if (!(list instanceof Error)) {
      check('getChatList dedups by id', list.length == 2, list);
      check('getChatList maps label/chatId', list[0].label == 'first' && list[0].chatId == 'aaaaaaaa-0000', list[0]);
    }
    const req = requests.find((r) => r.url?.includes('fetch_page'));
    check('request carries bearer token', req?.headers['authorization'] == 'Bearer test-key');
  }

  // ---- createChatId: new response shape (biz_data.chat_session.id) ----
  {
    createBody = SESSION_CREATE_NEW;
    const id = await chat.createChatId('test');
    check('createChatId (new shape: chat_session.id)', id === DS_SESSION_ID, id);
  }

  // ---- createChatId: legacy shape ----
  {
    createBody = SESSION_CREATE_OLD;
    const id = await chat.createChatId('test');
    check('createChatId (legacy shape: biz_data.id)', id === DS_SESSION_ID, id);
  }

  // ---- createChatId: neither shape -> error ----
  {
    createBody = ok({ unexpected: true });
    const id = await chat.createChatId('test');
    check('createChatId errors on unknown shape', id instanceof Error, id);
  }

  // ---- showHistoryMessages ----
  {
    chat.setCurrentChatId(DS_SESSION_ID);
    const err = await chat.showHistoryMessages();
    check('showHistoryMessages ok', err == null, err);
    const text = chan.output.join('');
    check('history renders user query', text.includes('如何退出 vim'), text);
    check('history renders thinking + answer', text.includes('think it over') && text.includes('输入 :q 退出'), text);
    const req = requests.find((r) => r.url?.includes('history_messages'));
    check('history query carries session id', req?.url?.includes(`chat_session_id=${DS_SESSION_ID}`) == true, req?.url);
  }

  // ---- delSession ----
  {
    const err = await chat.delSession(DS_SESSION_ID);
    check('delSession ok', err == null, err);
    const req = requests.find((r) => r.url?.includes('chat_session/delete'));
    check('delete body has chat_session_id', req != undefined && JSON.parse(req.body).chat_session_id == DS_SESSION_ID);
  }

  globalDeepseek.host = savedHost;
  globalDeepseek.port = savedPort;
  server.close();
}

// live test against the real service: guards against server-side schema drift.
// Needs MY_AI_DEEPSEEK_CHAT_KEY; creates and then deletes one empty session.
export async function deepseekLiveTest() {
  console.log('--- deepseek live ---');
  const key = process.env.MY_AI_DEEPSEEK_CHAT_KEY;
  if (!key) {
    console.log('SKIP live test: MY_AI_DEEPSEEK_CHAT_KEY not set');
    return;
  }

  const chan = new MockChannel();
  const logger = new MockLogger();
  const chat = new DeepseekChat(key, chan, logger);

  const list = await chat.getChatList();
  check('live getChatList', !(list instanceof Error) && Array.isArray(list), list);

  const id = await chat.createChatId('live-test');
  check('live createChatId returns an id', typeof id == 'string' && id.length > 0, id);
  if (typeof id != 'string') {
    return;
  }

  chat.setCurrentChatId(id);
  const histErr = await chat.showHistoryMessages();
  check('live showHistoryMessages on empty session', histErr == null, histErr);

  const delErr = await chat.delSession(id);
  check('live delSession', delErr == null, delErr);
}

export async function deepseekTest() {
  await deepseekOfflineTest();
  if (process.env.DEEPSEEK_LIVE == '1') {
    await deepseekLiveTest();
  } else {
    console.log('(set DEEPSEEK_LIVE=1 to run the live deepseek test)');
  }
  console.log(deepseekFailed == 0 ? '\ndeepseekTest all passed' : `\ndeepseekTest FAILED: ${deepseekFailed}`);
}
