import http from 'node:http';
import { randomUUID, timingSafeEqual } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { CONFIG, ROOT } from './config.js';
import { answerQuestion } from './answer.js';
import { crmCall, closeCrm } from './mcp-client.js';

const PUBLIC = path.join(ROOT, 'public');
const assets = new Map([
  ['/', ['index.html', 'text/html; charset=utf-8']],
  ['/admin', ['admin.html', 'text/html; charset=utf-8']],
  ['/styles.css', ['styles.css', 'text/css; charset=utf-8']],
  ['/app.js', ['app.js', 'text/javascript; charset=utf-8']],
  ['/admin.js', ['admin.js', 'text/javascript; charset=utf-8']],
]);
const managerSessions = new Map();

function json(res, status, data, headers = {}) {
  res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store',
    'X-Content-Type-Options': 'nosniff', ...headers });
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

function cookie(req, name) {
  return req.headers.cookie?.split(';').map((part) => part.trim()).find((part) => part.startsWith(`${name}=`))?.slice(name.length + 1);
}
function visitor(req, res) {
  const existing = cookie(req, 'ps_visitor');
  if (existing && /^[a-f0-9-]{36}$/.test(existing)) return existing;
  const id = randomUUID();
  res.setHeader('Set-Cookie', `ps_visitor=${id}; HttpOnly; SameSite=Strict; Path=/; Max-Age=2592000`);
  return id;
}
function manager(req) {
  const token = cookie(req, 'ps_manager');
  const expiry = managerSessions.get(token);
  if (!expiry || expiry < Date.now()) return false;
  return true;
}
function passwordMatches(value) {
  if (!configuredAdmin() || typeof value !== 'string') return false;
  const entered = Buffer.from(value);
  const expected = Buffer.from(CONFIG.adminPassword);
  return entered.length === expected.length && timingSafeEqual(entered, expected);
}
function configuredAdmin() {
  return CONFIG.adminPassword.length >= 12 && CONFIG.adminPassword !== 'replace-with-a-long-random-password';
}
export function wantsHuman(text) {
  return /(?:позов|приглас|соедин|свяж|связ|переключ|передай|перевед|поговор|подключ).{0,45}(?:оператор|менеджер|человек|поддержк)|(?:хочу|нужен|нужна|дайте|требуется).{0,45}(?:оператор|менеджер|человек)|^(?:оператор|живой человек)[.!?\s]*$|(?:human agent|talk to (?:a )?person|contact support)/i.test(text);
}
function sameOrigin(req) {
  const origin = req.headers.origin;
  if (!origin) return true;
  try { const parsed = new URL(origin); return parsed.host === req.headers.host && ['http:', 'https:'].includes(parsed.protocol); }
  catch { return false; }
}

