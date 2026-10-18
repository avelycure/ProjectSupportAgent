const loginPanel = document.querySelector('#login-panel');
const managerPanel = document.querySelector('#manager-panel');
const loginForm = document.querySelector('#login-form');
const projectSelect = document.querySelector('#admin-project');
const ticketList = document.querySelector('#ticket-list');
const ticketCount = document.querySelector('#ticket-count');
const ticketIdLabel = document.querySelector('#ticket-id');
const ticketTitle = document.querySelector('#ticket-title');
const ticketMeta = document.querySelector('#ticket-meta');
const ticketStatus = document.querySelector('#ticket-status');
const ticketMessages = document.querySelector('#ticket-messages');
const replyForm = document.querySelector('#reply-form');
const replyInput = document.querySelector('#reply-input');
const replyFeedback = document.querySelector('#reply-feedback');
let selectedId = null;
let currentTicket = null;
let loading = false;

async function api(url, options) {
  const response = await fetch(url, options);
  const payload = await response.json();
  if (!response.ok) throw new Error(payload.error || `HTTP ${response.status}`);
  return payload;
}
const post = (url, data = {}) => api(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(data) });
function date(value) { return new Date(value).toLocaleString('ru-RU', { dateStyle: 'medium', timeStyle: 'short' }); }
function showLogin(error = '') {
  loginPanel.hidden = false;
  managerPanel.hidden = true;
  document.querySelector('#login-error').textContent = error;
}
function showManager() { loginPanel.hidden = true; managerPanel.hidden = false; }
function badge(status) { return status === 'open' ? 'Открыт' : 'Закрыт'; }

function renderList(tickets) {
  ticketCount.textContent = String(tickets.length);
  ticketList.replaceChildren();
  if (!tickets.length) {
    const empty = document.createElement('p');
    empty.className = 'empty-tickets';
    empty.textContent = 'Обращений пока нет. Тикет появится, когда пользователь попросит оператора.';
    ticketList.append(empty);
    return;
  }
  for (const ticket of tickets) {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = `ticket-item${ticket.id === selectedId ? ' selected' : ''}`;
    const top = document.createElement('span');
    top.className = 'ticket-item-top';
    const id = document.createElement('b'); id.textContent = ticket.id;
    const status = document.createElement('small'); status.textContent = badge(ticket.status); status.className = `ticket-${ticket.status}`;
    top.append(id, status);
    const title = document.createElement('strong'); title.textContent = ticket.title;
    const time = document.createElement('time'); time.textContent = date(ticket.updatedAt);
    button.append(top, title, time);
    button.addEventListener('click', () => { selectedId = ticket.id; void loadTicket(); });
    ticketList.append(button);
  }
}
function renderTicket(ticket) {
  currentTicket = ticket;
  ticketIdLabel.textContent = ticket.id;
  ticketTitle.textContent = ticket.title;
  ticketMeta.textContent = `Создан ${date(ticket.createdAt)} · ${ticket.messages.length} сообщений`;
  ticketStatus.textContent = badge(ticket.status);
  ticketStatus.className = `status-pill ticket-${ticket.status}`;
  ticketStatus.hidden = false;
  ticketMessages.replaceChildren();
  for (const message of ticket.messages) {
    const item = document.createElement('article');
    item.className = `ticket-message ${message.role}`;
    const head = document.createElement('div'); head.className = 'ticket-message-head';
    const author = document.createElement('strong');
    author.textContent = { user: 'Пользователь', assistant: 'Агент', manager: 'Менеджер', system: 'Система' }[message.role] || message.role;
    const time = document.createElement('time'); time.textContent = date(message.at);
    head.append(author, time);
    const text = document.createElement('p'); text.textContent = message.text;
    item.append(head, text);
    ticketMessages.append(item);
  }
  ticketMessages.scrollTop = ticketMessages.scrollHeight;
  replyForm.hidden = ticket.status !== 'open';
  document.querySelectorAll('.ticket-item').forEach((button) => button.classList.toggle('selected', button.querySelector('b')?.textContent === selectedId));
}
async function loadTicket() {
  if (!selectedId) return;
  const ticket = await api(`/api/admin/ticket?project=${encodeURIComponent(projectSelect.value)}&id=${encodeURIComponent(selectedId)}`);
  if (ticket) renderTicket(ticket);
}
async function loadTickets() {
  if (loading || !projectSelect.value) return;
  loading = true;
  try {
    const tickets = await api(`/api/admin/tickets?project=${encodeURIComponent(projectSelect.value)}`);
    renderList(tickets);
    if (selectedId) await loadTicket();
    else if (tickets.length) { selectedId = tickets[0].id; await loadTicket(); }
  } catch (error) {
    if (error.message.includes('вход')) showLogin('Сессия менеджера закончилась. Войдите снова.');
    else replyFeedback.textContent = error.message;
  } finally { loading = false; }
}
async function initialize() {
  const session = await api('/api/admin/session');
  if (!session.authenticated) {
    showLogin(session.configured ? '' : 'Укажите ADMIN_PASSWORD в локальном .env и перезапустите сервис.');
    return;
  }
  showManager();
  const projects = await api('/api/projects');
  projectSelect.replaceChildren(...projects.map((project) => new Option(project.name, project.id)));
  await loadTickets();
}
loginForm.addEventListener('submit', async (event) => {
  event.preventDefault();
  try {
    await post('/api/admin/login', { password: document.querySelector('#admin-password').value });
    document.querySelector('#admin-password').value = '';
    await initialize();
  } catch (error) { showLogin(error.message); }
});
replyForm.addEventListener('submit', async (event) => {
  event.preventDefault();
  if (!selectedId || !replyInput.value.trim()) return;
  const button = replyForm.querySelector('button[type=submit]');
  button.disabled = true;
  try {
    await post('/api/admin/reply', { projectId: projectSelect.value, ticketId: selectedId, text: replyInput.value.trim() });
    replyInput.value = '';
    replyFeedback.textContent = 'Ответ отправлен пользователю';
    await loadTickets();
  } catch (error) { replyFeedback.textContent = error.message; }
  finally { button.disabled = false; }
});
document.querySelector('#close-ticket').addEventListener('click', async () => {
  if (!selectedId) return;
  try {
    await post('/api/admin/close', { projectId: projectSelect.value, ticketId: selectedId });
    replyFeedback.textContent = 'Тикет закрыт';
    await loadTickets();
  } catch (error) { replyFeedback.textContent = error.message; }
});
document.querySelector('#logout').addEventListener('click', async () => { await post('/api/admin/logout'); showLogin(); });
document.querySelector('#refresh-tickets').addEventListener('click', () => { void loadTickets(); });
projectSelect.addEventListener('change', () => { selectedId = null; currentTicket = null; void loadTickets(); });
setInterval(() => { if (!managerPanel.hidden) void loadTickets(); }, 5000);
void initialize().catch((error) => showLogin(error.message));
