import { ITranslation, createTranslation } from './base';
import { logger } from '../utils/logger';
import { sendHttpRequest, HttpRequest } from '../utils/http';
import { URL } from 'url';

function getParaphrase(obj: any): string {
  const paraphrase: string[] = [];
  const dict = obj['dict'];
  if (dict) {
    const words: string[] = [];
    for (const i of dict) {
      const pos = i['pos'];
      for (const e of i['entry']) {
        words.push(e['word']);
      }
      const terms = words.join(', ');
      paraphrase.push(`${pos}: ${terms}`);
    }
  } else {
    for (const i of obj['sentences']) {
      paraphrase.push(i['trans']);
    }
  }
  return paraphrase.join('\n');
}

export async function googleTranslate(
  text: string,
  sl: string,
  tl: string,
  proxy_url?: URL,
): Promise<ITranslation | null> {
  // const host = 'translate.googleapis.com';
  // if (/^zh/.test(tl)) {
  //   host = 'translate.google.cn';
  // }
  const host = 'translate.google.com';
  const proxy = proxy_url
    ? { host: proxy_url.hostname, port: parseInt(proxy_url.port) }
    : undefined;
  const req: HttpRequest = {
    args: {
      host,
      path:
        `/translate_a/single?client=gtx&sl=auto&tl=${tl}&dt=at&dt=bd` +
        `&dt=ex&dt=ld&dt=md&dt=qca&dt=rw&dt=rm&dt=ss&dt=t&dj=1` +
        `&q=${encodeURIComponent(text)}`,
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
    proxy,
  };
  const resp = await sendHttpRequest(req);
  if (resp.error) {
    logger.error(resp.error.message);
    return null;
  }
  if (resp.statusCode != 200 || !resp.body || resp.body.length == 0) {
    logger.error(`status: ${resp.statusCode}`);
    return null;
  }
  const obj = JSON.parse(resp.body.toString());
  if (!obj) {
    return null;
  }

  const ret = createTranslation('Google', sl, tl, text);
  ret.paraphrase = getParaphrase(obj);
  return ret;
}
