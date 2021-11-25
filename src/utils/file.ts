import fs from 'fs';

export interface Stats {
  stats: fs.Stats | undefined;
  error: NodeJS.ErrnoException | undefined;
}

export namespace fs_ex {
  export async function stat(filename: string): Promise<Stats> {
    return new Promise((resolve) => {
      fs.stat(filename, (err, stats) => {
        if (err == null) {
          resolve({
            stats: stats,
            error: undefined,
          });
        } else {
          resolve({
            stats: undefined,
            error: err,
          });
        }
      });
    });
  }
}
