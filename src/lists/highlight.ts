import { ListAction, ListContext, ListItem, Neovim, BasicList } from 'coc.nvim';
import { HighlightInfo } from '../utils/types';
import { openFile } from '../utils/helper';

export function parse_highlight_info(str: string): HighlightInfo[] {
  let lines = str.split('\n');
  let group_name = '';
  let desc = '';
  let last_set_file = '';
  let line = 0;

  let res: HighlightInfo[] = [];
  for (const l of lines) {
    let arr = l.split(/\s+/);
    if (arr.length > 0 && arr[0].length > 0) {
      if (group_name.length > 0) {
        res.push({
          group_name,
          desc,
          last_set_file,
          line,
        });
      }
      group_name = arr[0];
      if (arr.length > 2) {
        desc = arr.slice(2).join(' ');
      } else {
        desc = '';
      }
      last_set_file = '';
      line = 0;
    } else if (arr.length == 7 && arr[0].length == 0 && arr[1] == 'Last') {
      last_set_file = arr[4];
      line = parseInt(arr[6]);
    } else if (arr.length > 1 && arr[0].length == 0) {
      if (desc.length > 0) {
        desc += ', ';
      }
      desc += arr.slice(1).join(' ');
    }
  }
  if (group_name.length > 0) {
    res.push({
      group_name,
      desc,
      last_set_file,
      line,
    });
  }
  return res;
}

export default class HighlightList extends BasicList {
  public readonly name = 'highlight';
  public readonly description = 'CocList for coc-ext-common (highlight)';
  public readonly defaultAction = 'open';
  public actions: ListAction[] = [];

  constructor(nvim: Neovim) {
    super(nvim);
    this.addAction('open', async (item: ListItem, _context: ListContext) => {
      let fp: string = item.data['last_set_file'];
      if (fp.length == 0) {
        return;
      }
      await openFile(fp, {
        open: 'sp',
        line: item.data['line'],
      });
    });
  }

  public async loadItems(_context: ListContext): Promise<ListItem[] | null> {
    const { nvim } = this;
    let str = await nvim.commandOutput('verbose highlight');
    const hiinfos = parse_highlight_info(str);

    let max_gn_len = 0;
    for (const i of hiinfos) {
      if (i.group_name.length > max_gn_len) {
        max_gn_len = i.group_name.length;
      }
    }

    const res: ListItem[] = [];
    for (const i of hiinfos) {
      const spaces = ' '.repeat(max_gn_len - i.group_name.length + 2);
      const label = `${i.group_name}${spaces}xxx  ${i.desc}  ${i.last_set_file}:${i.line}`;
      const xoffset = i.group_name.length + spaces.length;
      const fnoffset = xoffset + 3 + 2 + i.desc.length + 2;
      res.push({
        label,
        data: { last_set_file: i.last_set_file, line: i.line },
        ansiHighlights: [
          {
            span: [xoffset, xoffset + 3],
            hlGroup: i.group_name,
          },
          {
            span: [fnoffset, label.length],
            hlGroup: 'Comment',
          },
        ],
      });
    }
    return res;
  }
}
