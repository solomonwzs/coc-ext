import { ListAction, ListContext, ListItem, Neovim, BasicList } from 'coc.nvim';
import { HighlightInfo } from '../utils/types';
import { logger } from '../utils/logger';

function parse_highlight_info(str: string): HighlightInfo[] {
  let lines = str.split('\n');
  let group_name = '';
  let desc = '';
  let last_set_file = '';
  let line = 0;

  let res: HighlightInfo[] = [];
  for (const l of lines) {
    let arr = l.split(/\s+/);
    // logger.debug(arr);
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
  logger.debug(res);

  return res;
}

export default class HighlightList extends BasicList {
  public readonly name = 'highlight';
  public readonly description = 'CocList for coc-ext-common (rg)';
  public readonly defaultAction = 'open';
  public actions: ListAction[] = [];

  constructor(nvim: Neovim) {
    super(nvim);
    this.actions.push({
      name: 'execute',
      execute: async (_item) => {},
    });
  }

  public async loadItems(_context: ListContext): Promise<ListItem[] | null> {
    const { nvim } = this;
    // let list = (await nvim.commandOutput('verbose highlight')) as string[];
    // list = list.slice(1);
    let x = await nvim.commandOutput('verbose highlight');
    parse_highlight_info(x);

    const res: ListItem[] = [];
    // for (const i of list) {
    //   res.push({
    //     label: i,
    //     data: { name: '1' },
    //   });
    // }
    return res;
  }
}
