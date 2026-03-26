# Connectors

Connectors let Waggle interact with external services -- GitHub, Slack, Google, Jira, and 25 others. Credentials are stored in the encrypted vault, and sensitive operations go through approval gates.

## Vault Setup

Before connecting any service, you need to understand the vault. The vault is Waggle's encrypted credential store, using AES-256-GCM encryption. It lives at `~/.waggle/vault.db` and is the single source of truth for all secrets.

### Adding a Secret to the Vault

**From the UI:**
1. Go to **Settings** > **Vault**
2. Click **Add Secret**
3. Enter the name (e.g., `GITHUB_TOKEN`) and value
4. Click **Save**

**From the API:**
```bash
curl -X POST http://localhost:3333/api/vault \
  -H "Content-Type: application/json" \
  -d '{"name": "GITHUB_TOKEN", "value": "ghp_your_token_here"}'
```

### Suggested Keys

The vault suggests common API key names that are not yet configured:

- `ANTHROPIC_API_KEY` -- LLM provider
- `OPENAI_API_KEY` -- LLM provider
- `GITHUB_TOKEN` -- GitHub API
- `SLACK_BOT_TOKEN` -- Slack Bot
- `JIRA_API_TOKEN` -- Jira Cloud
- `GOOGLE_API_KEY` -- Google services
- `TAVILY_API_KEY` -- Web search
- `BRAVE_API_KEY` -- Web search
- `SENDGRID_API_KEY` -- Email sending
- `GOOGLE_CALENDAR_TOKEN` -- Calendar access

## Native Connectors

Waggle registers 29 native connectors at startup. Each connector has a defined auth type and generates agent tools when credentials are available.

| # | Connector | Service | Auth Type |
|---|-----------|---------|-----------|
| 1 | GitHub | GitHub API | Bearer token (PAT) |
| 2 | Slack | Slack Bot API | Bot token |
| 3 | Jira | Jira Cloud | Basic auth (email + API token) |
| 4 | Email (SendGrid) | SendGrid API | API key |
| 5 | Google Calendar | Google Calendar API | OAuth token |
| 6 | Discord | Discord Bot API | Bot token |
| 7 | Linear | Linear API | API key |
| 8 | Asana | Asana API | Bearer token |
| 9 | Trello | Trello API | API key |
| 10 | Monday | Monday.com API | API key |
| 11 | Notion | Notion API | Integration token |
| 12 | Confluence | Atlassian API | Basic auth |
| 13 | Obsidian | Local vault | File path |
| 14 | HubSpot | HubSpot API | Bearer token |
| 15 | Salesforce | Salesforce API | OAuth token |
| 16 | Pipedrive | Pipedrive API | API key |
| 17 | Airtable | Airtable API | Bearer token |
| 18 | GitLab | GitLab API | Bearer token (PAT) |
| 19 | Bitbucket | Bitbucket API | App password |
| 20 | Dropbox | Dropbox API | OAuth token |
| 21 | PostgreSQL | PostgreSQL | Connection string |
| 22 | Gmail | Gmail API | OAuth token |
| 23 | Google Docs | Google Docs API | OAuth token |
| 24 | Google Drive | Google Drive API | OAuth token |
| 25 | Google Sheets | Google Sheets API | OAuth token |
| 26 | MS Teams | Microsoft Graph API | OAuth token |
| 27 | Outlook | Microsoft Graph API | OAuth token |
| 28 | OneDrive | Microsoft Graph API | OAuth token |
| 29 | Composio | Composio Bridge | API key |

## Connecting a Service

### From the UI

1. Open the **Cockpit** from the sidebar
2. Scroll to the **Connectors** section
3. Click **Connect** on the service you want
4. Enter your credentials (token, API key, or OAuth details)
5. Click **Save**

The connector status changes from "Disconnected" to "Connected".

### From the API

```bash
# Connect GitHub with a personal access token
curl -X POST http://localhost:3333/api/connectors/github/connect \
  -H "Content-Type: application/json" \
  -d '{"token": "ghp_your_token_here"}'

# Connect Jira with email + API token
curl -X POST http://localhost:3333/api/connectors/jira/connect \
  -H "Content-Type: application/json" \
  -d '{"apiKey": "your_jira_token", "email": "you@company.com"}'
```

### Disconnecting

```bash
curl -X POST http://localhost:3333/api/connectors/github/disconnect
```

This removes the credentials from the vault and any associated metadata.

## Checking Connector Health

Each connector can report its health status:

```bash
curl http://localhost:3333/api/connectors/github/health
```

Response:
```json
{
  "id": "github",
  "name": "GitHub",
  "status": "connected",
  "lastChecked": "2026-03-19T10:30:00.000Z",
  "tokenExpiresAt": null
}
```

Possible statuses: `connected`, `disconnected`, `expired`, `error`.

## Connector Tools

When a connector is connected (credentials in vault), the agent gains tools for that service. For example, connecting GitHub gives the agent:

- Create issues
- List repositories
- Read file contents
- Create pull requests

The exact tools depend on the connector implementation. Tools appear in the agent's tool list and are visible in the Cockpit capabilities dashboard.

## Approval Gates

Sensitive connector operations go through approval gates. When the agent wants to:

- Send an email
- Create a Jira ticket
- Post a Slack message
- Push a git commit

It pauses and shows an approval card in the chat. You see:

- **Tool name** (e.g., `send_email`)
- **Input** (e.g., recipient, subject, body)
- **Approve** or **Deny** buttons

The agent waits for your decision before proceeding. This prevents accidental or unwanted actions.

### YOLO Mode

If you trust the agent fully, you can enable **YOLO Mode** in Settings > Permissions. This auto-approves all tool executions without asking. You can also set per-workspace overrides for specific tools.

## Composio Bridge

The 29th connector, Composio, is a bridge to 250+ additional services. If you have a Composio account:

1. Add your Composio API key to the vault
2. Connect the Composio connector
3. The agent gains access to Composio-managed services

Composio manages its own credential lifecycle. Note: Composio credentials are stored and managed by Composio's infrastructure, not in Waggle's local vault.

## Enterprise Connectors (KVARK)

For enterprise deployments, KVARK provides an additional layer of governed connectors with:

- 28+ document connectors (SharePoint, Box, Google Drive, etc.)
- Permission-aware retrieval (respects source system ACLs)
- Semantic search with reranking
- Full audit trail

Enterprise connectors require a KVARK connection. See the [API Reference](../reference/api.md) for the `/api/marketplace/enterprise-packs` endpoint.

## Troubleshooting Connectors

### "Connector not found"
The connector ID must match exactly (lowercase). Check `GET /api/connectors` for the full list.

### "Vault not available"
The vault database could not be initialized. Check that `~/.waggle/` is writable and the vault.db file is not corrupted.

### Token Expired
Some OAuth-based connectors (Google, Microsoft) have tokens that expire. Re-connect the service to refresh.

### No Tools Appearing
After connecting, the agent tools are regenerated on the next chat message. If tools still do not appear, restart the server.
