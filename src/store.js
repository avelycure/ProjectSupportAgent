import { randomUUID } from 'node:crypto';
import { mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { CONFIG } from './config.js';
import { getProject } from './projects.js';

const validSession = (value) => typeof value === 'string' && /^[a-f0-9-]{36}$/.test(value);
const validTicket = (value) => typeof value === 'string' && /^PS-[A-F0-9]{8}$/.test(value);
const queues = new Map();
const now = () => new Date().toISOString();
const line = (role, text, extra = {}) => ({ role, text, at: now(), ...extra });

async function read(projectId) {
  await getProject(projectId);
  const file = path.join(CONFIG.dataDir, `${projectId}.json`);
  try { return JSON.parse(await readFile(file, 'utf8')); }
  catch (error) {
    if (error.code === 'ENOENT') return { sessions: {}, tickets: {} };
    throw error;
  }
}

async function update(projectId, action) {
  const previous = queues.get(projectId) || Promise.resolve();
  const current = previous.catch(() => {}).then(async () => {
    const state = await read(projectId);
    const result = await action(state);
    await mkdir(CONFIG.dataDir, { recursive: true, mode: 0o700 });
    const target = path.join(CONFIG.dataDir, `${projectId}.json`);
    const temporary = `${target}.${randomUUID()}.tmp`;
    try {
      await writeFile(temporary, JSON.stringify(state, null, 2), { mode: 0o600 });
      await rename(temporary, target);
    } catch (error) {
      const { unlink } = await import('node:fs/promises');
      await unlink(temporary).catch(() => {});
      throw error;
    }
    return result;
  });
  queues.set(projectId, current);
  try { return await current; }
  finally { if (queues.get(projectId) === current) queues.delete(projectId); }
}

function session(state, sessionId) {
  if (!validSession(sessionId)) throw new Error('Некорректная сессия');
  return state.sessions[sessionId] ||= { id: sessionId, messages: [], activeTicketId: null, createdAt: now() };
}

export async function getSession(projectId, sessionId) {
  const state = await read(projectId);
  const current = validSession(sessionId) ? state.sessions[sessionId] : null;
  if (!current) return { messages: [], ticket: null };
  const ticket = current.activeTicketId ? state.tickets[current.activeTicketId] : null;
  return { messages: current.messages, ticket: ticket ? { id: ticket.id, status: ticket.status } : null };
}

export async function addAgentExchange(projectId, sessionId, question, answer, sources = []) {
  return update(projectId, (state) => {
    const current = session(state, sessionId);
    if (current.activeTicketId) throw new Error('Обращение уже передано оператору');
    current.messages.push(line('user', question), line('assistant', answer, { sources }));
    current.messages = current.messages.slice(-80);
    return { messages: current.messages };
  });
}

export async function createTicket(projectId, sessionId, requestText) {
  if (!requestText || requestText.length > 2000) throw new Error('Введите сообщение длиной до 2000 символов');
  return update(projectId, (state) => {
    const current = session(state, sessionId);
    if (current.activeTicketId) return addUserMessageToState(state, current, requestText);
    const id = `PS-${randomUUID().slice(0, 8).toUpperCase()}`;
    const confirmation = `Передал разговор специалисту. Номер обращения: ${id}. Напишите здесь дополнительные детали — менеджер увидит их и ответит в этом чате.`;
    current.messages.push(line('user', requestText), line('assistant', confirmation));
    const previousQuestion = [...current.messages].reverse().find((message) => message.role === 'user' && message.text !== requestText)?.text;
    const title = /^позови (?:агента|оператора)[.!?\s]*$/i.test(requestText) ? previousQuestion || 'Запрос специалиста' : requestText;
    const ticket = { id, projectId, sessionId, status: 'open', title: title.slice(0, 100), createdAt: now(), updatedAt: now(), messages: [...current.messages] };
    state.tickets[id] = ticket;
    current.activeTicketId = id;
    return { ticket: { id, status: ticket.status }, answer: confirmation };
  });
}

function addUserMessageToState(state, current, text) {
  const ticket = state.tickets[current.activeTicketId];
  if (!ticket || ticket.status !== 'open') throw new Error('Обращение закрыто');
  const message = line('user', text);
  ticket.messages.push(message);
  current.messages.push(message);
  ticket.updatedAt = message.at;
  return { ticket: { id: ticket.id, status: ticket.status }, answer: 'Сообщение передано специалисту.' };
}

export async function addUserMessage(projectId, sessionId, text) {
  if (!text || text.length > 2000) throw new Error('Введите сообщение длиной до 2000 символов');
  return update(projectId, (state) => {
    const current = session(state, sessionId);
    if (!current.activeTicketId) throw new Error('Открытого обращения нет');
    return addUserMessageToState(state, current, text);
  });
}

export async function listTickets(projectId) {
  const state = await read(projectId);
  return Object.values(state.tickets).map(({ id, title, status, createdAt, updatedAt, messages }) =>
    ({ id, title, status, createdAt, updatedAt, messageCount: messages.length }))
    .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
}

export async function getTicket(projectId, ticketId) {
  if (!validTicket(ticketId)) return null;
  const state = await read(projectId);
  return state.tickets[ticketId] || null;
}

export async function replyTicket(projectId, ticketId, text) {
  if (!text?.trim() || text.length > 2000) throw new Error('Введите ответ длиной до 2000 символов');
  return update(projectId, (state) => {
    const ticket = validTicket(ticketId) ? state.tickets[ticketId] : null;
    if (!ticket) throw new Error('Тикет не найден');
    if (ticket.status !== 'open') throw new Error('Тикет закрыт');
    const message = line('manager', text.trim());
    ticket.messages.push(message);
    ticket.updatedAt = message.at;
    state.sessions[ticket.sessionId]?.messages.push(message);
    return ticket;
  });
}

export async function closeTicket(projectId, ticketId) {
  return update(projectId, (state) => {
    const ticket = validTicket(ticketId) ? state.tickets[ticketId] : null;
    if (!ticket) throw new Error('Тикет не найден');
    ticket.status = 'closed';
    ticket.updatedAt = now();
    const current = state.sessions[ticket.sessionId];
    if (current?.activeTicketId === ticketId) current.activeTicketId = null;
    const message = line('system', `Обращение ${ticketId} закрыто. Теперь можно снова задавать вопросы агенту.`);
    ticket.messages.push(message);
    current?.messages.push(message);
    return ticket;
  });
}
