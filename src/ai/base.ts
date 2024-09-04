import { OutputChannel, window, workspace } from 'coc.nvim';
import { Tiktoken } from 'tiktoken';
import fs from 'fs';
import os from 'os';
import path from 'path';
import { fsAccess, fsMkdir, fsReadFile } from '../utils/file';
import { simpleHttpDownloadFile } from '../utils/http';
import { logger } from '../utils/logger';

async function cache_file_path(name: string) {
  const cache_dir = path.join(os.homedir(), '.cache');
  if (
    (await fsAccess(cache_dir, fs.constants.F_OK)) != null &&
    (await fsMkdir(cache_dir)) != null
  ) {
    return path.join('/tmp', name);
  }
  return path.join(cache_dir, name);
}

export class TiktokenCore {
  protected core: Tiktoken | null;

  constructor(protected model: string) {
    this.core = null;
  }

  public async setup() {
    if (this.core != null) {
      return;
    }

    var download_url = '';
    var tiktoken_file = '';
    if (this.model.startsWith('gpt-4o')) {
      download_url =
        'https://openaipublic.blob.core.windows.net/encodings/cl100k_base.tiktoken';
      tiktoken_file = await cache_file_path('cl100k.tiktkoen');
    } else {
      download_url =
        'https://openaipublic.blob.core.windows.net/encodings/o200k_base.tiktoken';
      tiktoken_file = await cache_file_path('o200k.tiktkoen');
    }

    if ((await fsAccess(tiktoken_file, fs.constants.R_OK)) != null) {
      if ((await simpleHttpDownloadFile(download_url, tiktoken_file)) == -1) {
        logger.error(`download fail, ${download_url}`);
        return;
      }
    }

    const buf = await fsReadFile(tiktoken_file);
    if (buf instanceof Error) {
      logger.error(`read tiktoken fail, ${buf.message}`);
      return;
    }

    this.core = new Tiktoken(
      buf.toString('utf-8'),
      {
        '<|endoftext|>': 100257,
        '<|fim_prefix|>': 100258,
        '<|fim_middle|>': 100259,
        '<|fim_suffix|>': 100260,
        '<|endofprompt|>': 100276,
      },
      "(?i:'s|'t|'re|'ve|'m|'ll|'d)|[^\\r\\n\\p{L}\\p{N}]?\\p{L}+|\\p{N}{1,3}| ?[^\\s\\p{L}\\p{N}]+[\\r\\n]*|\\s*[\\r\\n]+|\\s+(?!\\S)|\\s+",
    );
  }

  public encode(prompt: string): null | Uint32Array {
    if (this.core == null) {
      return null;
    }
    return this.core.encode(prompt);
  }

  public count(prompt: string): null | number {
    return this.core == null
      ? Math.ceil(prompt.length * 0.5)
      : this.core.encode(prompt).length;
  }
}

export class BaseAiChannel {
  protected channel: OutputChannel | null;
  protected bufnr: number;

  constructor() {
    this.channel = null;
    this.bufnr = -1;
  }

  protected async showChannel(name: string, filetye: string) {
    if (!this.channel) {
      this.channel = window.createOutputChannel(name);
    }

    let { nvim } = workspace;
    let winid = await nvim.call('bufwinid', name);
    if (winid == -1) {
      this.channel.show();
      winid = await nvim.call('bufwinid', name);
      this.bufnr = await nvim.call('bufnr', name);
      await nvim.call('coc#compat#execute', [winid, 'setl wrap']);
      await nvim.call('win_execute', [winid, `set ft=${filetye}`]);
    } else {
      await nvim.call('win_gotoid', [winid]);
    }
    await nvim.call('win_execute', [winid, 'norm G']);
  }
}
