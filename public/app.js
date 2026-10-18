const projectSelect = document.querySelector('#project-select');
const contextTitle = document.querySelector('#context-title');
const contextDescription = document.querySelector('#context-description');
const chatStatus = document.querySelector('#chat-status');
const messages = document.querySelector('#chat-messages');
const form = document.querySelector('#chat-form');
const input = document.querySelector('#chat-input');
const submit = form.querySelector('button');
let activeTicket = null;
let busy = false;
let shownSignature = '';

async function api(url, options) {
  const response = await fetch(url, options);
  const payload = await response.json();
  if (!response.ok) throw new Error(payload.error || `HTTP ${response.status}`);
  return payload;
}

function addMessage(role, text, sources = [], ticketId = '') {
  const row = document.createElement('div');
  row.className = `message ${role === 'user' ? 'user' : 'assistant'} ${role}`;
  const avatar = document.createElement('div');
  avatar.className = 'message-avatar';
  avatar.textContent = role === 'user' ? 'Вы' : role === 'manager' ? 'М' : '✳';
  const content = document.createElement('div');
  content.className = 'message-content';
  if (ticketId) {
    const ticket = document.createElement('div');
    ticket.className = 'message-ticket';
    const label = document.createElement('span');
    label.textContent = 'Обращение создано';
    const number = document.createElement('strong');
    number.textContent = ticketId;
    ticket.append(label, number);
    content.append(ticket);
  }
  const paragraph = document.createElement('p');
  paragraph.textContent = text;
  content.append(paragraph);
  const productSources = sources.filter((source) => !source.source.startsWith('agent/'));
  if (productSources.length) {
    const list = document.createElement('div');
    list.className = 'message-sources';
    for (const source of productSources) {
      const label = document.createElement('span');
      label.textContent = `${source.source} · ${source.heading}`;
      list.append(label);
    }
    content.append(list);
  }
  row.append(avatar, content);
  messages.append(row);
  messages.scrollTop = messages.scrollHeight;
}

function renderState(state) {
  activeTicket = state.ticket;
  contextTitle.textContent = activeTicket ? `Обращение ${activeTicket.id}` : 'Помощник на связи';
  contextDescription.textContent = activeTicket ? 'Специалист видит историю диалога. Его ответ появится здесь.' : 'Задайте вопрос о выбранном продукте.';
  const signature = JSON.stringify(state.messages);
  if (signature === shownSignature) return;
  shownSignature = signature;
  messages.replaceChildren();
  if (!state.messages.length) addMessage('assistant', 'Здравствуйте! Спросите меня о продукте. Если понадобится оператор, напишите «позови оператора».');
  for (const item of state.messages) addMessage(item.role, item.text, item.sources || [], item.ticketId);
}

async function refresh() {
  if (busy || !projectSelect.value) return;
  const state = await api(`/api/public/state?project=${encodeURIComponent(projectSelect.value)}`);
  renderState(state);
}

async function initialize() {
  try {
    const [projects, status] = await Promise.all([api('/api/projects'), api('/api/status')]);
    projectSelect.replaceChildren();
    for (const project of projects) projectSelect.add(new Option(project.name, project.id));
    if (!projects.length) throw new Error('Добавьте проект в папку projects');
    chatStatus.textContent = status.modelConfigured ? 'Помощник на связи' : 'Поиск по справке доступен';
    await refresh();
  } catch (error) {
    chatStatus.textContent = 'Сервис недоступен';
    addMessage('assistant', error.message);
  }
}

async function ask(question) {
  const text = question.trim();
  if (!text || busy || !projectSelect.value) return;
  busy = true;
  submit.disabled = true;
  input.value = '';
  addMessage('user', text);
  const pending = document.createElement('div');
  pending.className = 'pending-answer';
  pending.textContent = activeTicket ? 'Передаю сообщение оператору…' : /позови оператора/i.test(text) ? 'Создаю обращение…' : 'Ищу ответ…';
  messages.append(pending);
  messages.scrollTop = messages.scrollHeight;
  try {
    await api('/api/chat', { method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ projectId: projectSelect.value, question: text }) });
    pending.remove();
    busy = false;
    await refresh();
  } catch (error) {
    pending.remove();
    addMessage('assistant', `Не удалось отправить: ${error.message}`);
  } finally { busy = false; submit.disabled = false; input.focus(); }
}

form.addEventListener('submit', (event) => { event.preventDefault(); void ask(input.value); });
input.addEventListener('keydown', (event) => { if (event.key === 'Enter' && !event.shiftKey) { event.preventDefault(); form.requestSubmit(); } });
projectSelect.addEventListener('change', () => { shownSignature = ''; void refresh(); });
setInterval(() => { void refresh().catch(() => {}); }, 5000);
void initialize();
