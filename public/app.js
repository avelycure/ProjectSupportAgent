const projectSelect = document.querySelector('#project-select');
const ticketSelect = document.querySelector('#ticket-select');
const contextTitle = document.querySelector('#context-title');
const contextDescription = document.querySelector('#context-description');
const chatStatus = document.querySelector('#chat-status');
const messages = document.querySelector('#chat-messages');
const form = document.querySelector('#chat-form');
const input = document.querySelector('#chat-input');
const submit = form.querySelector('button');
let tickets = [];
let history = [];

async function api(url, options) {
  const response = await fetch(url, options);
  const payload = await response.json();
  if (!response.ok) throw new Error(payload.error || `HTTP ${response.status}`);
  return payload;
}

function addMessage(role, text, sources = [], mode) {
  const row = document.createElement('div');
  row.className = `message ${role}`;
  const avatar = document.createElement('div');
  avatar.className = 'message-avatar';
  avatar.textContent = role === 'user' ? 'Вы' : '✳';
  const content = document.createElement('div');
  content.className = 'message-content';
  const paragraph = document.createElement('p');
  paragraph.textContent = text;
  content.append(paragraph);
  if (sources.length) {
    const list = document.createElement('div');
    list.className = 'message-sources';
    for (const source of sources) {
      const label = document.createElement('span');
      label.textContent = `${source.source} · ${source.heading}`;
      list.append(label);
    }
    content.append(list);
  }
  if (mode === 'document-excerpts') {
    const label = document.createElement('small');
    label.className = 'message-mode';
    label.textContent = 'Выдержки из документов · облачная модель не настроена';
    content.append(label);
  }
  row.append(avatar, content);
  messages.append(row);
  messages.scrollTop = messages.scrollHeight;
  return row;
}

async function loadTickets() {
  const project = projectSelect.value;
  tickets = await api(`/api/tickets?project=${encodeURIComponent(project)}`);
  ticketSelect.replaceChildren(new Option('Без тикета', ''));
  for (const ticket of tickets) ticketSelect.add(new Option(`${ticket.id} · ${ticket.title}`, ticket.id));
  history = [];
  updateContext();
}

function updateContext() {
  const ticket = tickets.find((item) => item.id === ticketSelect.value);
  contextTitle.textContent = ticket ? `${ticket.id} · ${ticket.title}` : 'Общий вопрос';
  contextDescription.textContent = ticket ? `Статус: ${ticket.status}. В ответе будет учтена история обращения.` : 'Агент использует документацию выбранного проекта.';
  history = [];
}

async function initialize() {
  try {
    const [projects, status] = await Promise.all([api('/api/projects'), api('/api/status')]);
    projectSelect.replaceChildren();
    for (const project of projects) projectSelect.add(new Option(project.name, project.id));
    if (!projects.length) throw new Error('Добавьте проект в папку projects');
    chatStatus.textContent = status.modelConfigured ? `Облачная модель ${status.model} · локальный RAG + MCP` : 'Локальный RAG + MCP · модель не настроена';
    await loadTickets();
  } catch (error) {
    chatStatus.textContent = 'Сервис недоступен';
    addMessage('assistant', error.message);
  }
}

async function ask(question) {
  const text = question.trim();
  if (!text || submit.disabled) return;
  input.value = '';
  addMessage('user', text);
  const pending = addMessage('assistant', 'Ищу ответ в документации и контексте тикета…');
  submit.disabled = true;
  try {
    const result = await api('/api/chat', { method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ projectId: projectSelect.value, ticketId: ticketSelect.value || undefined, question: text, history }) });
    pending.remove();
    addMessage('assistant', result.answer, result.sources, result.mode);
    history.push({ question: text, answer: result.answer });
    history = history.slice(-3);
  } catch (error) {
    pending.remove();
    addMessage('assistant', `Не удалось ответить: ${error.message}`);
  } finally { submit.disabled = false; input.focus(); }
}

form.addEventListener('submit', (event) => { event.preventDefault(); void ask(input.value); });
input.addEventListener('keydown', (event) => { if (event.key === 'Enter' && !event.shiftKey) { event.preventDefault(); form.requestSubmit(); } });
projectSelect.addEventListener('change', () => { void loadTickets(); });
ticketSelect.addEventListener('change', updateContext);
document.querySelectorAll('[data-question]').forEach((button) => button.addEventListener('click', () => { void ask(button.dataset.question); }));
void initialize();
