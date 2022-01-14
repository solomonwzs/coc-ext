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
