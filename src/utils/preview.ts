import { ProviderResult } from 'coc.nvim';
import { createHash } from 'crypto';
import { spawn } from 'child_process';
import { TextDecoder } from 'util';
import os from 'os';
import path from 'path';
import { getText, popup, ScratchWindow } from './helper';
import {
  quickCheckImageType,
  ImageType,
  quickCheckArchiveType,
  ArchiveType,
  fsWriteFile,
} from './file';
import { callShell } from './externalexec';
import { logger } from './logger';

const base64ScratchWindow = new ScratchWindow('BASE64 DECODE', 'text');

function getArchiveListCmd(type: ArchiveType, file: string): { cmd: string; args: string[] } | null {
  switch (type) {
    case ArchiveType.GZ:
    case ArchiveType.BZ:
    case ArchiveType.TAR:
    case ArchiveType.LZMA:
    case ArchiveType.ZSTD:
    case ArchiveType.LZ4:
      return { cmd: 'tar', args: ['tf', file] };
    case ArchiveType.ZIP:
      return { cmd: 'unzip', args: ['-l', file] };
    case ArchiveType.RAR:
      return { cmd: 'unrar', args: ['l', file] };
    case ArchiveType.SevenZ:
      return { cmd: '7z', args: ['l', file] };
    case ArchiveType.CAB:
      return { cmd: 'cabextract', args: ['-l', file] };
    case ArchiveType.ISO:
      return { cmd: 'iso-info', args: ['-l', '-i', file] };
    default:
      return null;
  }
}

function isPrintableBuffer(buf: Buffer): boolean {
  for (let i = 0; i < buf.length; i++) {
    const b = buf[i];
    if (b < 0x20 && b !== 0x09 && b !== 0x0a && b !== 0x0d) {
      return false;
    }
    if (b === 0x7f) {
      return false;
    }
  }
  return true;
}

function decodeBufferToString(buf: Buffer): string {
  try {
    return new TextDecoder('utf-8', { fatal: true }).decode(buf);
  } catch {
    return new TextDecoder('gbk').decode(buf);
  }
}

async function saveTempFile(buf: Buffer, md5: string): Promise<string | null> {
  const file = path.join(os.tmpdir(), `coc-ext-preview-${md5}`);
  const err = await fsWriteFile(file, buf);
  if (err) {
    logger.error(`write temp file failed: ${err}`);
    return null;
  }
  return file;
}

export function decodeBase64Fn(): () => ProviderResult<any> {
  return async () => {
    const text = await getText('v');
    try {
      const buf = Buffer.from(text, 'base64');
      const md5 = createHash('md5').update(buf).digest('hex');

      const imageType = quickCheckImageType(buf);
      if (imageType !== ImageType.Unknown) {
        const file = await saveTempFile(buf, md5);
        if (!file) return;
        const child = spawn('display', [file], {
          detached: true,
          stdio: 'ignore',
        });
        child.unref();
        return;
      }

      const archiveType = quickCheckArchiveType(buf);
      if (archiveType !== ArchiveType.Unknown) {
        const file = await saveTempFile(buf, md5);
        if (!file) return;
        const listCmd = getArchiveListCmd(archiveType, file);
        if (!listCmd) return;
        const res = await callShell(listCmd.cmd, listCmd.args);
        const header = [
          `Size: ${buf.length} bytes | Format: ${ArchiveType[archiveType]} | MD5: ${md5}`,
          '---',
        ];
        if (res.exitCode === 0 && res.data) {
          const lines = res.data.toString('utf8').split('\n');
          await base64ScratchWindow.open([...header, ...lines]);
        } else {
          await base64ScratchWindow.open([...header, `error: ${res.error?.toString('utf8')}`]);
        }
        return;
      }

      if (isPrintableBuffer(buf)) {
        const decoded = decodeBufferToString(buf);
        await base64ScratchWindow.open(decoded.split('\n'));
      } else {
        const file = await saveTempFile(buf, md5);
        if (!file) return;
        const res = await callShell('file', ['--mime', '--brief', file]);
        const mimeInfo = res.exitCode === 0 && res.data
          ? res.data.toString('utf8').trim()
          : 'unknown';
        const info = `File: ${file}\nSize: ${buf.length} bytes\nMD5: ${md5}\nMIME: ${mimeInfo}`;
        popup(info, '[BASE64 DECODE]');
      }
    } catch (e) {
      logger.error(`base64 decode failed: ${e}`);
    }
  };
}
