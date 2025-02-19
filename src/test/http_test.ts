import { getEnvHttpProxy } from '../utils/common';
import https from 'https';
import http from 'http';
import {
  HttpRequest,
  sendHttpRequest,
  simpleHttpRequest,
  simpleHttpsProxy,
} from '../utils/http';

export async function httpTest(): Promise<void> {
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

export function proxyTest() {
  http
    .request({
      hostname: '127.0.0.1',
      port: 1087,
      path: 'www.google.com:443',
      method: 'CONNECT',
    })
    .on('connect', (resp, socket, _head) => {
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

export async function proxyTest2() {
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

export function proxyTest3() {
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

export async function proxyTest4() {
  const req: HttpRequest = {
    args: { host: 'www.google.com', protocol: 'http:', method: 'GET' },
    proxy: { host: '127.0.0.1', port: 1087 },
  };
  const resp = await sendHttpRequest(req);
  console.log(resp);
}

export async function cibaTest() {
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
