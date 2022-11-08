import { highlightSource } from './highlight';

export async function leader_recv(
  cmd: string,
  ...args: string[]
): Promise<any> {
  if (cmd == 'highlight') {
    await highlightSource();
  }
}
