import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { mkdtemp, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

const dataDir = await mkdtemp(path.join(os.tmpdir(), 'project-support-mcp-'));
process.env.SUPPORT_DATA_DIR = dataDir;
const { crmCall, closeCrm } = await import('../src/mcp-client.js');

test('MCP CRM creates a ticket from a conversation and delivers a manager reply', async () => {
  const projectId = 'invest-manager';
  const sessionId = randomUUID();
  try {
    const projects = await crmCall('list_projects', {});
    assert.ok(projects.some((project) => project.id === projectId));
    await crmCall('add_agent_exchange', { projectId, sessionId, question: 'Как подключить Telegram?', answer: 'Введите API ID и hash.', sources: [] });
    const created = await crmCall('create_ticket', { projectId, sessionId, requestText: 'Позови оператора' });
    assert.match(created.ticket.id, /^PS-/);
    const ticket = await crmCall('get_ticket', { projectId, ticketId: created.ticket.id });
    assert.equal(ticket.status, 'open');
    assert.ok(ticket.messages.some((message) => message.text === 'Как подключить Telegram?'));
    await crmCall('reply_ticket', { projectId, ticketId: ticket.id, text: 'Здравствуйте, помогу.' });
    const session = await crmCall('get_session', { projectId, sessionId });
    assert.ok(session.messages.some((message) => message.role === 'manager'));
  } finally { await closeCrm(); await rm(dataDir, { recursive: true, force: true }); }
});
