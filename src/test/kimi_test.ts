import http from 'http';
import {
  HttpRequest,
  sendHttpRequest,
  sendHttpRequestWithCallback,
} from '../utils/http';

export async function kimiTest() {
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
