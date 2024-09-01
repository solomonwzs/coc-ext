import { spawn } from 'child_process';
import https from 'https';
import http from 'http';
import { TextDecoder, TextEncoder } from 'util';
import {
  simpleHttpRequest,
  simpleHttpsProxy,
  sendHttpRequest,
  sendHttpRequestWithCallback,
  HttpRequest,
  simpleHttpDownloadFile,
} from './utils/http';
import fs from 'fs';
import { callShell, callMultiCmdShell } from './utils/externalexec';
import path from 'path';
import {
  fsStat,
  getFilesList,
  fsOpen,
  fsWrite,
  fsClose,
  fsAccess,
} from './utils/file';
import minimatch from 'minimatch';
import {
  encodeAes256Str,
  decodeAes256Str,
  AES256Options,
} from './utils/decoder';
import { getRandomId, getEnvHttpProxy } from './utils/common';
import { URI } from 'vscode-uri';
import { URL } from 'url';
import os from 'os';
import { get_encoding, encoding_for_model } from 'tiktoken';

async function http_test(): Promise<void> {
  console.log(getEnvHttpProxy());
  // const url = new URL('www.google.com/c?a=1&b=2');
  // console.log(url.pathname);
  // console.log(url.search);
  const opts: https.RequestOptions = {
    protocol: 'http:',
    host: 'www.baidu.com',
    method: 'GET',
    timeout: 1000,
  };
  const resp = await simpleHttpRequest(opts);
  console.log(resp);
}

function proxy_test() {
  http
    .request({
      hostname: '127.0.0.1',
      port: 1087,
      path: 'www.google.com:443',
      method: 'CONNECT',
    })
    .on('connect', (resp, socket, head) => {
      if (resp.statusCode == 200) {
        console.log('ok');
        const agent = new https.Agent({ socket });
        // https.get(
        //   { hostname: 'www.google.com', path: '/', method: 'GET', agent },
        //   (res) => {
        //     res.on('data', (chunk: Buffer) => {
        //       console.log(chunk.toString('utf8'));
        //     });
        //   }
        // );
        https
          .request(
            {
              hostname: 'www.google.com',
              path: '/',
              method: 'GET',
              agent,
              // timeout: 5000,
            },
            (res) => {
              res
                .on('data', (chunk: Buffer) => {
                  console.log(chunk.toString('utf8'));
                })
                .on('end', () => {
                  console.log('end');
                });
            },
          )
          .on('timeout', () => {
            console.log('query timeout');
          })
          .on('error', (err) => {
            console.log(err);
          })
          .end();
      } else {
        console.log(resp);
      }
    })
    .on('timeout', () => {
      console.log('proxy timeout');
    })
    .end();
}

async function proxy_test2() {
  const agent = await simpleHttpsProxy('127.0.0.1', 7890, 'www.google.com:443');
  if (agent.error) {
    console.log(agent.error);
    return;
  }
  https
    .request(
      {
        host: 'www.google.com',
        path: '/ncr',
        method: 'GET',
        agent: agent.agent,
        // timeout: 5000,
      },
      (res) => {
        res
          .on('data', (chunk: Buffer) => {
            console.log(chunk.toString('utf8'));
          })
          .on('end', () => {
            console.log('==== end ====');
          });
      },
    )
    .on('timeout', () => {
      console.log('query timeout');
    })
    .on('error', (err) => {
      console.log(err);
    })
    .end();
}

function foo(opts: http.RequestOptions) {
  const opts2 = Object.assign({}, opts);
  opts2.headers = Object.assign({}, opts.headers);
  console.log(opts);
  console.log(opts2);
}

function proxy_test3() {
  const opts = {
    host: '127.0.0.1',
    port: 7890,
    method: 'GET',
    path: 'http://www.google.com/ncr',
    headers: {
      Host: 'www.google.com',
    },
  };
  foo(opts);
  http
    .request(opts, (res) => {
      console.log(res.headers);
      res
        .on('data', (chunk: Buffer) => {
          console.log(chunk.toString('utf8'));
        })
        .on('end', () => {
          console.log('==== end ====');
        });
    })
    .on('timeout', () => {
      console.log('query timeout');
    })
    .on('error', (err) => {
      console.log(err);
    })
    .end();
}

async function proxy_test4() {
  const req: HttpRequest = {
    args: { host: 'www.google.com', protocol: 'http:', method: 'GET' },
    proxy: { host: '127.0.0.1', port: 1087 },
  };
  const resp = await sendHttpRequest(req);
  console.log(resp);
}

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

