import { spawn } from 'child_process';
import { RequestOptions } from 'https';
import { TextDecoder, TextEncoder } from 'util';
import { simple_https_request } from './utils/http';
import fs from 'fs';
import { call_shell } from './utils/externalexec';
import path from 'path';
import { fs_ex } from './utils/file';

console.log('========');

async function http_test(): Promise<void> {
  const opts: RequestOptions = {
    hostname: 'www.google.com',
    method: 'GET',
    timeout: 100,
  };
  const resp = await simple_https_request(opts);
  console.log(resp);
}
// http_test();

function fnvHash(data: string | Uint8Array, seed = 0): number {
  const fnvPrime = BigInt(0x811c9dc5);
  let hash = BigInt(seed);
  const func = function (x: number) {
    hash = BigInt.asUintN(32, hash * fnvPrime);
    hash ^= BigInt(x);
  };
  if (typeof data === 'string') {
    const enc = new TextEncoder();
    const bytes = enc.encode(data);
    bytes.forEach(func);
  } else if (data instanceof String) {
    const enc = new TextEncoder();
    const bytes = enc.encode(data.toString());
    bytes.forEach(func);
  } else {
    data.forEach(function (x: number) {
      hash = BigInt.asUintN(32, hash * fnvPrime);
      hash ^= BigInt(x);
    });
  }
  return Number(hash);
}
// console.log(fnvHash('👨👩👧👦'));
// console.log(fnvHash('1234'));
// console.log(fnvHash('中文'));

// const enc = new TextEncoder();
// const bytes = enc.encode('👨👩👧👦');
// bytes.forEach(function (x: number) {
//   console.log(x);
// });
// for (const i in bytes) {
//   console.log(bytes[i]);
// }

// const ls = spawn('ls', ['-lh']);

// ls.stdout.on('data', data => {
//   console.log(`stdout: ${data}`);
// });

// ls.stderr.on('data', data => {
//   console.error(`stderr: ${data}`);
// });

// ls.on('close', code => {
//   console.log(`child process exited with code ${code}`);
// });

// const w = new Stream.Writable();
// w._write = function (chunk, enc, done) {
//   console.log(chunk);
//   console.log(enc);
//   done();
// };

// const wc = spawn('wc', [], { stdio: ['pipe', 'pipe', process.stderr] });
// wc.stdin.write([1, 2, 3, 4].toString());
// wc.stdin.end();
// wc.stdout.on('data', data => {
//   console.log(`stdout: ${data}`);
// });
// wc.on('close', code => {
//   console.log(`child process exited with code ${code}`);
// });

function python_test() {
  const py = spawn('python3', ['/tmp/2.py'], {
    stdio: ['pipe', 'pipe', process.stderr],
  });
  py.stdin.write('hello');
  py.stdin.write('hello');
  py.stdin.end();
  py.stdout.on('data', (data) => {
    console.log(`stdout: ${data}`);
  });
}

function writefile_test() {
  fs.writeFile('/tmp/1.txt', 'hello', (err) => {
    console.log(err);
  });
  // const ws = fs.createWriteStream('/tmp/1.txt');
  // ws.write('hello');
  // ws.on('finish', () => {
  //   console.log('end');
  // }).on('error', err => {
  //   console.log(err);
  // });
}
// writefile_test();

async function call_test() {
  const style = {
    BasedOnStyle: 'Google',
    AllowShortFunctionsOnASingleLine: 'Inline',
  };
  const resp = await call_shell(
    'clang-format',
    ['-style', JSON.stringify(style)],
    'int main() { return 0;}'
  );
  if (resp.exitCode == 0 && resp.data) {
    console.log(resp.data.toString());
  }
}
// call_test();

async function re_test() {
  const str =
    "Subject: =?utf-8?Q?[Plateforme_de_l'Or]_Un_ami_vous_a_envoy=C3=A9_un_l?=  =?utf-8?Q?ien_vers_10F_OR_-_Marianne/_Coq?=";
  const re = /=\?(.+?)\?([BbQq])\?(.+?)\?=/g;
  let expl = re.exec(str);
  while (expl) {
    console.log(expl);
    expl = re.exec(str);
  }
}
// re_test();

function get_enc_filename(filename: string, password: string): string {
  return '';
}

function get_dec_filename(filename: string): string | undefined {
  const dir = path.dirname(filename);
  const name = path.basename(filename);

  if (
    name.length >= 6 &&
    name[0] == '.' &&
    name.substr(name.length - 4) == '.enc'
  ) {
    const new_name = name.substr(1, name.length - 5);
    return path.join(dir, new_name);
  }
  return undefined;
}

async function path_test() {
  console.log(path.join('/home', '1.txt'));
  console.log(path.basename('/a/b/c/d').split(/\s+/));

  const res = await fs_ex.stat('/tmp/1.c');
  console.log(res);
  if (res.stats) {
    console.log(res.stats.isFile());
  }

  const s = '123=456=76\\';
  console.log(s.replace(/=/gi, '-').replace(/\\/gi, '_'));
}
path_test();
