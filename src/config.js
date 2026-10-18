import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

function readDotEnv() {
  const file = path.join(ROOT, '.env');
  if (!fs.existsSync(file)) return;
  for (const line of fs.readFileSync(file, 'utf8').split(/\r?\n/)) {
    const match = line.match(/^([A-Z][A-Z0-9_]*)=(.*)$/);
    if (!match || process.env[match[1]]) continue;
    const value = match[2].trim();
    process.env[match[1]] = value.replace(/^(['"])(.*)\1$/, '$2');
  }
}

readDotEnv();

export const CONFIG = {
  host: process.env.HOST || '127.0.0.1',
  port: Number(process.env.PORT || 4173),
  cloudBaseUrl: process.env.CLOUD_BASE_URL || 'https://api.openai.com/v1',
  cloudModel: process.env.CLOUD_MODEL || 'gpt-4.1-mini',
  cloudApiKey: process.env.CLOUD_API_KEY || '',
};
