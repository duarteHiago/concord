// Sobe o servidor de verdade num processo à parte, com um banco temporário, e fala com ele pelo HTTP.
// Assim o teste passa pelas mesmas rotas, middlewares e checagens de permissão que o app.
import { spawn, type ChildProcess } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

export interface TestServer {
  url: string;
  stop: () => Promise<void>;
}

export async function startServer(env: Record<string, string> = {}): Promise<TestServer> {
  const dir = mkdtempSync(join(tmpdir(), 'concord-test-'));
  const port = 20000 + Math.floor(Math.random() * 20000);
  const proc: ChildProcess = spawn(process.execPath, ['--disable-warning=ExperimentalWarning', 'src/index.ts'], {
    cwd: fileURLToPath(new URL('..', import.meta.url)),
    env: {
      ...process.env,
      NODE_ENV: 'test',
      HOST: '127.0.0.1',
      PORT: String(port),
      DB_PATH: join(dir, 'concord.db'),
      PUBLIC_DIR: join(dir, 'sem-cliente'),
      JWT_SECRET: 'segredo-dos-testes',
      METRICS_PORT: '0',
      BACKUP_KEEP: '0',
      ...env,
    },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  let log = '';
  proc.stdout!.on('data', (d) => (log += d));
  proc.stderr!.on('data', (d) => (log += d));

  const url = `http://127.0.0.1:${port}`;
  const deadline = Date.now() + 15_000;
  for (;;) {
    if (proc.exitCode !== null) throw new Error(`o servidor saiu ao iniciar:\n${log}`);
    try {
      if ((await fetch(`${url}/health`)).ok) break;
    } catch {
      // ainda subindo
    }
    if (Date.now() > deadline) throw new Error(`o servidor não respondeu em 15 s:\n${log}`);
    await new Promise((r) => setTimeout(r, 100));
  }

  return {
    url,
    stop: async () => {
      const exited = new Promise((r) => proc.once('exit', r));
      proc.kill();
      await exited;
      rmSync(dir, { recursive: true, force: true });
    },
  };
}

export interface Res<T = any> {
  status: number;
  body: T;
}

/** Uma pessoa logada: chama a API com o token dela. */
export class Client {
  token = '';
  id = '';
  username = '';
  base: string;
  constructor(base: string) {
    this.base = base;
  }

  async req<T = any>(method: string, path: string, body?: unknown): Promise<Res<T>> {
    const res = await fetch(`${this.base}/api${path}`, {
      method,
      headers: { 'content-type': 'application/json', ...(this.token ? { authorization: `Bearer ${this.token}` } : {}) },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    const text = await res.text();
    return { status: res.status, body: text ? JSON.parse(text) : null };
  }

  get = <T = any>(path: string) => this.req<T>('GET', path);
  post = <T = any>(path: string, body: unknown = {}) => this.req<T>('POST', path, body);
  patch = <T = any>(path: string, body: unknown) => this.req<T>('PATCH', path, body);
  put = <T = any>(path: string, body: unknown) => this.req<T>('PUT', path, body);
  del = <T = any>(path: string) => this.req<T>('DELETE', path);
}

let seq = 0;

/** Cria uma conta nova e devolve a pessoa já logada. */
export async function signUp(server: TestServer, name = 'pessoa'): Promise<Client> {
  const c = new Client(server.url);
  const username = `${name}_${process.pid}_${++seq}`;
  const res = await c.post('/auth/register', { username, password: 'senha-forte-123' });
  if (res.status !== 200) throw new Error(`cadastro falhou: ${res.status} ${JSON.stringify(res.body)}`);
  c.token = res.body.token;
  c.id = res.body.user.id;
  c.username = username;
  return c;
}
