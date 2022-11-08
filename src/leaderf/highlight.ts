import { workspace } from 'coc.nvim';
import { parseHighlightInfo } from '../lists/highlight';
import { getRandomId } from '../utils/common';
// import { logger } from '../utils/logger';

export async function highlightSource(): Promise<any> {
  const { nvim } = workspace;
  let str = await nvim.exec('verbose highlight', true);
  const hiinfos = parseHighlightInfo(str);

  let max_gn_len = 0;
  for (const i of hiinfos) {
    if (i.group_name.length > max_gn_len) {
      max_gn_len = i.group_name.length;
    }
  }

  let lines: string[] = [];
  for (const i of hiinfos) {
    const spaces = ' '.repeat(max_gn_len - i.group_name.length + 2);
    lines.push(
      `${i.group_name}${spaces}xxx  ${i.desc}  <${i.last_set_file}:${i.line}>`
    );
  }

  const var_name = getRandomId('__coc_leader_highligt', '_');
  await nvim.setVar(var_name, lines);
  await nvim.command(`Leaderf! highlight ${var_name}`);
}
