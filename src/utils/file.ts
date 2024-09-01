import fs from 'fs';
import { callShell } from './externalexec';
import { CocExtErrnoError } from '../utils/common';

export async function fsAccess(
  path: fs.PathLike,
  mode: number | undefined,
): Promise<null | CocExtErrnoError> {
  return new Promise((resolve) => {
    fs.access(path, mode, (err: NodeJS.ErrnoException | null) => {
      err ? resolve(new CocExtErrnoError(err)) : resolve(null);
    });
  });
}

export async function fsMkdir(
  path: fs.PathLike,
  opts?: fs.MakeDirectoryOptions,
): Promise<null | CocExtErrnoError> {
  return new Promise((resolve) => {
    fs.mkdir(path, opts, (err: NodeJS.ErrnoException | null) => {
      err ? resolve(new CocExtErrnoError(err)) : resolve(null);
    });
  });
}

export async function fsOpen(
  path: fs.PathLike,
  flags?: fs.OpenMode,
  mode?: fs.Mode,
): Promise<number | CocExtErrnoError> {
  return new Promise((resolve) => {
    fs.open(
      path,
      flags,
      mode,
      (err: NodeJS.ErrnoException | null, fd: number) => {
        err ? resolve(new CocExtErrnoError(err)) : resolve(fd);
      },
    );
  });
}

export async function fsWrite(
  fd: number,
  buf: NodeJS.ArrayBufferView,
): Promise<number | CocExtErrnoError> {
  return new Promise((resolve) => {
    fs.write(
      fd,
      buf,
      (
        err: NodeJS.ErrnoException | null,
        written: number,
        _buffer: NodeJS.ArrayBufferView,
      ) => {
        err ? resolve(new CocExtErrnoError(err)) : resolve(written);
      },
    );
  });
}

export async function fsClose(fd: number): Promise<null | CocExtErrnoError> {
  return new Promise((resolve) => {
    fs.close(fd, (err: NodeJS.ErrnoException | null) => {
      err ? resolve(new CocExtErrnoError(err)) : resolve(null);
    });
  });
}

export async function fsWriteFile(
  filename: string,
  data: string | NodeJS.ArrayBufferView,
): Promise<null | CocExtErrnoError> {
  return new Promise((resolve) => {
    fs.writeFile(filename, data, (err: NodeJS.ErrnoException | null) => {
      err ? resolve(new CocExtErrnoError(err)) : resolve(null);
    });
  });
}

export async function fsAppendFile(
  filename: string,
  data: string | Uint8Array,
): Promise<null | CocExtErrnoError> {
  return new Promise((resolve) => {
    fs.appendFile(filename, data, (err: NodeJS.ErrnoException | null) => {
      err ? resolve(new CocExtErrnoError(err)) : resolve(null);
    });
  });
}

export async function fsStat(
  filename: string,
): Promise<fs.Stats | CocExtErrnoError> {
  return new Promise((resolve) => {
    fs.stat(filename, (err: NodeJS.ErrnoException | null, stats: fs.Stats) => {
      err ? resolve(new CocExtErrnoError(err)) : resolve(stats);
    });
  });
}

export async function fsReadFile(
  filename: string,
): Promise<Buffer | CocExtErrnoError> {
  return new Promise((resolve) => {
    fs.readFile(filename, (err: NodeJS.ErrnoException | null, data: Buffer) => {
      err ? resolve(new CocExtErrnoError(err)) : resolve(data);
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
