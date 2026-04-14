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

export enum ArchiveType {
  Unknown,
  GZ,
  BZ,
  RAR,
  SevenZ,
  ZIP,
  CAB,
  LZMA,
  ZSTD,
  LZ4,
  TAR,
  ISO,
}

const archiveSignatures: { sig: number[]; type: ArchiveType }[] = [
  { sig: [0x1f, 0x8b], type: ArchiveType.GZ },
  { sig: [0x42, 0x5a, 0x68], type: ArchiveType.BZ }, // BZh
  { sig: [0xfd, 0x37, 0x7a, 0x58, 0x5a, 0x00], type: ArchiveType.BZ }, // xz
  { sig: [0x52, 0x61, 0x72, 0x21], type: ArchiveType.RAR }, // Rar!
  { sig: [0x37, 0x7a, 0xbc, 0xaf, 0x27, 0x1c], type: ArchiveType.SevenZ },
  { sig: [0x50, 0x4b, 0x03, 0x04], type: ArchiveType.ZIP },
  { sig: [0x4d, 0x53, 0x43, 0x46], type: ArchiveType.CAB }, // MSCF
  { sig: [0x5d, 0x00, 0x00], type: ArchiveType.LZMA },
  { sig: [0x28, 0xb5, 0x2f, 0xfd], type: ArchiveType.ZSTD },
  { sig: [0x04, 0x22, 0x4d, 0x18], type: ArchiveType.LZ4 },
];

const tarMagic = Buffer.from('ustar');
const isoSig = Buffer.from([0x01, 0x43, 0x44, 0x30, 0x30, 0x31]); // \x01CD001

export function quickCheckArchiveType(data: Buffer): ArchiveType {
  if (data.length === 0) {
    return ArchiveType.Unknown;
  }

  for (const { sig, type } of archiveSignatures) {
    if (data.length > sig.length && data.compare(Buffer.from(sig), 0, sig.length, 0, sig.length) === 0) {
      return type;
    }
  }

  // tar: magic at offset 257
  if (data.length > 262 && data.compare(tarMagic, 0, tarMagic.length, 257, 257 + tarMagic.length) === 0) {
    return ArchiveType.TAR;
  }

  // iso: search for signature
  if (data.indexOf(isoSig) !== -1) {
    return ArchiveType.ISO;
  }

  return ArchiveType.Unknown;
}

export enum ImageType {
  Unknown,
  JPG,
  PNG,
  GIF,
  BMP,
  TIF,
  WEBP,
  SVG,
}

export function quickCheckImageType(data: Buffer): ImageType {
  if (data.length < 4) {
    return ImageType.Unknown;
  }

  // GIF: GIF87a or GIF89a
  if (data.length > 6 && (data.compare(Buffer.from('GIF87a'), 0, 6, 0, 6) === 0 ||
      data.compare(Buffer.from('GIF89a'), 0, 6, 0, 6) === 0)) {
    return ImageType.GIF;
  }

  // JPG: FF D8
  if (data[0] === 0xff && data[1] === 0xd8) {
    return ImageType.JPG;
  }

  // PNG: 89 50 4E 47 0D 0A 1A 0A
  const pngSig = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
  if (data.length > 8 && data.compare(pngSig, 0, 8, 0, 8) === 0) {
    return ImageType.PNG;
  }

  // BMP: 'BM'
  if (data[0] === 0x42 && data[1] === 0x4d) {
    return ImageType.BMP;
  }

  // TIF: 49 49 2A 00 (little-endian) or 4D 4D 00 2A (big-endian)
  if ((data[0] === 0x49 && data[1] === 0x49 && data[2] === 0x2a && data[3] === 0x00) ||
      (data[0] === 0x4d && data[1] === 0x4d && data[2] === 0x00 && data[3] === 0x2a)) {
    return ImageType.TIF;
  }

  // WEBP: RIFF....WEBP
  if (data.length > 12 &&
      data.compare(Buffer.from('RIFF'), 0, 4, 0, 4) === 0 &&
      data.compare(Buffer.from('WEBP'), 0, 4, 8, 12) === 0) {
    return ImageType.WEBP;
  }

  // SVG: contains <svg and </svg
  if (data.indexOf('<svg ') !== -1 && data.indexOf('</svg') !== -1) {
    return ImageType.SVG;
  }

  return ImageType.Unknown;
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
