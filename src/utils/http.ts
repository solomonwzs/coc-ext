import https from 'https';
import http from 'http';
// import { logger } from './logger';

export interface HttpRequest {
  args: http.ClientRequestArgs;
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
  target_host: string
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
  data?: any
): Promise<HttpResponse> {
  const host = opts.hostname ? opts.hostname : opts.host;
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
          error: { name: 'ERR_TIMEOUT', message: `query ${host} timeout` },
        });
      });
    if (data) {
      req.write(data);
    }
    req.end();
  });
}

export async function sendHttpRequest(req: HttpRequest): Promise<HttpResponse> {
  const host = req.args.hostname ? req.args.hostname : req.args.host;
  if (!host) {
    return { error: { name: 'ERR_PARA', message: 'no host' } };
  }
  const is_https = req.args.protocol == 'https:';
  if (!req.proxy) {
    return await simpleHttpRequest(req.args, is_https, req.data);
  } else if (is_https) {
    const agent = await simpleHttpsProxy(
      req.proxy.host,
      req.proxy.port,
      `${host}:${req.args.port ? req.args.port : 443}`
    );
    if (agent.error) {
      return { error: agent.error };
    }

    const opts = Object.assign({}, req.args);
    opts.agent = agent.agent;
    return await simpleHttpRequest(opts, is_https, req.data);
  } else {
    const opts = Object.assign({}, req.args);
    opts.headers = Object.assign({}, req.args.headers);

    var path = `${is_https ? 'https' : 'http'}://${host}`;
    if (opts.port) {
      path += `:${opts.port}`;
    }
    if (opts.path) {
      path += opts.path;
    }

    opts.host = req.proxy.host;
    opts.port = req.proxy.port;
    opts.path = path;
    opts.headers.Host = host;
    return await simpleHttpRequest(opts, is_https, req.data);
  }
}
