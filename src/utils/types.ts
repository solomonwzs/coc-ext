export declare type ActionMode = 'popup' | 'echo' | 'replace' | undefined;

export declare type KeymapMode = 'v' | 'n' | undefined;

export declare type Nullable<T> = T | null | undefined;

export interface Execution {
  exec: string;
  args: string[];
}

export interface FormatterSetting {
  provider: string;
  exec?: string;
  args?: string[];
  clangFormStyle?: Record<string, string>;
  prettierOptions?: string[];
  luaFormatOptions?: string[];
}

export interface LangFormatterSetting {
  languages: string[];
  setting: FormatterSetting;
}

export interface CryptoSetting {
  password: string;
  openssl?: string;
  auto_enc?: boolean;
  salt?: boolean;
  includes?: string[];
  excludes?: string[];
}
