import { readdir, readFile } from 'node:fs/promises';
import path from 'node:path';
import { ROOT } from './config.js';

const PROJECTS_DIR = path.join(ROOT, 'projects');
const safeId = (value) => typeof value === 'string' && /^[a-z0-9][a-z0-9-]{0,63}$/.test(value);

async function json(file) {
  return JSON.parse(await readFile(file, 'utf8'));
}

export async function listProjects() {
  const entries = await readdir(PROJECTS_DIR, { withFileTypes: true });
  const projects = await Promise.all(entries.filter((entry) => entry.isDirectory() && safeId(entry.name))
    .map(async (entry) => {
      try { return await getProject(entry.name); } catch { return undefined; }
    }));
  return projects.filter(Boolean);
}

export async function getProject(projectId) {
  if (!safeId(projectId)) throw new Error('Некорректный идентификатор проекта');
  const project = await json(path.join(PROJECTS_DIR, projectId, 'project.json'));
  if (project.id !== projectId || typeof project.name !== 'string') throw new Error('Некорректное описание проекта');
  return project;
}

export async function listTickets(projectId) {
  await getProject(projectId);
  const tickets = await json(path.join(PROJECTS_DIR, projectId, 'data', 'tickets.json'));
  if (!Array.isArray(tickets)) throw new Error('Некорректный файл тикетов');
  return tickets.map(({ id, title, status, category }) => ({ id, title, status, category }));
}

export async function getTicket(projectId, ticketId) {
  if (typeof ticketId !== 'string' || !/^[A-Za-z0-9-]{1,64}$/.test(ticketId)) return undefined;
  await getProject(projectId);
  const tickets = await json(path.join(PROJECTS_DIR, projectId, 'data', 'tickets.json'));
  return Array.isArray(tickets) ? tickets.find((ticket) => ticket.id === ticketId) : undefined;
}

export async function getUser(projectId, userId) {
  if (typeof userId !== 'string' || !/^[A-Za-z0-9-]{1,64}$/.test(userId)) return undefined;
  await getProject(projectId);
  const users = await json(path.join(PROJECTS_DIR, projectId, 'data', 'users.json'));
  return Array.isArray(users) ? users.find((user) => user.id === userId) : undefined;
}

export async function loadDocuments(projectId) {
  await getProject(projectId);
  const directories = [
    { directory: path.join(PROJECTS_DIR, projectId, 'docs'), prefix: '' },
    { directory: path.join(ROOT, 'docs'), prefix: 'agent/' },
  ];
  const documents = (await Promise.all(directories.map(async ({ directory, prefix }) => {
    const entries = await readdir(directory, { withFileTypes: true });
    return Promise.all(entries.filter((entry) => entry.isFile() && entry.name.endsWith('.md'))
      .map(async (entry) => ({ source: `${prefix}${entry.name}`, text: await readFile(path.join(directory, entry.name), 'utf8') })));
  }))).flat();
  return documents.sort((a, b) => a.source.localeCompare(b.source));
}
