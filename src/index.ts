import { commands, CompleteResult, ExtensionContext, listManager, sources, window, workspace } from 'coc.nvim';
import DemoList from './lists';

export async function activate(context: ExtensionContext): Promise<void> {
  context.logger.info(`coc-ext works`);

  context.subscriptions.push(
    commands.registerCommand('ext.text', async (text: string) => {
      window.showMessage(`coc-ext Commands works!`);
    })

    // listManager.registerList(new DemoList(workspace.nvim))

    // sources.createSource({
    //   name: 'coc-ext completion source', // unique id
    //   doComplete: async () => {
    //     const items = await getCompletionItems();
    //     return items;
    //   },
    // })

    // workspace.registerKeymap(
    //   ['n'],
    //   'ext-keymap',
    //   async () => {
    //     window.showMessage(`registerKeymap`);
    //   },
    //   { sync: false }
    // )

    // workspace.registerAutocmd({
    //   event: 'InsertLeave',
    //   request: true,
    //   callback: () => {
    //     window.showMessage(`registerAutocmd on InsertLeave`);
    //   },
    // })
  );
}

// async function getCompletionItems(): Promise<CompleteResult> {
//   return {
//     items: [
//       {
//         word: 'TestCompletionItem 1',
//         menu: '[coc-ext]',
//       },
//       {
//         word: 'TestCompletionItem 2',
//         menu: '[coc-ext]',
//       },
//     ],
//   };
// }
