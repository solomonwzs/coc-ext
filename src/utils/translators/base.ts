import { workspace } from 'coc.nvim';
import { configure, xhr, XHROptions } from 'request-light';
import { logger } from '../logger';

export interface ITranslation {
  engine: string;
  sl: string;
  tl: string;
  text: string;
  phonetic: string;
  paraphrase: string;
  explains: string[];
}

export abstract class BaseTranslator {
  constructor(protected name: string) {}

  public abstract translate(
    text: string,
    sl: string,
    tl: string,
  ): Promise<ITranslation | null>;

  protected createTranslation(
    sl: string,
    tl: string,
    text: string,
  ): ITranslation {
    return {
      engine: this.name,
      sl: sl,
      tl: tl,
      text: text,
      explains: [],
      paraphrase: '',
      phonetic: '',
    };
  }

  protected decodeHtmlCharCodes(text: string): string {
    return text.replace(/(&#(\d+);)/g, (_match, _capture, charCode) => {
      return String.fromCharCode(charCode);
    });
  }

  protected async request(
    type: string,
    url: string,
    responseType: string,
    headers?: { [id: string]: string },
    data?: any,
  ): Promise<any> {
    const httpConfig = workspace.getConfiguration('http');
    configure(
      httpConfig.get<string>('proxy', ''),
      httpConfig.get<boolean>('proxyStrictSSL', false),
    );

    if (!headers) {
      headers = {
        'Accept-Encoding': 'gzip, deflate',
        'User-Agent':
          'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/75.0.3770.100 Safari/537.36',
      };
    }

    let post_data = '';
    if (type == 'POST') {
      post_data = JSON.stringify(data);
    } else if (data) {
      url = url + '?' + urlencode(data);
    }

    const options: XHROptions = {
      type,
      url,
      data: post_data || null,
      headers,
      timeout: 5000,
      followRedirects: 5,
      responseType,
    };

    try {
      const response = await xhr(options);
      return response.responseText;
    } catch (e) {
      // window.showMessage(e['responseText'], 'error');
      logger.err(e['status']);
      logger.err(e['responseText']);
      return null;
    }
  }
}

function urlencode(data: Record<string, string>): string {
  return Object.keys(data)
    .map(key => [key, data[key]].map(encodeURIComponent).join('='))
    .join('&');
}
