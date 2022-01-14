import { IList, ListAction, ListContext, ListItem, Neovim } from 'coc.nvim';

export default class Commands implements IList {
  public readonly name = 'vimcommand';
  public readonly description = 'CocList for coc-ext-common (command)';
  public readonly defaultAction = 'execute';
  public actions: ListAction[] = [];

  constructor(private nvim: Neovim) {
    this.actions.push({
      name: 'execute',
      execute: async (item) => {
        if (Array.isArray(item)) return;
        const { command, shabang, hasArgs } = item.data;
        if (!hasArgs) {
          nvim.command(command, true);
        } else {
          const feedableCommand = `:${command}${shabang ? '' : ' '}`;
          const mode = await nvim.call('mode');
          const isInsertMode = mode.startsWith('i');
          if (isInsertMode) {
            // For some reason `nvim.feedkeys` doesn't support CSI escapes,
            // even though the docs say it should. So we force the escape
            // here with double backslashes.
            nvim.command(
              `call feedkeys("\\<C-O>${feedableCommand}", 'n')`,
              true
            );
          } else {
            await nvim.feedKeys(feedableCommand, 'n', true);
          }
        }
      },
    });
    this.actions.push({
      name: 'open',
      execute: async (item) => {
        if (Array.isArray(item)) return;
        const { command } = item.data;
        if (!/^[A-Z]/.test(command)) return;
        const res = (await nvim.eval(
          `split(execute("verbose command ${command}"),"\n")[-1]`
        )) as string;
        if (/Last\sset\sfrom/.test(res)) {
          const filepath = res.replace(/^\s+Last\sset\sfrom\s+/, '');
          nvim.command(`edit +/${command} ${filepath}`, true);
        }
      },
    });
  }

  public async loadItems(_context: ListContext): Promise<ListItem[]> {
    const { nvim } = this;
    let list = (await nvim.eval('split(execute("command"),"\n")')) as string[];
    list = list.slice(1);
    const res: ListItem[] = [];
    for (const str of list) {
      const matchArr = str.slice(4).match(/\S+/);
      if (matchArr == null) {
        continue;
      }
      const name = matchArr[0];
      const end = str.slice(4 + name.length);
      res.push({
        label: `${str.slice(0, 4)}${name}\u001b[3m${end}\u001b[23m`,
        filterText: name,
        data: {
          command: name,
          shabang: str.startsWith('!'),
          hasArgs: !end.match(/^\s*0\s/),
        },
      });
    }
    return res;
  }
}
