import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { z } from 'zod';
import { getProject, listProjects } from './projects.js';
import { addAgentExchange, addUserMessage, closeTicket, createTicket, getSession, getTicket, listTickets, replyTicket } from './store.js';

const server = new McpServer({ name: 'project-support-crm', version: '0.2.0' });
const content = (value) => ({ content: [{ type: 'text', text: JSON.stringify(value) }] });
const projectId = z.string();
const sessionId = z.string();
const ticketId = z.string();
const message = z.string().max(2000);

server.registerTool('list_projects', { description: 'List configured support projects', inputSchema: {} },
  async () => content(await listProjects()));
server.registerTool('get_project', { description: 'Get project metadata', inputSchema: { projectId } },
  async ({ projectId }) => content(await getProject(projectId)));
server.registerTool('get_session', { description: 'Get one visitor conversation and active ticket', inputSchema: { projectId, sessionId } },
  async ({ projectId, sessionId }) => content(await getSession(projectId, sessionId)));
server.registerTool('add_agent_exchange', { description: 'Persist a visitor question and assistant answer', inputSchema: { projectId, sessionId, question: message, answer: z.string(), sources: z.array(z.object({ source: z.string(), heading: z.string() })).optional() } },
  async ({ projectId, sessionId, question, answer, sources }) => content(await addAgentExchange(projectId, sessionId, question, answer, sources)));
server.registerTool('create_ticket', { description: 'Escalate a visitor conversation to a human operator', inputSchema: { projectId, sessionId, requestText: message } },
  async ({ projectId, sessionId, requestText }) => content(await createTicket(projectId, sessionId, requestText)));
server.registerTool('add_user_message', { description: 'Add visitor message to an open ticket', inputSchema: { projectId, sessionId, text: message } },
  async ({ projectId, sessionId, text }) => content(await addUserMessage(projectId, sessionId, text)));
server.registerTool('list_tickets', { description: 'List ticket summaries for a manager', inputSchema: { projectId } },
  async ({ projectId }) => content(await listTickets(projectId)));
server.registerTool('get_ticket', { description: 'Get one ticket and its complete conversation', inputSchema: { projectId, ticketId } },
  async ({ projectId, ticketId }) => content(await getTicket(projectId, ticketId)));
server.registerTool('reply_ticket', { description: 'Send a manager reply to the visitor conversation', inputSchema: { projectId, ticketId, text: message } },
  async ({ projectId, ticketId, text }) => content(await replyTicket(projectId, ticketId, text)));
server.registerTool('close_ticket', { description: 'Close a ticket and return visitor chat to the assistant', inputSchema: { projectId, ticketId } },
  async ({ projectId, ticketId }) => content(await closeTicket(projectId, ticketId)));

await server.connect(new StdioServerTransport());
