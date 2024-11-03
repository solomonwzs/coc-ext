import { OutputChannel, window, workspace } from 'coc.nvim';

export class BaseAiChannel {
  protected channel: OutputChannel | null;
  protected bufnr: number;

  constructor() {
    this.channel = null;
    this.bufnr = -1;
  }

  protected async showChannel(name: string, filetye: string) {
    if (!this.channel) {
      this.channel = window.createOutputChannel(name);
    }

    let { nvim } = workspace;
    let winid = await nvim.call('bufwinid', name);
    if (winid == -1) {
      this.channel.show();
      winid = await nvim.call('bufwinid', name);
      this.bufnr = await nvim.call('bufnr', name);
      await nvim.call('coc#compat#execute', [winid, 'setl wrap']);
      await nvim.call('win_execute', [winid, `set ft=${filetye}`]);
    } else {
      await nvim.call('win_gotoid', [winid]);
    }
    await nvim.call('win_execute', [winid, 'norm G']);
  }
}
