import { ITranslation, createTranslation } from './base';
import { sendHttpRequest, HttpRequest } from '../utils/http';
import { logger } from '../utils/logger';
import { URL } from 'url';

function getParaphrase(html: string): string {
  const re =
    /<span class="ht_pos">(.*?)<\/span><span class="ht_trs">(.*?)<\/span>/g;
  let expl = re.exec(html);

  const paraphrase: string[] = [];
  while (expl) {
    paraphrase.push(`${expl[1]} ${expl[2]} `);
    expl = re.exec(html);
  }
  return paraphrase.join('\n');
}

export async function bingTranslate(
  text: string,
  sl: string,
  tl: string,
  proxy_url?: URL
): Promise<ITranslation | null> {
  const proxy = proxy_url
    ? { host: proxy_url.hostname, port: parseInt(proxy_url.port) }
    : undefined;
  const req: HttpRequest = {
    args: {
      host: 'cn.bing.com',
      path: `/dict/SerpHoverTrans?q=${encodeURIComponent(text)}`,
      method: 'GET',
      timeout: 1000,
      headers: {
        Host: 'cn.bing.com',
        Accept:
          'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        'Accept-Language': 'en-US,en;q=0.5',
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
    logger.error(`bing, status: ${resp.statusCode}`);
    return null;
  }

  const ret = createTranslation('Bing', sl, tl, text);
  ret.paraphrase = getParaphrase(resp.body.toString());
  return ret;
}
