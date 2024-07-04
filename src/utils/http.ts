import https from 'https';
import http from 'http';

export interface HttpRequestCallback {
  onData?: (chunk: any, msg: http.IncomingMessage) => void;
  onEnd?: (msg: http.IncomingMessage) => void;
  onError?: (err: Error) => void;
  onTimeout?: () => void;
}

interface HttpRequestArgs {
  host: string;
  protocol?: 'http:' | 'https:';
  port?: number;
  headers?: http.OutgoingHttpHeaders;
  method?: string;
  agent?: http.Agent;
  path?: string;
  timeout?: number;
}

export interface HttpRequest {
  args: HttpRequestArgs;
  data?: any;
  proxy?: {
    host: string;
    port: number;
  };
}

export interface HttpResponse {
  statusCode?: number;
  headers?: http.IncomingHttpHeaders;
  body?: Buffer;
  error?: Error;
}

export interface HttpAgent {
  agent?: https.Agent;
  error?: Error;
}

export async function simpleHttpsProxy(
  host: string,
  port: number,
  target_host: string,
): Promise<HttpAgent> {
  return new Promise((resolve) => {
    http
      .request({ host, port, path: target_host, method: 'CONNECT' })
      .on('connect', (resp, socket, _head) => {
        if (resp.statusCode == 200) {
          resolve({ agent: new https.Agent({ socket }) });
        } else {
          resolve({ error: { name: 'ERR_CONN', message: 'connect fail' } });
        }
      })
      .on('error', (error) => {
        resolve({ error });
      })
      .end();
  });
}

export async function simpleHttpRequest(
  opts: http.RequestOptions | https.RequestOptions,
  is_https?: boolean,
  data?: any,
): Promise<HttpResponse> {
  const request = is_https ? https.request : http.request;
  return new Promise((resolve) => {
    const req = request(opts, (resp) => {
      const buf: Buffer[] = [];
      resp
        .on('data', (chunk: Buffer) => {
          buf.push(chunk);
        })
        .on('end', () => {
          resolve({
            statusCode: resp.statusCode,
            headers: resp.headers,
            body: Buffer.concat(buf),
          });
        });
    })
      .on('error', (error) => {
        resolve({
          error,
        });
      })
      .on('timeout', () => {
        resolve({
          error: {
            name: 'ERR_TIMEOUT',
            message: `query ${opts.hostname ? opts.hostname : opts.host} timeout`,
          },
        });
      });
    if (data) {
      req.write(data);
    }
    req.end();
  });
}

async function genHttpRequestArgs(
  req: HttpRequest,
): Promise<HttpRequestArgs | Error> {
  if (!req.proxy) {
    return req.args;
  } else if (req.args.protocol == 'https:') {
    const agent = await simpleHttpsProxy(
      req.proxy.host,
      req.proxy.port,
      `${req.args.host}:${req.args.port ? req.args.port : 443}`,
    );
    if (agent.error) {
      return agent.error;
    }

    const opts = Object.assign({}, req.args);
    opts.agent = agent.agent;
    return opts;
  } else {
    const opts = Object.assign({}, req.args);
    opts.headers = Object.assign({}, req.args.headers);

    var path = `http://${req.args.host}`;
    if (opts.port) {
      path += `:${opts.port}`;
    }
    if (opts.path) {
      path += opts.path;
    }

    opts.host = req.proxy.host;
    opts.port = req.proxy.port;
    opts.path = path;
    opts.headers.Host = req.args.host;
    return opts;
  }
}

export async function sendHttpRequest(req: HttpRequest): Promise<HttpResponse> {
  const res = await genHttpRequestArgs(req);
  if (res instanceof Error) {
    return { error: res };
  } else {
    return simpleHttpRequest(res, req.args.protocol == 'https:', req.data);
  }
}

export async function sendHttpRequestWithCallback(
  req: HttpRequest,
  cb: HttpRequestCallback,
): Promise<null | Error> {
  const res = await genHttpRequestArgs(req);
  if (res instanceof Error) {
    return res;
  } else {
    return new Promise((resolve) => {
      const request =
        req.args.protocol == 'https:' ? https.request : http.request;
      const r = request(res, (resp) => {
        resp
          .on('data', (chunk: Buffer) => {
            if (cb.onData) {
              cb.onData(chunk, resp);
            }
          })
          .on('end', () => {
            if (cb.onEnd) {
              cb.onEnd(resp);
            }
            resolve(null);
          });
      })
        .on('error', (error) => {
          if (cb.onError) {
            cb.onError(error);
          }
          resolve(error);
        })
        .on('timeout', () => {
          if (cb.onTimeout) {
            cb.onTimeout();
          }
          resolve({
            name: 'ERR_TIMEOUT',
            message: `query ${req.args.host} timeout`,
          });
        });

      if (req.data) {
        r.write(req.data);
      }
      r.end();
    });
  }
}
