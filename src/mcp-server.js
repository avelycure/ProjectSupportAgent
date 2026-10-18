import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { z } from 'zod';
import { getProject, getTicket, getUser, listProjects, listTickets } from './projects.js';

const server = new McpServer({ name: 'project-support-crm', version: '0.1.0' });
const content = (value) => ({ content: [{ type: 'text', text: JSON.stringify(value) }] });

server.registerTool('list_projects', { description: 'List configured support projects', inputSchema: {} },
  async () => content(await listProjects()));
server.registerTool('get_project', { description: 'Get project metadata', inputSchema: { projectId: z.string() } },
  async ({ projectId }) => content(await getProject(projectId)));
server.registerTool('list_tickets', { description: 'List ticket summaries for a project', inputSchema: { projectId: z.string() } },
  async ({ projectId }) => content(await listTickets(projectId)));
server.registerTool('get_ticket', { description: 'Get one ticket with its history', inputSchema: { projectId: z.string(), ticketId: z.string() } },
  async ({ projectId, ticketId }) => content(await getTicket(projectId, ticketId) ?? null));
server.registerTool('get_user', { description: 'Get a user for ticket context', inputSchema: { projectId: z.string(), userId: z.string() } },
  async ({ projectId, userId }) => content(await getUser(projectId, userId) ?? null));

await server.connect(new StdioServerTransport());
