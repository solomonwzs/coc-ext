import { spawn } from 'child_process';
import { getRandomId } from '../utils/common';
import { callShell } from '../utils/externalexec';

export function pythonTest() {
  const py = spawn('python3', ['/tmp/2.py'], {
    stdio: ['pipe', 'pipe', process.stderr],
  });
  py.stdin.write('hello');
  py.stdin.write('hello');
  py.stdin.end();
  py.stdout.on('data', (data) => {
    console.log(`stdout: ${data}`);
  });
}

export async function callTest() {
  // const style = {
  //   BasedOnStyle: 'Google',
  //   AllowShortFunctionsOnASingleLine: 'Inline',
  // };
  // const resp = await callShell(
  //   'clang-format',
  //   ['-style', JSON.stringify(style)],
  //   'int main() { return 0;}'
  // );
  // if (resp.exitCode == 0 && resp.data) {
  //   console.log(resp.data.toString());
  // }
  // const res = await callMultiCmdShell([
  //   {
  //     exec: 'find',
  //     args: ['/home/solomon/tmp/note', '-type', 'f'],
  //   },
  //   {
  //     exec: 'grep',
  //     args: ['json'],
  //   },
  // ]);
  const res = await callShell('rg', ['list']);
  console.log(res);
  if (res.data) {
    console.log(res.data.toString());
  }
  if (res.error) {
    console.log(res.error.toString());
  }
}

export function utilsTest() {
  console.log(getRandomId('x'));

  const trafficID = Array.from({ length: 20 }, () =>
    Math.floor(Math.random() * 36).toString(36),
  ).join('');
  console.log(trafficID);

  console.log(process.env);
}
