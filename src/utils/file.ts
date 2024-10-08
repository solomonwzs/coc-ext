import fs from 'fs';
import { callShell } from './externalexec';

export interface Stats {
  stats: fs.Stats | undefined;
  error: NodeJS.ErrnoException | undefined;
}

export interface FileData {
  data: Buffer | undefined;
  error: NodeJS.ErrnoException | undefined;
}

export async function fsOpen(
  path: fs.PathLike,
  flags?: fs.OpenMode,
  mode?: fs.Mode,
): Promise<number | NodeJS.ErrnoException> {
  return new Promise((resolve) => {
    fs.open(
      path,
      flags,
      mode,
      (err: NodeJS.ErrnoException | null, fd: number) => {
        err ? resolve(err) : resolve(fd);
      },
    );
  });
}

export async function fsWrite(
  fd: number,
  buf: NodeJS.ArrayBufferView,
): Promise<number | NodeJS.ErrnoException> {
  return new Promise((resolve) => {
    fs.write(
      fd,
      buf,
      (
        err: NodeJS.ErrnoException | null,
        written: number,
        _buffer: NodeJS.ArrayBufferView,
      ) => {
        err ? resolve(err) : resolve(written);
      },
    );
  });
}

export async function fsClose(
  fd: number,
): Promise<number | NodeJS.ErrnoException> {
  return new Promise((resolve) => {
    fs.close(fd, (err: NodeJS.ErrnoException | null) => {
      err ? resolve(err) : resolve(0);
    });
  });
}

export async function fsWriteFile(
  filename: string,
  data: string | NodeJS.ArrayBufferView,
): Promise<Error | null> {
  return new Promise((resolve) => {
    fs.writeFile(filename, data, (err: NodeJS.ErrnoException | null) => {
      if (err == null) {
        resolve(null);
      } else {
        resolve(err);
      }
    });
  });
}

export async function fsAppendFile(
  filename: string,
  data: string | Uint8Array,
): Promise<Error | null> {
  return new Promise((resolve) => {
    fs.appendFile(filename, data, (err: NodeJS.ErrnoException | null) => {
      if (err == null) {
        resolve(null);
      } else {
        resolve(err);
      }
    });
  });
}

export async function fsStat(filename: string): Promise<Stats> {
  return new Promise((resolve) => {
    fs.stat(filename, (error, stats) => {
      if (error == null) {
        resolve({
          stats,
          error: undefined,
        });
      } else {
        resolve({
          stats: undefined,
          error,
        });
      }
    });
  });
}

export async function fsReadFile(filename: string): Promise<FileData> {
  return new Promise((resolve) => {
    fs.readFile(filename, (error, data) => {
      if (error == null) {
        resolve({
          data,
          error: undefined,
        });
      } else {
        resolve({
          data: undefined,
          error,
        });
      }
    });
  });
}

export async function getFilesList(
  dir_path: string,
  cmd?: string,
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
