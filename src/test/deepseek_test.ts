import fs from 'fs';
import { fsAccess, fsReadFile } from '../utils/file';
import { CocExtError } from '../utils/common';
import { simpleHttpDownloadFile } from '../utils/http';

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
      return new CocExtError(CocExtError.ERR_DEEPSEEK, 'read status fail');
    }
    let status = new DataView(statusBytes.buffer).getInt32(0, true);

    let valueBytes = this.readMemory(retptr + 8, 8);
    if (valueBytes.length !== 8) {
      this.addToStack(16);
      return new CocExtError(CocExtError.ERR_DEEPSEEK, 'read value fail');
    }
    let value = new DataView(valueBytes.buffer).getFloat64(0, true);

    this.addToStack(16);
    if (status !== 1) {
      return new CocExtError(CocExtError.ERR_DEEPSEEK, 'computePowAnswer fail');
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
      return new CocExtError(
        CocExtError.ERR_DEEPSEEK,
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
