import {
  BasicList,
  ListAction,
  ListContext,
  ListItem,
  Neovim,
  window,
} from 'coc.nvim';
import {logger} from '../utils/logger';

export default class CommandsList extends BasicList {
  public readonly name = 'cmd_list';
  public readonly description = 'CocList for coc-ext (commands)';
  public readonly defaultAction = 'execute';
  public actions: ListAction[] = [];

  constructor(nvim: Neovim) {
    super(nvim);
  }

  public async loadItems(context: ListContext): Promise<ListItem[]> {
    const { nvim } = this;
    const list = (await nvim.eval('split(execute("command"),"\n")')) as string[];
    return [];
  }
}
