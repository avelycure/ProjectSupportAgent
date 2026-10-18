import test from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from '../src/server.js';
import { closeCrm } from '../src/mcp-client.js';
import { CONFIG } from '../src/config.js';

test('landing and chat API respond with grounded demo content', async () => {
  const cloudApiKey = CONFIG.cloudApiKey;
  CONFIG.cloudApiKey = '';
  const server = createServer();
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const address = `http://127.0.0.1:${server.address().port}`;
  try {
    const page = await fetch(address);
    assert.equal(page.status, 200);
    assert.match(await page.text(), /Project Support Agent/);
    const result = await fetch(`${address}/api/chat`, { method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ projectId: 'invest-manager', ticketId: 'IM-101', question: 'Почему не работает Telegram?' }) });
    assert.equal(result.status, 200);
    const payload = await result.json();
    assert.equal(payload.ticket.id, 'IM-101');
    assert.ok(payload.sources.length > 0);
    assert.match(payload.answer, /Telegram|тикету/i);
  } finally {
    CONFIG.cloudApiKey = cloudApiKey;
    await new Promise((resolve) => server.close(resolve));
    await closeCrm();
  }
});
