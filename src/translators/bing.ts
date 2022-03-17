import { ITranslation, createTranslation } from './base';
import { simpleHttpsRequest } from '../utils/http';
import { RequestOptions } from 'https';
import { logger } from '../utils/logger';

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
  tl: string
): Promise<ITranslation | null> {
  const opts: RequestOptions = {
    hostname: 'cn.bing.com',
    path: `/dict/SerpHoverTrans?q=${encodeURIComponent(text)}`,
    method: 'GET',
    timeout: 1000,
    headers: {
      Host: 'cn.bing.com',
      Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
      'Accept-Language': 'en-US,en;q=0.5',
    },
  };
  const resp = await simpleHttpsRequest(opts);
  if (resp.error) {
    logger.error(resp.error.message);
    return null;
  }
  if (!resp.data) {
    return null;
  }

  const ret = createTranslation('Bing', sl, tl, text);
  ret.paraphrase = getParaphrase(resp.data.toString());
  return ret;
}
