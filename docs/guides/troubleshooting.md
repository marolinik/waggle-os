# Troubleshooting

Common issues, error codes, and solutions.

## API Key Issues

### "No API key configured"

The agent cannot run without an LLM provider key.

**Fix:** Go to Settings > Models and add your Anthropic key (starts with `sk-ant-`). Or edit `~/.waggle/config.json` directly:

```json
{
  "defaultModel": "claude-sonnet-4-6",
  "providers": {
    "anthropic": {
      "apiKey": "sk-ant-your-key-here",
      "models": ["claude-sonnet-4-6"]
    }
  }
}
```

### "API key is too short" / "must start with sk-ant-"

The key format validation failed.

**Fix:** Anthropic keys must start with `sk-ant-` and be at least 20 characters. OpenAI keys start with `sk-`. Copy the full key from your provider dashboard.

### Key works in API but not in Waggle

The built-in Anthropic proxy translates OpenAI-format requests to Anthropic format. If you are using a non-standard provider, you may need LiteLLM as a proxy:

```bash
docker compose up litellm
```

Then set your LiteLLM URL in Settings > Advanced.

## Server Issues

### Server won't start

**Check port availability:**
```bash
# Is port 3333 already in use?
lsof -i :3333   # macOS/Linux
netstat -ano | findstr 3333   # Windows
```

**Fix:** Kill the existing process or change the port:
```bash
PORT=3334 npx tsx src/local/start.ts
```

### "SQLITE_CANTOPEN" error

The `.mind` database file cannot be opened.

**Fix:**
- Check that `~/.waggle/` exists and is writable
- Check that no other process has the `.mind` file locked
- If the file is corrupted, rename it (data will be lost) and let Waggle create a fresh one

### Server crashes with "out of memory"

Large workspace minds or many concurrent operations can exhaust memory.

**Fix:**
- Restart the server
- If recurring, check your mind file size: `ls -la ~/.waggle/default.mind`
- Consider running memory consolidation: `POST /api/cron/{consolidation-id}/trigger`

## Memory Issues

### Memory not saving

Memories are saved automatically during conversations when the agent determines something is important.

**Check:**
1. Verify the workspace mind path exists: `~/.waggle/workspaces/{id}/workspace.mind`
2. Check that the disk has free space
3. Try saving explicitly: "Remember that [important fact]"

### Search returns no results

FTS5 search requires at least 3 characters.

**Fix:**
- Use longer queries (3+ characters)
- Check you are searching the right scope (personal, workspace, or all)
- Verify memories exist: open the Memory tab in the right panel

### Memory from another workspace showing up

This is expected behavior. The agent searches both personal and workspace minds. Personal mind memories are shared across all workspaces.

**Fix:** If a memory should be workspace-specific, it should have been saved to the workspace mind (this happens automatically for project-specific context).

## Connector Issues

### "Vault not available"

The encrypted vault database failed to initialize.

**Fix:**
- Check that `~/.waggle/` is writable
- If `~/.waggle/vault.db` exists but is corrupted, rename it and restart
- The vault auto-migrates from plain config.json on first access

### Connector shows "disconnected" after restart

Credentials persist in the vault across restarts. If a connector shows disconnected:

1. Check the health endpoint: `GET /api/connectors/{id}/health`
2. If the token expired, re-connect with fresh credentials
3. If the service is unreachable, check your network

### "Connector not found" (404)

Connector IDs are lowercase. Use `GET /api/connectors` to see all registered IDs.

### Approval gate stuck

If an approval card appears but you cannot click Approve/Deny:

**Fix:**
1. Check `GET /api/approval/pending` to see pending approvals
2. Approve via API: `POST /api/approval/{requestId}` with `{"approved": true}`
3. If the request expired, send a new message to the agent

## Desktop App Issues

### White screen after launch

The Tauri WebView2 runtime may not be installed (Windows).

**Fix:** Download and install the [WebView2 Runtime](https://developer.microsoft.com/en-us/microsoft-edge/webview2/).

### Sidecar not starting

The Node.js sidecar needs Node.js 20+ in the system PATH.

**Fix:**
- Install Node.js 20+ from https://nodejs.org
- Restart the app after installation
- Check the Tauri console for error messages

### Notifications not appearing (Windows)

**Fix:**
- Check Windows notification settings for Waggle
- Ensure "Focus Assist" is not blocking notifications
- The app must be running (tray icon visible)

## Team Mode Issues

### Cannot connect to team server

**Check:**
- The server URL is correct (include `https://`)
- The auth token is valid
- The team server is reachable: `curl https://your-server/health`

### "Team server connection timed out"

**Fix:** The team server health check has a 5-second timeout. Check that:
- The server is running
- There are no firewall rules blocking the connection
- DNS resolves correctly

### Tasks not syncing

Task data is stored per-workspace in JSONL files. In team mode, tasks are stored on the team server.

**Fix:** Check team connection status: `GET /api/team/status`

## Common Error Codes

| Code | Meaning | Fix |
|------|---------|-----|
| 400 | Bad request -- missing or invalid parameters | Check the API reference for required fields |
| 404 | Resource not found | Verify the ID/name exists |
| 409 | Conflict -- resource already exists | The skill/plugin is already installed |
| 413 | File too large | Files must be under 10 MB |
| 503 | Service unavailable | The required service (vault, marketplace, plugin runtime) is not ready |

## FAQ

**Q: Where is my data stored?**
A: All data is in `~/.waggle/` on your machine. Nothing is sent to cloud servers unless you explicitly connect a team server or external service.

**Q: Can I move my data to another machine?**
A: Yes. Copy the entire `~/.waggle/` directory. The `.mind` files are portable SQLite databases.

**Q: How do I reset everything?**
A: Delete `~/.waggle/` and restart. Waggle creates fresh defaults on startup.

**Q: Which LLM models work?**
A: Waggle works best with Claude (Anthropic). It also supports OpenAI, Google Gemini, and any model available through LiteLLM. The built-in proxy handles Anthropic natively.

**Q: How much does it cost to run?**
A: Waggle itself is free. You pay only for LLM API usage. The Cockpit status bar shows estimated cost per session. A typical conversation costs $0.05-0.50 depending on length and model.

**Q: Can I use it offline?**
A: Waggle requires an LLM API connection for agent responses. Memory, workspace management, and the UI work offline.
