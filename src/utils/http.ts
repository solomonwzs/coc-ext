import https from 'https';

export interface HttpResponse {
  statusCode: number | undefined;
  data: Buffer | undefined;
  error: Error | undefined;
}

export async function simple_https_request(
  opts: https.RequestOptions,
  data?: any,
): Promise<HttpResponse> {
  return new Promise(resolve => {
    const req = https
      .request(opts, resp => {
        const buf: Buffer[] = [];
        resp.on('data', (chunk: Buffer) => {
          buf.push(chunk);
        });
        resp.on('end', () => {
          resolve({
            statusCode: resp.statusCode,
            data: Buffer.concat(buf),
            error: undefined,
          });
        });
      })
      .on('error', err => {
        resolve({
          statusCode: undefined,
          data: undefined,
          error: err,
        });
      });
    if (data) {
      req.write(data);
    }
    req.end();
  });
}
