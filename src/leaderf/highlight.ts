import { workspace } from 'coc.nvim';
import { parse_highlight_info } from '../lists/highlight';

export async function highlight_source(): Promise<any> {
  const { nvim } = workspace;
  let str = await nvim.commandOutput('verbose highlight');
  const hiinfos = parse_highlight_info(str);

  let lines: string[] = [];
  for (const i of hiinfos) {
    lines.push(`${i.group_name}  ${i.desc}  ${i.last_set_file}:${i.line}`);
  }

  nvim.setVar('coc_leader_highlight', lines);
}
