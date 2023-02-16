import { highlightSource } from './highlight';

export async function leader_recv(
  cmd: string,
  ..._args: string[]
): Promise<any> {
  if (cmd == 'highlight') {
    await highlightSource();
  }
}
