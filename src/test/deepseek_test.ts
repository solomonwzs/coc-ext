import { fsReadFile } from '../utils/file';

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
  let difficulty = 144000.0;
  let expire_at = 1739956551682;

  let buf = await fsReadFile('/home/solomon/tmp/sha3_wasm_bg.7b9ca65ddd.wasm');
  if (buf instanceof Error) {
    return;
  }

  // 初始化 WebAssembly 内存
  const memory = new WebAssembly.Memory({ initial: 1 });

  // 定义导入对象
  const importObject = {
    env: {
      memory, // 共享内存
      __wbindgen_add_to_stack_pointer: (delta: number) => {
        // 模拟栈指针操作
        return delta;
      },
      __wbindgen_export_0: (size: number, _align: number) => {
        // 模拟内存分配
        const offset = memory.grow(Math.ceil(size / 65536)); // 按页分配
        return offset * 65536; // 返回分配的内存地址
      },
    },
  };

  // 实例化 WASM 模块
  const { instance } = await WebAssembly.instantiate(buf, importObject);
  const exports = instance.exports;
  console.log(exports);

  // 获取导出的函数和内存
  const memoryView = new Uint8Array(memory.buffer);
  const addToStack = exports.__wbindgen_add_to_stack_pointer as (
    delta: number,
  ) => number;
  const alloc = exports.__wbindgen_export_0 as (
    size: number,
    align: number,
  ) => number;
  const wasmSolve = exports.wasm_solve as (
    retptr: number,
    ptrChallenge: number,
    lenChallenge: number,
    ptrPrefix: number,
    lenPrefix: number,
    difficulty: number,
  ) => void;

  // 辅助函数：将字符串写入内存
  function writeMemory(offset: number, data: Uint8Array): void {
    console.debug(memory.buffer.byteLength, memoryView.byteLength);
    memoryView.set(data, offset);
  }

  // 辅助函数：从内存中读取字符串
  function readMemory(offset: number, size: number): Uint8Array {
    return memoryView.slice(offset, offset + size);
  }

  // 辅助函数：将字符串编码到内存并返回指针和长度
  function encodeString(text: string): [number, number] {
    const encoder = new TextEncoder();
    const data = encoder.encode(text);
    const ptr = alloc(data.length, 1);
    writeMemory(ptr, data);
    return [ptr, data.length];
  }

  // 1. 申请 16 字节栈空间
  const retptr = addToStack(-16);

  // 2. 编码 challenge 与 prefix 到 WASM 内存中
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
    addToStack(16); // 恢复栈指针
    throw new Error('读取状态字节失败');
  }
  const status = new DataView(statusBytes.buffer).getInt32(0, true); // 小端序读取

  const valueBytes = readMemory(retptr + 8, 8);
  if (valueBytes.length !== 8) {
    addToStack(16); // 恢复栈指针
    throw new Error('读取结果字节失败');
  }
  const value = new DataView(valueBytes.buffer).getFloat64(0, true); // 小端序读取

  // 5. 恢复栈指针
  addToStack(16);

  console.log(`Status: ${status}, Value: ${value}`);
}
