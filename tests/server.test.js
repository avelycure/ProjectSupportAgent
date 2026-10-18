import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

const dataDir = await mkdtemp(path.join(os.tmpdir(), 'project-support-test-'));
process.env.SUPPORT_DATA_DIR = dataDir;
const { CONFIG } = await import('../src/config.js');
const { createServer, wantsHuman } = await import('../src/server.js');
const { closeCrm } = await import('../src/mcp-client.js');

test('operator request recognizes paraphrases without escalating product questions', () => {
  assert.equal(wantsHuman('Свяжите меня с человеком'), true);
  assert.equal(wantsHuman('Хочу поговорить с оператором'), true);
  assert.equal(wantsHuman('Позови оператора'), true);
  assert.equal(wantsHuman('Позови агента'), true);
  assert.equal(wantsHuman('Как настроить Telegram?'), false);
  assert.equal(wantsHuman('Есть ли в продукте поддержка?'), false);
});

test('visitor escalates a conversation; manager sees it, replies, and closes it', async () => {
  const previous = { key: CONFIG.cloudApiKey, password: CONFIG.adminPassword };
  CONFIG.cloudApiKey = '';
  CONFIG.adminPassword = 'test-manager-password';
  const server = createServer();
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const address = `http://127.0.0.1:${server.address().port}`;
  const post = async (url, data, cookie = '') => {
    const response = await fetch(`${address}${url}`, { method: 'POST', headers: { 'Content-Type': 'application/json', Cookie: cookie }, body: JSON.stringify(data) });
    return { status: response.status, payload: await response.json(), cookie: response.headers.get('set-cookie') };
  };
  try {
    const landing = await fetch(address);
    assert.equal(landing.status, 200);
    const html = await landing.text();
    assert.match(html, /позови агента/);
    assert.doesNotMatch(html, /call-operator|демо-чат|Как это устроено/i);
    assert.doesNotMatch(html, /ticket-select/);
    assert.equal((await fetch(`${address}/admin`)).status, 200);

    const stateResponse = await fetch(`${address}/api/public/state?project=invest-manager`);
    const visitorCookie = stateResponse.headers.get('set-cookie').split(';')[0];
    assert.equal((await stateResponse.json()).ticket, null);
    const question = await post('/api/chat', { projectId: 'invest-manager', question: 'Почему не работает Telegram?' }, visitorCookie);
    assert.equal(question.status, 200);
    assert.equal(question.payload.mode, 'document-excerpts');
    assert.ok(question.payload.sources.length > 0);
    const earlyLogin = await post('/api/admin/login', { password: 'test-manager-password' });
    const earlyManagerCookie = earlyLogin.cookie.split(';')[0];
    const beforeEscalation = await fetch(`${address}/api/admin/tickets?project=invest-manager`, { headers: { Cookie: earlyManagerCookie } });
    assert.deepEqual(await beforeEscalation.json(), []);
    assert.equal((await fetch(`${address}/api/admin/tickets?project=invest-manager`)).status, 401);
    assert.equal((await post('/api/admin/login', { password: 'wrong' })).status, 401);

    const escalation = await post('/api/chat', { projectId: 'invest-manager', question: 'Позови агента' }, visitorCookie);
    assert.equal(escalation.status, 200);
    const ticketId = escalation.payload.ticket.id;
    assert.match(ticketId, /^PS-/);
    const unauthorizedDetail = await fetch(`${address}/api/admin/ticket?project=invest-manager&id=${ticketId}`);
    assert.equal(unauthorizedDetail.status, 401);
    assert.equal((await post('/api/admin/reply', { projectId: 'invest-manager', ticketId, text: 'Нет доступа' })).status, 401);
    const login = await post('/api/admin/login', { password: 'test-manager-password' });
    assert.equal(login.status, 200);
    const managerCookie = login.cookie.split(';')[0];
    const listResponse = await fetch(`${address}/api/admin/tickets?project=invest-manager`, { headers: { Cookie: managerCookie } });
    const tickets = await listResponse.json();
    assert.equal(tickets.length, 1);
    assert.equal(tickets[0].id, ticketId);
    assert.equal(tickets[0].title, 'Почему не работает Telegram?');
    const detailResponse = await fetch(`${address}/api/admin/ticket?project=invest-manager&id=${ticketId}`, { headers: { Cookie: managerCookie } });
    const detail = await detailResponse.json();
    assert.ok(detail.messages.some((message) => message.text.includes('Почему не работает Telegram?')));

    const reply = await post('/api/admin/reply', { projectId: 'invest-manager', ticketId, text: 'Помогу с подключением Telegram.' }, managerCookie);
    assert.equal(reply.status, 200);
    const userStateResponse = await fetch(`${address}/api/public/state?project=invest-manager`, { headers: { Cookie: visitorCookie } });
    const userState = await userStateResponse.json();
    assert.equal(userState.ticket.id, ticketId);
    assert.ok(userState.messages.some((message) => message.role === 'manager' && message.text.includes('Помогу')));
    const followUp = await post('/api/chat', { projectId: 'invest-manager', question: 'Спасибо, жду код.' }, visitorCookie);
    assert.equal(followUp.payload.mode, 'operator');
    const closed = await post('/api/admin/close', { projectId: 'invest-manager', ticketId }, managerCookie);
    assert.equal(closed.payload.status, 'closed');
    const after = await fetch(`${address}/api/public/state?project=invest-manager`, { headers: { Cookie: visitorCookie } });
    assert.equal((await after.json()).ticket, null);
  } finally {
    CONFIG.cloudApiKey = previous.key;
    CONFIG.adminPassword = previous.password;
    await new Promise((resolve) => server.close(resolve));
    await closeCrm();
    await rm(dataDir, { recursive: true, force: true });
  }
});
