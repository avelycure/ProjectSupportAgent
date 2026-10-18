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

export async function loadDocuments(projectId) {
  await getProject(projectId);
  const directory = path.join(PROJECTS_DIR, projectId, 'docs');
  const entries = await readdir(directory, { withFileTypes: true });
  const documents = await Promise.all(entries.filter((entry) => entry.isFile() && entry.name.endsWith('.md'))
    .map(async (entry) => ({ source: entry.name, text: await readFile(path.join(directory, entry.name), 'utf8') })));
  return documents.sort((a, b) => a.source.localeCompare(b.source));
}
