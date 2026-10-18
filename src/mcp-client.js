import path from 'node:path';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
import { ROOT } from './config.js';
import { CONFIG } from './config.js';

let connection;

async function connect() {
  const client = new Client({ name: 'project-support-web', version: '0.1.0' });
  const transport = new StdioClientTransport({ command: process.execPath,
    args: [path.join(ROOT, 'src', 'mcp-server.js')], cwd: ROOT,
    env: { PATH: process.env.PATH || '', SUPPORT_DATA_DIR: CONFIG.dataDir } });
  await client.connect(transport);
  return client;
}

export async function crmCall(name, arguments_) {
  if (!connection) connection = connect();
  let client;
  try { client = await connection; }
  catch (error) { connection = undefined; throw error; }
  const result = await client.callTool({ name, arguments: arguments_ });
  if (result.isError) throw new Error(result.content?.[0]?.text || 'MCP tool failed');
  const item = result.content?.find((entry) => entry.type === 'text');
  if (!item) throw new Error('MCP tool returned no JSON');
  return JSON.parse(item.text);
}

export async function closeCrm() {
  if (connection) await (await connection).close();
  connection = undefined;
}
