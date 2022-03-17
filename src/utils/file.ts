import fs from 'fs';
import { callShell } from './externalexec';
// import { logger } from './logger';

export interface Stats {
  stats: fs.Stats | undefined;
  error: NodeJS.ErrnoException | undefined;
}

export async function fsStat(filename: string): Promise<Stats> {
  return new Promise((resolve) => {
    fs.stat(filename, (err, stats) => {
      if (err == null) {
        resolve({
          stats: stats,
          error: undefined,
        });
      } else {
        resolve({
          stats: undefined,
          error: err,
        });
      }
    });
  });
}

export async function getFilesList(
  dir_path: string,
  cmd?: string
): Promise<string[] | null> {
  let args: string[];
  let exec: string;
  if (cmd == 'rg') {
    exec = cmd;
    args = ['--color', 'never', '--files', dir_path];
  } else if (cmd == 'find' || cmd == undefined) {
    exec = 'find';
    args = [dir_path, '-type', 'f'];
  } else {
    return null;
  }

  const res = await callShell(exec, args);
  if (res.exitCode != 0) {
    if (res.error) {
      // logger.error(res.error.toString());
    }
    return null;
  }
  if (res.data) {
    return res.data.toString().trimEnd().split('\n');
  }
  return null;
}
