import http from 'node:http';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { CONFIG, ROOT } from './config.js';
import { answerQuestion } from './answer.js';
import { crmCall, closeCrm } from './mcp-client.js';

const PUBLIC = path.join(ROOT, 'public');
const assets = new Map([
  ['/', ['index.html', 'text/html; charset=utf-8']],
  ['/styles.css', ['styles.css', 'text/css; charset=utf-8']],
  ['/app.js', ['app.js', 'text/javascript; charset=utf-8']],
]);

function json(res, status, data) {
  res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store',
    'X-Content-Type-Options': 'nosniff' });
  res.end(JSON.stringify(data));
}

async function body(req) {
  let raw = '';
  for await (const chunk of req) {
    raw += chunk;
    if (raw.length > 16_384) throw new Error('Слишком большой запрос');
  }
  return JSON.parse(raw || '{}');
}

export function createServer() {
  return http.createServer(async (req, res) => {
    try {
      const url = new URL(req.url || '/', `http://${CONFIG.host}:${CONFIG.port}`);
      if (req.method === 'GET' && url.pathname === '/api/status') {
        return json(res, 200, { modelConfigured: Boolean(CONFIG.cloudApiKey), model: CONFIG.cloudApiKey ? CONFIG.cloudModel : null,
          retrieval: 'local BM25', crm: 'MCP stdio', localOnly: true });
      }
      if (req.method === 'GET' && url.pathname === '/api/projects') {
        return json(res, 200, await crmCall('list_projects', {}));
      }
      if (req.method === 'GET' && url.pathname === '/api/tickets') {
        return json(res, 200, await crmCall('list_tickets', { projectId: url.searchParams.get('project') || '' }));
      }
      if (req.method === 'POST' && url.pathname === '/api/chat') {
        if (!req.headers['content-type']?.startsWith('application/json')) return json(res, 415, { error: 'Ожидается JSON' });
        return json(res, 200, await answerQuestion(await body(req)));
      }
      if (req.method === 'GET' && assets.has(url.pathname)) {
        const [name, type] = assets.get(url.pathname);
        const file = await readFile(path.join(PUBLIC, name));
        res.writeHead(200, { 'Content-Type': type, 'Content-Security-Policy': "default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self' data:; connect-src 'self'; base-uri 'none'; form-action 'self'", 'X-Content-Type-Options': 'nosniff' });
        return res.end(file);
      }
      return json(res, 404, { error: 'Не найдено' });
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Неизвестная ошибка';
      const status = /Некоррект|не найден|Введите|Слишком большой|JSON/.test(message) ? 400 : 500;
      return json(res, status, { error: message });
    }
  });
}

if (process.argv[1] && path.resolve(process.argv[1]) === path.join(ROOT, 'src', 'server.js')) {
  const server = createServer();
  server.listen(CONFIG.port, CONFIG.host, () => {
    process.stdout.write(`Project Support Agent: http://${CONFIG.host}:${CONFIG.port}\n`);
  });
  const shutdown = () => server.close(() => { void closeCrm().finally(() => process.exit(0)); });
  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);
}
