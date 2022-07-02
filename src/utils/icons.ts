import { logger } from '../utils/logger';
import { DefxIcos, DefxIcosInfo } from '../utils/types';
import { workspace } from 'coc.nvim';
import path from 'path';

const fileNodeExtensions: Record<string, string> = {
  ai: '',
  awk: '',
  bash: '',
  bat: '',
  bmp: '',
  bzl: '',
  c: '',
  'c++': '',
  cc: '',
  clj: '',
  cljc: '',
  cljs: '',
  coffee: '',
  conf: '',
  cp: '',
  cpp: '',
  cs: '',
  csh: '',
  css: '',
  cxx: '',
  d: '',
  dart: '',
  db: '',
  defx: '',
  diff: '',
  dosbatch: '',
  dirvish: '',
  doc: '',
  dump: '',
  edn: '',
  eex: '',
  ejs: '',
  elm: '',
  erl: '',
  erlang: '',
  ex: '',
  exs: '',
  'f#': '',
  fish: '',
  fs: '',
  fsi: '',
  fsscript: '',
  fsx: '',
  gif: '',
  gitcommit: '',
  gitconfig: '',
  go: '',
  h: '',
  haskell: '',
  hex: '',
  hbs: '',
  help: 'ﬤ',
  man: 'ﬤ',
  hh: '',
  hpp: '',
  hrl: '',
  hs: '',
  htm: '',
  html: '',
  hxx: '',
  ico: '',
  ini: '',
  java: '',
  javascript: '',
  jl: '',
  jpeg: '',
  jpg: '',
  js: '',
  json: '',
  jsx: '',
  ksh: '',
  leaderf: '',
  leex: '',
  less: '',
  lhs: '',
  lua: '',
  mail: '',
  make: '',
  markdown: '',
  md: '',
  mdx: '',
  mjs: '',
  ml: 'λ',
  mli: 'λ',
  mustache: '',
  pdf: '',
  perl: '',
  php: '',
  pl: '',
  pm: '',
  png: '',
  'vim-plug': '',
  pp: '',
  ppt: '',
  proto: '',
  ps1: '',
  psb: '',
  psd: '',
  py: '',
  pyc: '',
  pyd: '',
  pyo: '',
  python: '',
  rb: '',
  rlib: '',
  rmd: '',
  rs: '',
  rss: '',
  ruby: '',
  rust: '',
  sass: '',
  scala: '',
  scheme: 'λ',
  scss: '',
  sh: '',
  slim: '',
  sln: '',
  snippets: '',
  sql: '',
  sshconfig: '',
  styl: '',
  suo: '',
  swift: '',
  t: '',
  tar: '',
  tagbar: '',
  tags: '',
  tex: '',
  text: '',
  tmux: '',
  toml: '',
  ts: '',
  typescript: '',
  tsx: '',
  twig: '',
  vim: '',
  vue: '﵂',
  xcplayground: '',
  xls: '',
  xml: '',
  xul: '',
  yaml: '',
  yml: '',
  zsh: '',
};

const fileNodeExactMatches: Record<string, string> = {
  '.bashprofile': '',
  '.bashrc': '',
  '.ds_store': '',
  '.gitconfig': '',
  '.gitignore': '',
  '.gitlab-ci.yml': '',
  '.gvimrc': '',
  '.vimrc': '',
  '.zshrc': '',
  _gvimrc: '',
  _vimrc: '',
  'docker-compose.yml': '',
  dockerfile: '',
  dropbox: '',
  'exact-match-case-sensitive-1.txt': '1',
  'exact-match-case-sensitive-2': '2',
  'favicon.ico': '',
  'gruntfile.coffee': '',
  'gruntfile.js': '',
  'gruntfile.ls': '',
  'gulpfile.coffee': '',
  'gulpfile.js': '',
  'gulpfile.ls': '',
  license: '',
  'mix.lock': '',
  node_modules: '',
  'package.json': '',
  procfile: '',
  'react.jsx': '',
  tigrc: '',
  'webpack.config.js': 'ﰩ',
};

let defx_has_init: boolean = false;
let defx_icons: DefxIcos | undefined = undefined;
let default_color: number;

async function defx_init() {
  defx_has_init = true;
  let { nvim } = workspace;

  default_color = (await nvim.eval(
    'synIDattr(hlID("Normal"), "fg")'
  )) as number;

  let loaded_defx_icons = (await nvim.eval(
    'get(g:, "loaded_defx_icons")'
  )) as number;

  if (loaded_defx_icons != 1) {
    return;
  }
  defx_icons = (await nvim.eval('defx_icons#get()')) as DefxIcos;

  let colors: Set<number> = new Set();
  for (const i of Object.values(defx_icons.icons.exact_matches)) {
    colors.add(i.term_color);
  }
  for (const i of Object.values(defx_icons.icons.extensions)) {
    colors.add(i.term_color);
  }
  for (const i of Object.values(defx_icons.icons.pattern_matches)) {
    colors.add(i.term_color);
  }
  for (const i of colors) {
    await nvim.command(`hi def DefxIcoFg_${i} ctermfg=${i}`);
  }
}

export async function getDefxIcon(
  filetype: string,
  filepath: string
): Promise<DefxIcosInfo> {
  if (!defx_has_init) {
    await defx_init();
  }

  if (!defx_icons) {
    return {
      term_color: default_color,
      icon: '',
      color: default_color.toString(),
    };
  }

  const filename = path.basename(filepath);
  let info = defx_icons.icons.exact_matches[filename];
  if (info) {
    return info;
  }
  info = defx_icons.icons.extensions[filetype];
  if (info) {
    return info;
  }

  return {
    term_color: default_color,
    icon: '',
    color: default_color.toString(),
  };
}

export function getIcon(filetype: string, filename: string): string {
  let icon = fileNodeExactMatches[filename];
  if (icon) {
    return icon;
  }
  icon = fileNodeExtensions[filetype];
  return icon ? icon : '';
}
