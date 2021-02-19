import { BaseTranslator, ITranslation } from './base';

export default class BingTranslator extends BaseTranslator {
  constructor() {
    super('Bing');
  }

  private getParaphrase(html: string): string {
    const re = /<span class="ht_pos">(.*?)<\/span><span class="ht_trs">(.*?)<\/span>/g;
    let expl = re.exec(html);

    const paraphrase: string[] = [];
    while (expl) {
      paraphrase.push(`${expl[1]}: ${expl[2]} `);
      expl = re.exec(html);
    }
    return paraphrase.join('\n');
  }

  public async translate(
    text: string,
    sl: string,
    tl: string,
  ): Promise<ITranslation | null> {
    const url = `http://cn.bing.com/dict/SerpHoverTrans?q=${encodeURIComponent(
      text,
    )}`;
    const headers = {
      Host: 'cn.bing.com',
      Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
      'Accept-Language': 'en-US,en;q=0.5',
    };
    const resp = await this.request('GET', url, 'text', headers);
    if (!resp) {
      return null;
    }

    const res = this.createTranslation(sl, tl, text);
    res.paraphrase = this.getParaphrase(resp);
    return res;
  }
}
