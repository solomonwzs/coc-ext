import { spawn } from 'child_process';
import { simple_https_request } from './utils/http';
// import { get_call_stack } from './utils/common';
import { RequestOptions } from 'https';

async function http_test(): Promise<void> {
  const opts: RequestOptions = {
    hostname: 'www.google.com',
    method: 'GET',
    timeout: 100,
  };
  const resp = await simple_https_request(opts);
  console.log(resp);
}

http_test();

// const ls = spawn('ls', ['-lh']);

// ls.stdout.on('data', data => {
//   console.log(`stdout: ${data}`);
// });

// ls.stderr.on('data', data => {
//   console.error(`stderr: ${data}`);
// });

// ls.on('close', code => {
//   console.log(`child process exited with code ${code}`);
// });

// const w = new Stream.Writable();
// w._write = function (chunk, enc, done) {
//   console.log(chunk);
//   console.log(enc);
//   done();
// };

// const wc = spawn('wc', [], { stdio: ['pipe', 'pipe', process.stderr] });
// wc.stdin.write([1, 2, 3, 4].toString());
// wc.stdin.end();
// wc.stdout.on('data', data => {
//   console.log(`stdout: ${data}`);
// });
// wc.on('close', code => {
//   console.log(`child process exited with code ${code}`);
// });

const py = spawn('python3', ['/tmp/2.py'], {
  stdio: ['pipe', 'pipe', process.stderr],
});
py.stdin.write('hello');
py.stdin.write('hello');
py.stdin.end();
py.stdout.on('data', data => {
  console.log(`stdout: ${data}`);
});
