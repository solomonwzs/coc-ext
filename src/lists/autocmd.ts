import { ListAction, ListContext, ListItem, Neovim, BasicList } from 'coc.nvim';
import { AutocmdInfo } from '../utils/types';
import { logger } from '../utils/logger';

export interface AutocmdGroupInfo {
  group: string;
  event: string;
  info: AutocmdInfo[];
}

export function parse_autocmd_info(str: string): AutocmdGroupInfo[] {
  let lines = str.split('\n');
  let group = '';
  let event = '';
  let pattern = '';
  let setting = '';
  let file = '';
  let line = 0;

  let parse_part = -1;
  for (const l of lines) {
    let arr = l.split(/\s+/);
    if (arr.length == 2 && arr[0] != '') {
      parse_part = 0;

      group = arr[0];
      event = arr[1];
      logger.debug([group, event]);
    }
  }
  return [];
}

export default class AutocmdList extends BasicList {
  public readonly name = 'autocmd';
  public readonly description = 'CocList for coc-ext-common (autocmd)';
  public readonly defaultAction = 'open';
  public actions: ListAction[] = [];

  constructor(nvim: Neovim) {
    super(nvim);
  }

  public async loadItems(_context: ListContext): Promise<ListItem[] | null> {
    const { nvim } = this;
    let str = await nvim.commandOutput('verbose autocmd');
    const infos = parse_autocmd_info(str);

    const res: ListItem[] = [];
    return res;
  }
}
