import fs from 'fs';
import path from 'path';
import minimatch from 'minimatch';
import { URI } from 'vscode-uri';
import os from 'os';
import { fsStat, getFilesList } from '../utils/file';

export function writefileTest() {
  fs.writeFile('/tmp/1.txt', 'hello', (err) => {
    console.log(err);
  });
  // const ws = fs.createWriteStream('/tmp/1.txt');
  // ws.write('hello');
  // ws.on('finish', () => {
  //   console.log('end');
  // }).on('error', err => {
  //   console.log(err);
  // });
}

export async function pathTest() {
  console.log(path.join('/home', '1.txt'));
  console.log(path.basename('/a/b/c/d').split(/\s+/));

  const res = await fsStat('/tmp/1.c');
  console.log(res);
  if (res instanceof fs.Stats) {
    console.log(res.isFile());
  }

  const s = '123=456=76\\';
  console.log(s.replace(/=/gi, '-').replace(/\\/gi, '_'));

  const pattern = path.resolve('**/*.ts');
  const mm = new minimatch.Minimatch(pattern, {
    matchBase: true,
  });
  // console.log(mm.match('/home/solomon/workspace/js/coc-ext/lib/test.js'));
  console.log(mm.match(path.resolve('./src/lists/commands.ts')));
  console.log(path.resolve('/src/lists/commands.ts'));

  const l = ['a', 'b', 'c'];
  for (const i of l) {
    console.log(i);
  }

  const fl = await getFilesList('/home/solomon/tmp/note');
  console.log(fl);

  const color_codes: Record<string, [number, number]> = { a: [1, 2] };
  console.log(color_codes['b']);

  const p = '~/dotfiles/vim/bundle/gruvbox/colors/gruvbox.vim';
  console.log(path.resolve(p));
  console.log(URI.file(p).toString());
  console.log(os.homedir());

  let ss: Set<number> = new Set();
  ss.add(1);
  console.log(ss);
  console.log(JSON.stringify(ss));
}

export function readTest() {
  fs.readFile('/tmp/3.txt', (err, data) => {
    console.log(err);
    console.log(data.toString());
  });
}