async function call_test() {
  // const style = {
  //   BasedOnStyle: 'Google',
  //   AllowShortFunctionsOnASingleLine: 'Inline',
  // };
  // const resp = await callShell(
  //   'clang-format',
  //   ['-style', JSON.stringify(style)],
  //   'int main() { return 0;}'
  // );
  // if (resp.exitCode == 0 && resp.data) {
  //   console.log(resp.data.toString());
  // }
  // const res = await callMultiCmdShell([
  //   {
  //     exec: 'find',
  //     args: ['/home/solomon/tmp/note', '-type', 'f'],
  //   },
  //   {
  //     exec: 'grep',
  //     args: ['json'],
  //   },
  // ]);
  const res = await callShell('rg', ['list']);
  console.log(res);
  if (res.data) {
    console.log(res.data.toString());
  }
  if (res.error) {
    console.log(res.error.toString());
  }
}

async function re_test() {
  const str =
    "Subject: =?utf-8?Q?[Plateforme_de_l'Or]_Un_ami_vous_a_envoy=C3=A9_un_l?=  =?utf-8?Q?ien_vers_10F_OR_-_Marianne/_Coq?=";
  const re = /=\?(.+?)\?([BbQq])\?(.+?)\?=/g;
  let expl = re.exec(str);
  while (expl) {
    console.log(expl);
    expl = re.exec(str);
  }

  let s = "'1234'";
  console.log(s.replace(/'/g, "''"));

  s = '\\1\\?';
  console.log(s);
  console.log(Buffer.from(s.replace(/\\(?!")/g, '\\\\')));
}

async function path_test() {
  console.log(path.join('/home', '1.txt'));
  console.log(path.basename('/a/b/c/d').split(/\s+/));

  const res = await fsStat('/tmp/1.c');
  console.log(res);
  if (res instanceof fs.Stats) {
    console.log(res.isFile());
  }

  const s = '123=456=76\\';
  console.log(s.replace(/=/gi, '-').replace(/\\/gi, '_'));

  const pattern = path.resolve('**/*.ts');
  const mm = new minimatch.Minimatch(pattern, {
    matchBase: true,
  });
  // console.log(mm.match('/home/solomon/workspace/js/coc-ext/lib/test.js'));
  console.log(mm.match(path.resolve('./src/lists/commands.ts')));
  console.log(path.resolve('/src/lists/commands.ts'));

  const l = ['a', 'b', 'c'];
  for (const i of l) {
    console.log(i);
  }

  const fl = await getFilesList('/home/solomon/tmp/note');
  console.log(fl);

  const color_codes: Record<string, [number, number]> = { a: [1, 2] };
  console.log(color_codes['b']);

  const p = '~/dotfiles/vim/bundle/gruvbox/colors/gruvbox.vim';
  console.log(path.resolve(p));
  console.log(URI.file(p).toString());
  console.log(os.homedir());

  let ss: Set<number> = new Set();
  ss.add(1);
  console.log(ss);
  console.log(JSON.stringify(ss));
}

async function aes256_test() {
  const opts: AES256Options = {
    password: '1234abcd',
    prefix: '.enc_',
  };
  const s0 = await encodeAes256Str('hello world', opts);
  console.log(s0);
  if (s0) {
    const s1 = await decodeAes256Str(s0, opts);
    console.log(s1);
  }
}

function utils_test() {
  console.log(getRandomId('x'));

  const trafficID = Array.from({ length: 20 }, () =>
    Math.floor(Math.random() * 36).toString(36),
  ).join('');
  console.log(trafficID);

  console.log(process.env);
}

function read_test() {
  fs.readFile('/tmp/3.txt', (err, data) => {
    console.log(err);
    console.log(data.toString());
  });
}

function foo_HttpRequest(req: HttpRequest, cpy: boolean) {
  return cpy ? Object.assign({}, req) : req;
}

function obj_copy_test() {
  const obj: HttpRequest = { args: { host: '1' }, data: 1 };
  console.log(obj);

  const obj_cpy = foo_HttpRequest(obj, false);
  obj_cpy.data = 100;
  console.log(obj);
  console.log(obj_cpy);
}

async function ciba_test() {
  const text = 'Apple';
  const req: HttpRequest = {
    args: {
      host: 'dict-mobile.iciba.com',
      path: `/interface/index.php?c=word&m=getsuggest&nums=10&is_need_mean=1&word=${encodeURIComponent(text)}`,
      method: 'GET',
      timeout: 1000,
      headers: {
        'User-Agent':
          'Mozilla/5.0 (X11; Linux x86_64) ' +
          'AppleWebKit/537.36 (KHTML, like Gecko) ' +
          'Chrome/75.0.3770.100 ' +
          'Safari/537.36',
      },
      protocol: 'https:',
    },
  };
  var resp = await sendHttpRequest(req);
  console.log(resp.statusCode);
  console.log(resp.body?.toString());
}

async function kimi_test() {
  const trafficID = Array.from({ length: 20 }, () =>
    Math.floor(Math.random() * 36).toString(36),
  ).join('');

  const headers = {
    'Content-Type': 'application/json',
    'User-Agent':
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.77 Safari/537.36 Edg/91.0.864.41',
    Origin: 'https://kimi.moonshot.cn',
    Referer: 'https://kimi.moonshot.cn/',
    'X-Traffic-Id': trafficID,
  };

  headers['Authorization'] = `Bearer ${process.env.MY_KIMI_REFRESH_TOKEN}`;
  const refresh_req: HttpRequest = {
    args: {
      host: 'kimi.moonshot.cn',
      path: '/api/auth/token/refresh',
      method: 'GET',
      protocol: 'https:',
      headers,
    },
  };
  var resp = await sendHttpRequest(refresh_req);
  console.log(headers['X-Traffic-Id']);
  console.log(resp.statusCode);
  console.log(resp.body?.toString());

  var access_token: string = '';
  if (resp.statusCode == 200 && resp.body) {
    const obj = JSON.parse(resp.body?.toString());
    access_token = obj['access_token'];
  }

  headers['Authorization'] = `Bearer ${access_token}`;
  const test_req: HttpRequest = {
    args: {
      host: 'kimi.moonshot.cn',
      path: '/api/chat',
      method: 'POST',
      protocol: 'https:',
      headers,
    },
    data: JSON.stringify({ name: 'Kimi', is_example: false }),
  };
  await sendHttpRequestWithCallback(test_req, {
    onData: (chunk: Buffer) => {
      console.log(chunk.toString());
    },
    onEnd: (msg: http.IncomingMessage) => {
      console.log(msg.statusCode);
      console.log(msg.headers);
    },
  });
  // var resp = await sendHttpRequest(test_req);
  // console.log(resp.statusCode);
  // console.log(resp.body?.toString());
}

function text_test() {
  let regex = new RegExp(/^\^([0-9]*)\^\]$/);
  console.log(regex.exec('^123^]'));

  let text = 'abc<label> Server hello (2):</label>';
  console.log(text.replace(/<\/?label>/gi, ''));
  console.log(text.indexOf('[^1^]'));

  try {
    JSON.parse(text);
  } catch (e) {
    console.log(JSON.stringify(e));
  }
  text = '则判定\u003clabel\u003e为\u003c/label\u003e垃圾';
  console.log(text);
}

function color_test() {
  let regex = new RegExp(/(([c]?term|gui)([fb]g)?=[#\w0-9]*)/gi);
  let s =
    'hi CocListHeader ctermfg=16 ctermbg=108 cterm=bold GUIFG=#000000 guibg=#87af87 gui=bold';
  console.log(Array.from(s.matchAll(regex), (m) => m[0]));
}

function isError(error: any): error is NodeJS.ErrnoException {
  return error instanceof Error;
}

async function tiktoken_test() {
  const enc = get_encoding('gpt2');
  console.log(enc.encode('hello world'));

  const addr =
    'https://openaipublic.blob.core.windows.net/encodings/cl100k_base.tiktoken';
  const url = new URL(addr);
  console.log(url.protocol);
  console.log(url.hostname);
  console.log(url.pathname);

  console.log(addr.match('.+/(.+)'));
  console.log(path.join(os.homedir(), '.cache'));

  console.log(process.version);
  const err = await fsAccess('/tmp/xxx', fs.constants.R_OK);
  console.log(err?.message);
  console.log(err instanceof Error);
  console.log(Error.prototype.constructor);
  console.log(err.__proto__.constructor);
  console.log(err.__proto__ == Error.prototype);

  // simpleHttpDownloadFile(addr, '/tmp/1.tiktoken');

  // const fd = await fsOpen('/tmp/1.txt', 'w');
  // if (fd instanceof Error) {
  //   return;
  // }
  // console.log(fd);
  // console.log(await fsWrite(fd, Buffer.from('hello', 'utf8')));
  // console.log((await fsClose(fd)) instanceof Error);
  // console.log((await fsClose(fd)) instanceof Error);
}

console.log('========');

// http_test();
// proxy_test();
// proxy_test2();
// proxy_test3();
// proxy_test4();
// writefile_test();
// call_test();
// re_test();
// path_test();
// aes256_test();
// utils_test();
// read_test();
// obj_copy_test();
// ciba_test();
// kimi_test();
// text_test();
// color_test();
tiktoken_test();
