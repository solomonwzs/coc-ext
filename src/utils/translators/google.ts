import { BaseTranslator, ITranslation } from './base';
// import { logger } from '../logger';

export default class GoogleTranslator extends BaseTranslator {
  private langMap: { [id: string]: string };

  constructor() {
    super('Google');
    this.langMap = {
      zh_CN: 'zh-CN',
      zh_TW: 'zh-TW',
    };
  }

  private getUrl(_sl: string, tl: string, query: string): string {
    const host = 'translate.googleapis.com';
    // if (/^zh/.test(tl)) {
    //   host = 'translate.google.cn';
    // }
    const url =
      `https://${host}/translate_a/single?client=gtx&sl=auto&tl=${tl}&dt=at&dt=bd` +
      `&dt=ex&dt=ld&dt=md&dt=qca&dt=rw&dt=rm&dt=ss&dt=t&dj=1&q=${encodeURIComponent(
        query,
      )}`;
    return url;
  }

  private getParaphrase(obj: any): string {
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

  public async translate(
    text: string,
    sl: string,
    tl: string,
  ): Promise<ITranslation | null> {
    tl = this.langMap[tl] ?? tl;
    const url = this.getUrl(sl, tl, text);
    const resp = await this.request('GET', url, 'json');
    if (!resp) {
      return null;
    }
    const obj = JSON.parse(resp);
    if (!obj) {
      return null;
    }

    const res = this.createTranslation(sl, tl, text);
    res.paraphrase = this.getParaphrase(obj);
    return res;
  }
}
