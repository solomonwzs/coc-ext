import { spawn } from 'child_process';
import path from 'path';

export interface ExternalExecResponse {
  exitCode: number;
  data: Buffer | undefined;
  error: Buffer | undefined;
}

export async function call_shell(
  cmd: string,
  args: string[],
  input?: string | Buffer,
): Promise<ExternalExecResponse> {
  return new Promise(resolve => {
    const sh = spawn(cmd, args, { stdio: ['pipe', 'pipe', 'pipe'] });

    if (input) {
      sh.stdin.write(input);
      sh.stdin.end();
    }

    let exitCode = 0;
    const data: Buffer[] = [];
    const error: Buffer[] = [];

    sh.stdout.on('data', (d: Buffer) => {
      data.push(d);
    });
    sh.stderr.on('data', (d: Buffer) => {
      error.push(d);
    });
    sh.on('close', code => {
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

export async function call_python(
  module: string,
  func: string,
  args: any[],
): Promise<ExternalExecResponse> {
  return new Promise(resolve => {
    const msg = JSON.stringify({
      module,
      func,
      args,
    });

    let root_dir = process.env.COC_VIMCONFIG;
    if (!root_dir) {
      root_dir = '.';
    }
    const script = path.join(root_dir, 'pythonx', 'coc-ext.py');
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
    py.on('close', code => {
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
