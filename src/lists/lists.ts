import {
  BasicList,
  ListAction,
  ListContext,
  ListItem,
  Neovim,
  window,
} from 'coc.nvim';

export default class ExtList extends BasicList {
  public readonly name = 'ext_list';
  public readonly description = 'CocList for coc-solomon-ext';
  public readonly defaultAction = 'open';
  public actions: ListAction[] = [];

  constructor(nvim: Neovim) {
    super(nvim);

    this.addAction('open', (item: ListItem) => {
      window.showMessage(`${item.label}, ${item.data.name}`);
    });
  }

  public async loadItems(context: ListContext): Promise<ListItem[]> {
    return [
      {
        label: 'coc-solomon-ext list item 1',
        data: { name: 'list item 1' },
      },
      {
        label: 'coc-solomon-ext list item 2',
        data: { name: 'list item 2' },
      },
    ];
  }
}
