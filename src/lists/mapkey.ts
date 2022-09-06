import { ListAction, ListContext, ListItem, Neovim, BasicList } from 'coc.nvim';
import { MapkeyInfo } from '../utils/types';
import { openFile } from '../utils/helper';

function parse_mapkey_info(str: string): MapkeyInfo[] {
  let lines = str.split('\n');
  let mode = '';
  let key = '';
  let desc = '';
  let last_set_file = '';
  let line = 0;

  let res: MapkeyInfo[] = [];
  for (const l of lines) {
    let arr = l.split(/\s+/);
    if (arr.length == 7 && arr[0].length == 0 && arr[1] == 'Last') {
      last_set_file = arr[4];
      line = parseInt(arr[6]);
    } else if (arr.length >= 3) {
      if (key.length > 0) {
        res.push({
          mode: mode.length == 0 ? ' ' : mode,
          key,
          desc,
          last_set_file,
          line,
        });
      }
      mode = arr[0];
      key = arr[1];
      desc = arr.slice(2).join(' ');
      last_set_file = '';
      line = 0;
    }
  }
  if (key.length > 0) {
    res.push({
      mode: mode.length == 0 ? ' ' : mode,
      key,
      desc,
      last_set_file,
      line,
    });
  }
  return res;
}

export default class MapkeyList extends BasicList {
  public readonly name = 'mapkey';
  public readonly description = 'CocList for coc-ext-common (mapkey)';
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

  public async loadItems(_context: ListContext): Promise<ListItem[]> {
    const { nvim } = this;
    let str = await nvim.commandOutput('verbose map');
    const mapinfos = parse_mapkey_info(str);

    let max_key_len = 0;
    for (const i of mapinfos) {
      if (i.key.length > max_key_len) {
        max_key_len = i.key.length;
      }
    }

    const res: ListItem[] = [];
    for (const i of mapinfos) {
      const spaces = ' '.repeat(max_key_len - i.key.length + 2);
      const label = `${i.mode}  ${i.key}${spaces}${i.desc}  ${i.last_set_file}:${i.line}`;
      const keyoffset = 3;
      const fnoffset =
        keyoffset + i.key.length + spaces.length + i.desc.length + 2;
      res.push({
        label,
        data: { last_set_file: i.last_set_file, line: i.line },
        ansiHighlights: [
          { span: [0, 1], hlGroup: 'Define' },
          { span: [keyoffset, keyoffset + i.key.length], hlGroup: 'Special' },
          { span: [fnoffset, label.length], hlGroup: 'Comment' },
        ],
      });
    }
    return res;
  }
}
