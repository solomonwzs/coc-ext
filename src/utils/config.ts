import { workspace } from 'coc.nvim';

export default function getcfg<T>(
  key: string,
  defaultValue?: T,
): T | undefined {
  const config = workspace.getConfiguration('ext');
  return defaultValue === undefined
    ? undefined
    : config.get<T>(key, defaultValue);
}
