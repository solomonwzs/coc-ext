import { ITranslation, createTranslation } from './base';
import { logger } from '../utils/logger';
import { sendHttpRequest, HttpRequest } from '../utils/http';
import { URL } from 'url';

function getParaphrase(obj: any): string {
  const paraphrase: string[] = [];
  const messages = obj['message'];
  if (messages) {
    for (const msg of messages) {
      paraphrase.push(msg['key']);
      paraphrase.push(msg['paraphrase']);
    }
  }
  return paraphrase.join('\n');
}

export async function cibaTranslate(
  text: string,
  sl: string,
  tl: string,
  proxy_url?: URL,
): Promise<ITranslation | null> {
  const req: HttpRequest = {
    args: {
      host: 'dict-mobile.iciba.com',
      path: `/interface/index.php?c=word&m=getsuggest&nums=1&is_need_mean=1&word=${encodeURIComponent(text.toLowerCase())}`,
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

  const ret = createTranslation('iCIBA', sl, tl, text);
  ret.paraphrase = getParaphrase(obj);
  return ret;
}
