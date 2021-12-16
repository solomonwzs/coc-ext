import { TextDecoder } from 'util';
import { call_shell } from './externalexec';
// import { logger } from './logger';

export function decode_str(str: string, enc: string): string {
  const re = /\x(..)/g;
  let expl = re.exec(str);
  const buf: number[] = [];
  while (expl) {
    buf.push(parseInt(expl[1], 16));
    expl = re.exec(str);
  }
  const decoder = new TextDecoder(enc);
  return decoder.decode(Buffer.from(buf));
}

export function decode_mime_encode_str(str: string): string {
  const re = /=\?(.+?)\?([BbQq])\?(.+?)\?=/g;
  const res: RegExpExecArray[] = [];
  let expl = re.exec(str);
  while (expl) {
    res.push(expl);
    expl = re.exec(str);
  }

  if (res.length == 0) {
    return '';
  }

  const list: [string, Buffer][] = [];
  for (const s of res) {
    const charset = s[1];
    const encoding = s[2];
    const text = s[3];
    if (encoding === 'B' || encoding === 'b') {
      list.push([charset, Buffer.from(text, 'base64')]);
    } else {
      const buf: number[] = [];
      const re0 = /(=[A-F0-9]{2}|.)/g;
      let expl = re0.exec(text);
      while (expl) {
        if (expl[1].length == 3) {
          buf.push(parseInt(expl[1].slice(1), 16));
        } else {
          buf.push(expl[1].charCodeAt(0));
        }
        expl = re0.exec(text);
      }
      list.push([charset, Buffer.from(buf)]);
    }
  }

  if (list.length == 0) {
    return '';
  }

  let charset = list[0][0];
  let buf = list[0][1];
  let text = '';
  for (const i of list.slice(1)) {
    if (i[0] === charset) {
      buf = Buffer.concat([buf, i[1]]);
    } else {
      const decoder = new TextDecoder(charset);
      text += decoder.decode(buf);
      charset = i[0];
      buf = i[1];
    }
  }
  const decoder = new TextDecoder(charset);
  text += decoder.decode(buf);

  return text;
}

export interface AES256Options {
  password: string;
  prefix?: string;
  openssl?: string;
}

export async function encode_aes256_str(
  str: string,
  opts: AES256Options
): Promise<string | null> {
  const exec = opts.openssl ? opts.openssl : 'openssl';
  const argv: string[] = [
    'enc',
    '-e',
    '-pbkdf2',
    '-pass',
    `pass:${opts.password}`,
    '-base64',
    '-A',
  ];
  const res = await call_shell(exec, argv, str);
  if (res.exitCode == 0 && res.data) {
    const s = res.data.toString().replace(/\+/gi, '-').replace(/\//gi, '_');
    return opts.prefix ? `${opts.prefix}${s}` : s;
  }
  return null;
}
