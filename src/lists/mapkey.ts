import { ListAction, ListContext, ListItem, Neovim, IList } from 'coc.nvim';
// import { logger } from '../utils/logger';

export default class MapkeyList implements IList {
  public readonly name = 'vimmapkey';
  public readonly description = 'CocList for coc-ext-common (map key)';
  public readonly defaultAction = 'execute';
  public actions: ListAction[] = [];

  constructor(private nvim: Neovim) {
    this.actions.push({
      name: 'execute',
      execute: async (_item) => {},
    });
  }

  public async loadItems(_context: ListContext): Promise<ListItem[]> {
    const { nvim } = this;
    let list = (await nvim.eval('split(execute("map"),"\n")')) as string[];
    list = list.slice(1);

    const res: ListItem[] = [];
    for (const i of list) {
      res.push({
        label: i,
        data: { name: '1' },
      });
    }
    return res;
  }
}
