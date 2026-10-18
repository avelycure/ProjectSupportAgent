import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import { CONFIG } from '../src/config.js';
import { answerQuestion } from '../src/answer.js';
import { closeCrm } from '../src/mcp-client.js';

test('cloud request contains retrieved docs and recent conversation, not unrelated tickets', async () => {
  let request;
  let attempts = 0;
  const mock = http.createServer(async (req, res) => {
    let raw = '';
    for await (const chunk of req) raw += chunk;
    request = JSON.parse(raw);
    attempts += 1;
    if (attempts === 1) {
      res.writeHead(400, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: { message: "Unsupported parameter: 'max_tokens' is not supported with this model" } }));
      return;
    }
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ choices: [{ message: { content: 'Проверьте ограничение Telegram. [faq.md]' } }] }));
  });
  await new Promise((resolve) => mock.listen(0, '127.0.0.1', resolve));
  const before = { ...CONFIG };
  CONFIG.cloudBaseUrl = `http://127.0.0.1:${mock.address().port}/v1`;
  CONFIG.cloudApiKey = 'test-only';
  CONFIG.cloudModel = 'test-model';
  try {
    const answer = await answerQuestion({ projectId: 'invest-manager', question: 'Почему не работает Telegram?', history: [{ role: 'user', text: 'У меня ограничение попыток' }] });
    assert.equal(answer.mode, 'cloud-rag');
    assert.equal(attempts, 2);
    assert.equal(request.max_completion_tokens, 800);
    assert.match(answer.answer, /Telegram/);
    assert.match(request.messages[1].content, /У меня ограничение попыток/);
    assert.match(request.messages[1].content, /faq.md/);
    assert.doesNotMatch(request.messages[1].content, /IM-101/);
  } finally {
    Object.assign(CONFIG, before);
    await new Promise((resolve) => mock.close(resolve));
    await closeCrm();
  }
});
