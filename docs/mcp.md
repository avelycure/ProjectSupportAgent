# MCP CRM

MCP-сервер запускается как отдельный процесс по stdio:

```bash
npm run mcp
```

Пример настройки клиента MCP:

```json
{
  "mcpServers": {
    "project-support-crm": {
      "command": "node",
      "args": ["/absolute/path/to/ProjectSupportAgent/src/mcp-server.js"]
    }
  }
}
```

Доступные инструменты:

| Инструмент | Аргументы | Результат |
| --- | --- | --- |
| `list_projects` | — | Список проектов |
| `get_project` | `projectId` | Описание проекта |
| `list_tickets` | `projectId` | ID, заголовок, статус и категория тикетов |
| `get_ticket` | `projectId`, `ticketId` | Полный тикет и события |
| `get_user` | `projectId`, `userId` | Сведения пользователя |

Инструменты не записывают данные. Веб-сервер вызывает `get_ticket` и `get_user` именно через MCP-клиент. На сайте MCP не открыт напрямую в сеть. Если в дальнейшем нужна удалённая CRM, замените реализацию инструментов с сохранением их контракта и добавьте аутентификацию и разграничение доступа.
