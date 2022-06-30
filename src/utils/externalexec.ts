import path from 'path';
import { Execution } from './types';
import { spawn, ChildProcessWithoutNullStreams } from 'child_process';

export interface ExternalExecResponse {
  exitCode: number;
  data: Buffer | undefined;
  error: Buffer | undefined;
}

export async function callMultiCmdShell(
  cmd_list: Execution[],
  input?: string | Buffer
): Promise<ExternalExecResponse> {
  if (cmd_list.length == 0) {
    return {
      exitCode: -1,
      data: undefined,
      error: undefined,
    };
  }
  return new Promise((resolve) => {
    const pl: ChildProcessWithoutNullStreams[] = [];
    for (const i of cmd_list) {
      pl.push(spawn(i.exec, i.args, { stdio: ['pipe', 'pipe', 'pipe'] }));
    }
    if (input) {
      pl[0].stdin.write(input);
      pl[0].stdin.end();
    }

    let exitCode = 0;
    const data: Buffer[] = [];
    const error: Buffer[] = [];
    for (let i = 1; i < pl.length; ++i) {
      pl[i - 1].stdout.on('data', (d: Buffer) => {
        pl[i].stdin.write(d);
      });
      pl[i - 1].stderr.on('data', (d: Buffer) => {
        error.push(d);
      });
      pl[i - 1].on('close', (code, signal) => {
        pl[i].stdin.end();
        if (code) {
          exitCode = code;
        }
        if (code != 0 || signal) {
          resolve({
            exitCode,
            data: undefined,
            error: error.length == 0 ? undefined : Buffer.concat(error),
          });
        }
      });
    }

    const last = pl.length - 1;
    pl[last].stdout.on('data', (d: Buffer) => {
      data.push(d);
    });
    pl[last].stderr.on('data', (d: Buffer) => {
      error.push(d);
    });
    pl[last].on('close', (code) => {
      if (code) {
        exitCode = code;
      }
      resolve({
        exitCode,
        data: data.length == 0 ? undefined : Buffer.concat(data),
        error: error.length == 0 ? undefined : Buffer.concat(error),
      });
    });
  });
}

export async function callShell(
  cmd: string,
  args: string[],
  input?: string | Buffer
): Promise<ExternalExecResponse> {
  return new Promise((resolve) => {
    const stdin:CommonSpawnOptions.stdio = input ? 'stdin' : 'ignore';
    const sh = spawn(cmd, args, { stdio: [stdin, 'pipe', 'pipe'] });

    // if (input) {
    //   sh.stdin.write(input);
    //   sh.stdin.end();
    // }

    let exitCode = 0;
    const data: Buffer[] = [];
    const error: Buffer[] = [];

    sh.stdout.on('data', (d: Buffer) => {
      data.push(d);
    });
    sh.stderr.on('data', (d: Buffer) => {
      error.push(d);
    });
    sh.on('close', (code) => {
      if (code) {
        exitCode = code;
      }
      resolve({
        exitCode,
        data: data.length == 0 ? undefined : Buffer.concat(data),
        error: error.length == 0 ? undefined : Buffer.concat(error),
      });
    });
  });
}

export async function callPython(
  pythonDir: string,
  m: string,
  f: string,
  a: any[]
): Promise<ExternalExecResponse> {
  return new Promise((resolve) => {
    const msg = JSON.stringify({ m, f, a });

    let root_dir = process.env.COC_VIMCONFIG;
    if (!root_dir) {
      root_dir = '.';
    }
    const script = path.join(root_dir, pythonDir, 'coc-ext.py');
    const py = spawn('python3', [script], { stdio: ['pipe', 'pipe', 'pipe'] });
    py.stdin.write(msg);
    py.stdin.end();

    let exitCode = 0;
    const data: Buffer[] = [];
    const error: Buffer[] = [];

    py.stdout.on('data', (d: Buffer) => {
      data.push(d);
    });
    py.stderr.on('data', (d: Buffer) => {
      error.push(d);
    });
    py.on('close', (code) => {
      if (code) {
        exitCode = code;
      }
      resolve({
        exitCode,
        data: data.length == 0 ? undefined : Buffer.concat(data),
        error: error.length == 0 ? undefined : Buffer.concat(error),
      });
    });
  });
}
