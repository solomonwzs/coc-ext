import { ListAction, ListContext, ListItem, Neovim, IList } from 'coc.nvim';
import { callShell } from '../utils/externalexec';
import { showNotification } from '../utils/notify';
import { logger } from '../utils/logger';

export default class RgList implements IList {
  public readonly name = 'rg';
  public readonly description = 'CocList for coc-ext-common (rg)';
  public readonly defaultAction = 'execute';
  public actions: ListAction[] = [];

  constructor(private nvim: Neovim) {
    this.actions.push({
      name: 'execute',
      execute: async (_item) => {},
    });
  }

  public async loadItems(context: ListContext): Promise<ListItem[] | null> {
    const { nvim } = this;
    logger.debug(context.args);
    const items: ListItem[] = [];
    if (context.args.length == 0) {
      return null;
    }

    const args = [context.args[0], '--files-with-matches', '--color', 'never'];
    let resp = await callShell('rg', args);
    if (resp.exitCode != 0) {
      logger.error('rg fail');
      if (resp.error) {
        showNotification(resp.error.toString());
      }
      return null;
    }
    return null;

    // if (!resp.data) {
    //   logger.error('no data');
    //   return null;
    // }

    // let list = resp.data.toString().split('\n');
    // logger.debug(list);
    // return null;

    //     let list = (await nvim.eval('split(execute("map"),"\n")')) as string[];
    //     list = list.slice(1);

    //     const res: ListItem[] = [];
    //     for (const i of list) {
    //       res.push({
    //         label: i,
    //         data: { name: '1' },
    //       });
    //     }
    //     return res;
  }
}
