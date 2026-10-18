import test from 'node:test';
import assert from 'node:assert/strict';
import { crmCall, closeCrm } from '../src/mcp-client.js';

test('web client retrieves a ticket and user through actual MCP tools', async () => {
  try {
    const projects = await crmCall('list_projects', {});
    assert.ok(projects.some((project) => project.id === 'invest-manager'));
    const ticket = await crmCall('get_ticket', { projectId: 'invest-manager', ticketId: 'IM-101' });
    assert.equal(ticket.userId, 'demo-user');
    const user = await crmCall('get_user', { projectId: 'invest-manager', userId: ticket.userId });
    assert.equal(user.id, 'demo-user');
  } finally { await closeCrm(); }
});
