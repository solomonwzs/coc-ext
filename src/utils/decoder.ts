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
  suffix?: string;
  openssl?: string;
  salt?: boolean;
}

function encode_safe_b64str(str: string): string {
  if (str.length == 0) {
    return '0';
  }
  let padding = 0;
  if (str[str.length - 1] == '=') {
    padding = str.length >= 2 && str[str.length - 2] == '=' ? 2 : 1;
  }
  const s = str.substr(0, str.length - padding);
  return `${s.replace(/\+/gi, '-').replace(/\//gi, '_')}${padding}`;
}

function decode_safe_b64str(str: string): string {
  const padding = str.charCodeAt(str.length - 1) - '0'.charCodeAt(0);
  return `${str
    .substr(0, str.length - 1)
    .replace(/-/gi, '+')
    .replace(/_/gi, '/')}${'='.repeat(padding)}`;
}

export async function encode_aes256_str(
  str: string,
  opts: AES256Options
): Promise<string | null> {
  const exec = opts.openssl ? opts.openssl : 'openssl';
  const argv: string[] = [
    'enc',
    '-e',
    '-aes256',
    '-pbkdf2',
    '-pass',
    `pass:${opts.password}`,
    opts.salt ? '-salt' : '-nosalt',
    '-base64',
    '-A',
  ];
  const res = await call_shell(exec, argv, str);
  if (res.exitCode == 0 && res.data) {
    return `${opts.prefix ? opts.prefix : ''}${encode_safe_b64str(
      res.data.toString()
    )}${opts.suffix ? opts.suffix : ''}`;
  }
  return null;
}

export async function decode_aes256_str(
  str: string,
  opts: AES256Options
): Promise<string | null> {
  let s = str;
  if (opts.prefix) {
    if (s.length <= opts.prefix.length) {
      return null;
    }
    s = s.substr(opts.prefix.length);
  }
  if (opts.suffix) {
    if (s.length <= opts.suffix.length) {
      return null;
    }
    s = s.substr(1, s.length - opts.suffix.length);
  }
  s = decode_safe_b64str(s);
  const exec = opts.openssl ? opts.openssl : 'openssl';
  const argv: string[] = [
    'des',
    '-d',
    '-aes256',
    '-pbkdf2',
    '-pass',
    `pass:${opts.password}`,
    opts.salt ? '-salt' : '-nosalt',
    '-base64',
    '-A',
  ];
  const res = await call_shell(exec, argv, s);
  if (res.exitCode == 0 && res.data) {
    return res.data.toString();
  }
  return null;
}
