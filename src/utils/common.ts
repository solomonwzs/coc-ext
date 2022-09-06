import path from 'path';

export interface CallStack {
  file: string;
  line: number;
}

export function get_call_stack(): CallStack[] {
  const res: CallStack[] = [];
  const stack = new Error().stack?.split('\n');
  const re = /at ((.*) \()?([^:]+):(\d+):(\d+)\)?/g;
  if (stack) {
    for (const i in stack) {
      const expl = re.exec(stack[i]);
      if (expl) {
        res.push({
          file: path.basename(expl[3]),
          line: parseInt(expl[4]),
        });
      }
    }
  }
  return res;
}

export function stringify(value: any): string {
  if (typeof value === 'string') {
    return value;
  } else if (value instanceof String) {
    return value.toString();
  } else {
    return JSON.stringify(value, null, 2);
  }
}

export function pad(n: string, total: number): string {
  const l = total - n.length;
  if (l <= 0) {
    return '';
  }
  return new Array(l).fill(' ').join('');
}

export function get_random_id(scope?: string, sep: string = '-'): string {
  const ts = new Date().getTime().toString(16).slice(-8);
  let r = Math.floor(Math.random() * 0xffff).toString(16);
  r = '0'.repeat(4 - r.length) + r;
  return scope && scope.length > 0
    ? `${scope}${sep}${ts}${sep}${r}`
    : `${ts}${sep}${r}`;
}

export function str_find_first_of(str: string, ch: Set<string>): number {
  for (let i = 0; i < str.length; ++i) {
    if (ch.has(str[i])) {
      return i;
    }
  }
  return -1;
}

export function str_find_first_not_of(str: string, ch: Set<string>): number {
  for (let i = 0; i < str.length; ++i) {
    if (!ch.has(str[i])) {
      return i;
    }
  }
  return -1;
}
