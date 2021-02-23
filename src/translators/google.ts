import { ITranslation, createTranslation } from './base';
import { logger } from '../utils/logger';
import { RequestOptions } from 'https';
import { simple_https_request } from '../utils/http';

function getParaphrase(obj: any): string {
  const paraphrase: string[] = [];
  const dict = obj['dict'];
  if (dict) {
    for (const i of dict) {
      const pos = i['pos'];
      const terms = i['terms'].join(', ');
      paraphrase.push(`${pos}: ${terms}`);
    }
  } else {
    for (const i of obj['sentences']) {
      paraphrase.push(i['trans']);
    }
  }
  return paraphrase.join('\n');
}

export async function google_translate(
  text: string,
  sl: string,
  tl: string,
): Promise<ITranslation | null> {
  const host = 'translate.googleapis.com';
  // if (/^zh/.test(tl)) {
  //   host = 'translate.google.cn';
  // }
  const opts: RequestOptions = {
    hostname: host,
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
  };
  const resp = await simple_https_request(opts);
  if (resp.error) {
    logger.error(resp.error.message);
    return null;
  }
  if (!resp.data || resp.statusCode != 200) {
    logger.error(`status: ${resp.statusCode}`);
    return null;
  }
  const obj = JSON.parse(resp.data.toString());
  if (!obj) {
    return null;
  }

  const ret = createTranslation('Google', sl, tl, text);
  ret.paraphrase = getParaphrase(obj);
  return ret;
}
