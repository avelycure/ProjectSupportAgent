import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import { CONFIG } from '../src/config.js';
import { answerQuestion } from '../src/answer.js';
import { closeCrm } from '../src/mcp-client.js';

test('cloud request contains retrieved docs and selected MCP ticket, not every ticket', async () => {
  let request;
  const mock = http.createServer(async (req, res) => {
    let raw = '';
    for await (const chunk of req) raw += chunk;
    request = JSON.parse(raw);
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ choices: [{ message: { content: 'Проверьте ограничение Telegram. [faq.md]' } }] }));
  });
  await new Promise((resolve) => mock.listen(0, '127.0.0.1', resolve));
  const before = { ...CONFIG };
  CONFIG.cloudBaseUrl = `http://127.0.0.1:${mock.address().port}/v1`;
  CONFIG.cloudApiKey = 'test-only';
  CONFIG.cloudModel = 'test-model';
  try {
    const answer = await answerQuestion({ projectId: 'invest-manager', ticketId: 'IM-101', question: 'Почему не работает Telegram?' });
    assert.equal(answer.mode, 'cloud-rag');
    assert.match(answer.answer, /Telegram/);
    assert.match(request.messages[1].content, /IM-101/);
    assert.match(request.messages[1].content, /faq.md/);
    assert.doesNotMatch(request.messages[1].content, /IM-102/);
  } finally {
    Object.assign(CONFIG, before);
    await new Promise((resolve) => mock.close(resolve));
    await closeCrm();
  }
});
