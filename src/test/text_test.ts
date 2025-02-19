import {
  encodeAes256Str,
  decodeAes256Str,
  AES256Options,
} from '../utils/decoder';

export function fnvHash(data: string | Uint8Array, seed = 0): number {
  const fnvPrime = BigInt(0x811c9dc5);
  let hash = BigInt(seed);
  const func = function (x: number) {
    hash = BigInt.asUintN(32, hash * fnvPrime);
    hash ^= BigInt(x);
  };
  if (typeof data === 'string') {
    const enc = new TextEncoder();
    const bytes = enc.encode(data);
    bytes.forEach(func);
  } else if (data instanceof String) {
    const enc = new TextEncoder();
    const bytes = enc.encode(data.toString());
    bytes.forEach(func);
  } else {
    data.forEach(function (x: number) {
      hash = BigInt.asUintN(32, hash * fnvPrime);
      hash ^= BigInt(x);
    });
  }
  return Number(hash);
}

export async function reTest() {
  const str =
    "Subject: =?utf-8?Q?[Plateforme_de_l'Or]_Un_ami_vous_a_envoy=C3=A9_un_l?=  =?utf-8?Q?ien_vers_10F_OR_-_Marianne/_Coq?=";
  const re = /=\?(.+?)\?([BbQq])\?(.+?)\?=/g;
  let expl = re.exec(str);
  while (expl) {
    console.log(expl);
    expl = re.exec(str);
  }

  let s = "'1234'";
  console.log(s.replace(/'/g, "''"));

  s = '\\1\\?';
  console.log(s);
  console.log(Buffer.from(s.replace(/\\(?!")/g, '\\\\')));
}

export function textTest() {
  let regex = new RegExp(/^\^([0-9]*)\^\]$/);
  console.log(regex.exec('^123^]'));

  let text = 'abc<label> Server hello (2):</label>';
  console.log(text.replace(/<\/?label>/gi, ''));
  console.log(text.indexOf('[^1^]'));

  try {
    JSON.parse(text);
  } catch (e) {
    console.log(JSON.stringify(e));
  }
  text = '则判定\u003clabel\u003e为\u003c/label\u003e垃圾';
  console.log(text);

  console.log(new Date(1738927991000).toLocaleString());
  console.log(new Date().toLocaleString());
  console.log(Date.now());

  let s = 'data: [DONE]--';
  console.log(s.slice(6, 12));
}

export function colorTest() {
  let regex = new RegExp(/(([c]?term|gui)([fb]g)?=[#\w0-9]*)/gi);
  let s =
    'hi CocListHeader ctermfg=16 ctermbg=108 cterm=bold GUIFG=#000000 guibg=#87af87 gui=bold';
  console.log(Array.from(s.matchAll(regex), (m) => m[0]));
}

export async function aes256Test() {
  const opts: AES256Options = {
    password: '1234abcd',
    prefix: '.enc_',
  };
  const s0 = await encodeAes256Str('hello world', opts);
  console.log(s0);
  if (s0) {
    const s1 = await decodeAes256Str(s0, opts);
    console.log(s1);
  }
}