export function createServer() {
  return http.createServer(async (req, res) => {
    try {
      const url = new URL(req.url || '/', `http://${CONFIG.host}:${CONFIG.port}`);
      if (!/^(?:127\.0\.0\.1|localhost|\[::1\]):\d+$/.test(req.headers.host || '')) return json(res, 403, { error: 'Недопустимый адрес сервиса' });
      if (req.method === 'POST' && !sameOrigin(req)) return json(res, 403, { error: 'Недопустимый источник запроса' });
      if (req.method === 'POST' && !req.headers['content-type']?.startsWith('application/json')) return json(res, 415, { error: 'Ожидается JSON' });
      if (req.method === 'GET' && url.pathname === '/api/status') {
        return json(res, 200, { modelConfigured: Boolean(CONFIG.cloudApiKey), model: CONFIG.cloudApiKey ? CONFIG.cloudModel : null,
          retrieval: 'local BM25', crm: 'MCP stdio', localOnly: true });
      }
      if (req.method === 'GET' && url.pathname === '/api/projects') return json(res, 200, await crmCall('list_projects', {}));
      if (req.method === 'GET' && url.pathname === '/api/public/state') {
        const sessionId = visitor(req, res);
        return json(res, 200, await crmCall('get_session', { projectId: url.searchParams.get('project') || '', sessionId }));
      }
      if (req.method === 'POST' && url.pathname === '/api/chat') {
        const { projectId, question } = await body(req);
        if (typeof question !== 'string' || !question.trim() || question.length > 2000) throw new Error('Введите вопрос длиной до 2000 символов');
        const sessionId = visitor(req, res);
        const state = await crmCall('get_session', { projectId, sessionId });
        if (state.ticket?.status === 'open') {
          const result = await crmCall('add_user_message', { projectId, sessionId, text: question.trim() });
          return json(res, 200, { ...result, mode: 'operator', sources: [] });
        }
        if (wantsHuman(question)) {
          const result = await crmCall('create_ticket', { projectId, sessionId, requestText: question.trim() });
          return json(res, 200, { ...result, mode: 'operator', sources: [] });
        }
        const history = state.messages.slice(-8);
        const result = await answerQuestion({ projectId, question: question.trim(), history });
        await crmCall('add_agent_exchange', { projectId, sessionId, question: question.trim(), answer: result.answer, sources: result.sources });
        return json(res, 200, result);
      }
      if (req.method === 'GET' && url.pathname === '/api/admin/session') return json(res, 200, { authenticated: manager(req), configured: configuredAdmin() });
      if (req.method === 'POST' && url.pathname === '/api/admin/login') {
        const { password } = await body(req);
        if (!passwordMatches(password)) return json(res, 401, { error: 'Неверный пароль менеджера' });
        const token = randomUUID();
        managerSessions.set(token, Date.now() + 8 * 60 * 60 * 1000);
        return json(res, 200, { authenticated: true }, { 'Set-Cookie': `ps_manager=${token}; HttpOnly; SameSite=Strict; Path=/api/admin; Max-Age=28800` });
      }
      if (url.pathname.startsWith('/api/admin/')) {
        if (!manager(req)) return json(res, 401, { error: 'Требуется вход менеджера' });
        if (req.method === 'POST' && url.pathname === '/api/admin/logout') {
          managerSessions.delete(cookie(req, 'ps_manager'));
          return json(res, 200, { authenticated: false }, { 'Set-Cookie': 'ps_manager=; HttpOnly; SameSite=Strict; Path=/api/admin; Max-Age=0' });
        }
        if (req.method === 'GET' && url.pathname === '/api/admin/tickets') return json(res, 200, await crmCall('list_tickets', { projectId: url.searchParams.get('project') || '' }));
        if (req.method === 'GET' && url.pathname === '/api/admin/ticket') return json(res, 200, await crmCall('get_ticket', { projectId: url.searchParams.get('project') || '', ticketId: url.searchParams.get('id') || '' }));
        if (req.method === 'POST' && url.pathname === '/api/admin/reply') {
          const { projectId, ticketId, text } = await body(req);
          return json(res, 200, await crmCall('reply_ticket', { projectId, ticketId, text }));
        }
        if (req.method === 'POST' && url.pathname === '/api/admin/close') {
          const { projectId, ticketId } = await body(req);
          return json(res, 200, await crmCall('close_ticket', { projectId, ticketId }));
        }
      }
      if (req.method === 'GET' && assets.has(url.pathname)) {
        const [name, type] = assets.get(url.pathname);
        const file = await readFile(path.join(PUBLIC, name));
        res.writeHead(200, { 'Content-Type': type, 'Cache-Control': 'no-store', 'Content-Security-Policy': "default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self' data:; connect-src 'self'; base-uri 'none'; form-action 'self'", 'X-Content-Type-Options': 'nosniff' });
        return res.end(file);
      }
      return json(res, 404, { error: 'Не найдено' });
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Неизвестная ошибка';
      const status = /Некоррект|не найден|Введите|Слишком большой|JSON|закрыт|уже передано|Открытого/.test(message) ? 400 : 500;
      return json(res, status, { error: message });
    }
  });
}

if (process.argv[1] && path.resolve(process.argv[1]) === path.join(ROOT, 'src', 'server.js')) {
  const server = createServer();
  server.listen(CONFIG.port, CONFIG.host, () => process.stdout.write(`Project Support Agent: http://${CONFIG.host}:${CONFIG.port}\n`));
  const shutdown = () => server.close(() => { void closeCrm().finally(() => process.exit(0)); });
  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);
}
