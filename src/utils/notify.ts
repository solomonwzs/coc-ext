import { window } from 'coc.nvim';

export function showNotification(content: string, title?: string, hl?: string) {
  // window.showNotification({
  //   title: title ? title : undefined,
  //   content: content,
  //   borderhighlight: hl ? hl : undefined,
  // });
  window.showMessage(content);
}
