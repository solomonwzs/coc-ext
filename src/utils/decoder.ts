import { TextDecoder } from 'util';
// import { logger } from './logger';

export function decode_utf8_str(str: string): string {
  const re = /\x(..)/g;
  let expl = re.exec(str);
  const buf: number[] = [];
  while (expl) {
    buf.push(parseInt(expl[1], 16));
    expl = re.exec(str);
  }
  return Buffer.from(buf).toString('utf8');
}

export function decode_mime_encode_str(str: string): string {
  const re = /=\?(.*)\?([BbQq])\?(.*)\?=/g;
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
