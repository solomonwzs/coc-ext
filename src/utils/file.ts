import fs from 'fs';
import { call_shell } from './externalexec';
// import { logger } from './logger';

export interface Stats {
  stats: fs.Stats | undefined;
  error: NodeJS.ErrnoException | undefined;
}

export async function fs_stat(filename: string): Promise<Stats> {
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

export async function get_filelist(
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

  const res = await call_shell(exec, args);
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
