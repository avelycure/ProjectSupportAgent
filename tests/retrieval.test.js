import test from 'node:test';
import assert from 'node:assert/strict';
import { getProject } from '../src/projects.js';
import { getTicket } from '../src/store.js';
import { retrieve } from '../src/retrieval.js';

test('retrieval finds Telegram troubleshooting in the demo project', async () => {
  const hits = await retrieve('invest-manager', 'Почему не работает вход в Telegram после превышения попыток?');
  assert.ok(hits.length > 0);
  assert.ok(hits.some((hit) => /telegram|faq/i.test(hit.source)));
  assert.ok(hits[0].score > 0);
});

test('project IDs cannot escape the projects directory', async () => {
  await assert.rejects(() => getProject('../invest-manager'), /Некорректный/);
  assert.equal(await getTicket('invest-manager', '../IM-101'), null);
});
