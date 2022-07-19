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
  args?: string[] | Record<string, string>;
}

export interface LangFormatterSetting {
  languages: string[];
  setting: FormatterSetting;
}

export interface CryptoSetting {
  password: string;
  openssl?: string;
  autoEnc?: boolean;
  salt?: boolean;
  includes?: string[];
  excludes?: string[];
}

export interface SimpleSymbolInfo {
  name: string;
  short_name: string;
  detail?: string;
  kind: string;
  icon: string;
}

export interface DefxIcosInfo {
  term_color: number;
  icon: string;
  color: string;
  hlGroup?: string;
}

export interface DefxIcos {
  icons: {
    extensions: Map<string, DefxIcosInfo>;
    exact_matches: Map<string, DefxIcosInfo>;
    pattern_matches: Map<string, DefxIcosInfo>;
  };
  setting: Map<string, number>;
}

export interface HighlightInfo {
  group_name: string;
  desc: string;
  last_set_file: string;
  line: number;
}
