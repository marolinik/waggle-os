# Harvest Export Manual — All Marko's AI Accounts

**Purpose:** Step-by-step guide to export conversation data from every AI platform for harvest into Waggle.
**Time estimate:** ~30-45 minutes total across all platforms.
**Output:** One folder per platform in `D:\Projects\waggle-os\harvest-imports\`

---

## Prep: Create the import folder

```
mkdir D:\Projects\waggle-os\harvest-imports
mkdir D:\Projects\waggle-os\harvest-imports\chatgpt
mkdir D:\Projects\waggle-os\harvest-imports\claude-web
mkdir D:\Projects\waggle-os\harvest-imports\claude-desktop
mkdir D:\Projects\waggle-os\harvest-imports\claude-code
mkdir D:\Projects\waggle-os\harvest-imports\gemini
mkdir D:\Projects\waggle-os\harvest-imports\perplexity
mkdir D:\Projects\waggle-os\harvest-imports\cursor
```

---

## 1. ChatGPT (chatgpt.com)

**Adapter:** `chatgpt-adapter.ts` (shipped, production-tested)
**Format:** JSON (conversations + memories + custom instructions)

### Steps:
1. Go to https://chatgpt.com
2. Click your profile icon (bottom-left) → **Settings**
3. Click **Data controls**
4. Click **Export data** → **Export**
5. You'll get an email (usually within 5-30 minutes) with a download link
6. Download the ZIP file
7. Extract it — you'll get a folder with:
   - `conversations.json` (this is the main file)
   - `user.json` (account info)
   - `model_comparisons.json` (optional)
   - `message_feedback.json` (optional)
   - `chat.html` (visual backup, not needed)
8. Copy `conversations.json` to `D:\Projects\waggle-os\harvest-imports\chatgpt\`

**What gets harvested:** All conversations, custom instructions, memories, message content with timestamps.

---

## 2. Claude Web (claude.ai) — marolinik@gmail.com account

**Adapter:** `claude-adapter.ts` (shipped, production-tested)
**Format:** JSON

### Steps:
1. Go to https://claude.ai
2. Log in with **marolinik@gmail.com**
3. Click your profile icon (bottom-left) → **Settings**
4. Scroll to **Account** section
5. Click **Export Data**
6. Confirm the export
7. You'll get an email with a download link (usually 5-15 minutes)
8. Download the ZIP
9. Extract — look for `conversations.json` or similar JSON files
10. Copy all JSON files to `D:\Projects\waggle-os\harvest-imports\claude-web\gmail\`

### Repeat for marko.markovic@egzakta.com account:
1. Log out of claude.ai
2. Log in with **marko.markovic@egzakta.com**
3. Same steps 3-9 above
4. Copy to `D:\Projects\waggle-os\harvest-imports\claude-web\egzakta\`

---

## 3. Claude Desktop App

**Adapter:** `claude-adapter.ts` (same as web — uses same export format)
**Location:** Desktop app stores conversations locally

### Steps:
1. Open Claude Desktop app
2. Menu → **File** → **Export conversations** (or Settings → Export)
3. If no export button: the desktop app syncs with claude.ai — your web export (step 2) already includes desktop conversations
4. If there's a separate local database:
   - Check `%APPDATA%\Claude\` on Windows
   - Look for `.db` or `.json` files
   - Copy any conversation data to `D:\Projects\waggle-os\harvest-imports\claude-desktop\`

**Note:** Claude Desktop and claude.ai share the same conversation history. If you already exported from claude.ai, you likely have the desktop conversations too. Check for any offline-only conversations.

---

## 4. Claude Code — ALL sessions, ALL projects, BOTH accounts

**Adapter:** `claude-code-adapter.ts` (shipped, 156 frames already harvested)
**Format:** JSONL session transcripts

### Where Claude Code stores sessions:

Sessions are stored per-project in:
```
C:\Users\MarkoMarkovic\.claude\projects\<project-dir-encoded>\*.jsonl
```

### Steps:

#### A. Gather ALL session files across ALL projects:

1. Open a terminal and run:
```bash
# List all projects with session files
find "C:/Users/MarkoMarkovic/.claude/projects" -name "*.jsonl" -type f > D:/Projects/waggle-os/harvest-imports/claude-code/session-list.txt

# Count total sessions
wc -l D:/Projects/waggle-os/harvest-imports/claude-code/session-list.txt
```

2. Copy all JSONL files (organized by project):
```bash
# This copies every session transcript, preserving project structure
cd "C:/Users/MarkoMarkovic/.claude/projects"
for dir in */; do
  if ls "$dir"*.jsonl 1>/dev/null 2>&1; then
    mkdir -p "D:/Projects/waggle-os/harvest-imports/claude-code/$dir"
    cp "$dir"*.jsonl "D:/Projects/waggle-os/harvest-imports/claude-code/$dir"
  fi
done
```

#### B. Key projects to verify are included:

| Project dir | What it is |
|-------------|-----------|
| `D--Projects-waggle-os` | Waggle OS (main project — dozens of sessions) |
| `D--Projects-SocialPresence` | Social presence work |
| `D--Projects-HiveMind` | HiveMind project |
| `D--Projects-MS-Claw*` | MS Claw projects |
| `D--Projects-eF` | eF project |
| `D--Projects-ReFarm` | ReFarm project |
| `D--Projects-TCG` | TCG project |
| `D--Projects-Dubai*` | Dubai offering |
| `D--Projects-Egzakta*` | Egzakta investor pitch |
| `C--Users-MarkoMarkovic*` | Various personal projects |

#### C. Also grab the memory files (per-project learned context):
```bash
# Copy all memory directories too
cd "C:/Users/MarkoMarkovic/.claude/projects"
for dir in */; do
  if [ -d "${dir}memory" ]; then
    mkdir -p "D:/Projects/waggle-os/harvest-imports/claude-code/${dir}memory"
    cp -r "${dir}memory/"* "D:/Projects/waggle-os/harvest-imports/claude-code/${dir}memory/"
  fi
done
```

#### D. Both accounts:
Claude Code sessions are stored locally regardless of which account you're logged in with. All sessions from both `marolinik@gmail.com` and `marko.markovic@egzakta.com` are in the same `.claude/projects/` directory. The copy above captures both.

---

## 5. Gemini (gemini.google.com)

**Adapter:** `gemini-adapter.ts` (shipped, needs real-data verification)
**Format:** JSON (via Google Takeout)

### Steps:
1. Go to https://takeout.google.com
2. Click **Deselect all** (top of page)
3. Scroll down and check **ONLY** "Gemini Apps" (formerly Bard)
4. Click **Next step**
5. Choose:
   - Delivery: **Send download link via email**
   - Frequency: **Export once**
   - File type: **ZIP**
   - File size: **2 GB** (default is fine)
6. Click **Create export**
7. Wait for email (can take minutes to hours depending on volume)
8. Download the ZIP
9. Extract — navigate to `Takeout/Gemini Apps/`
10. You'll find conversation JSON files
11. Copy all files to `D:\Projects\waggle-os\harvest-imports\gemini\`

---

## 6. Perplexity (perplexity.ai)

**Adapter:** `perplexity-adapter.ts` (shipped in S3, production-tested)
**Format:** JSON (threads with citations)

### Steps:
1. Go to https://perplexity.ai
2. Click your profile icon → **Settings**
3. Scroll to **Account** section
4. Look for **Export data** or **Download your data**
5. If no export button available:
   - Go to https://perplexity.ai/settings/account
   - Look for a data export option
   - If still not available: Perplexity may not have a bulk export yet
6. **Alternative:** Use the Perplexity API to fetch your thread history:
   - Check if you have API access at https://perplexity.ai/settings/api
   - Threads can be fetched programmatically
7. Copy any exported JSON to `D:\Projects\waggle-os\harvest-imports\perplexity\`

**Note:** If Perplexity doesn't offer bulk export, we can build a browser-based scraper or use the API. Let me know and I'll build it.

---

## 7. Cursor (cursor.sh)

**Adapter:** NOT BUILT YET (I'll build it when you're ready)
**Format:** SQLite database + workspace logs

### Steps:
1. Cursor stores conversations locally in:
   - Windows: `%APPDATA%\Cursor\User\`
   - Look for: `workspaceStorage/`, `globalStorage/`, or `state.vscdb`
2. Navigate to `C:\Users\MarkoMarkovic\AppData\Roaming\Cursor\User\`
3. Look for:
   - Any `.sqlite` or `.db` files
   - `workspaceStorage\*\state.vscdb` (per-workspace state)
   - `globalStorage\*\` directories with conversation data
4. Copy the entire relevant folder:
```bash
mkdir -p "D:/Projects/waggle-os/harvest-imports/cursor"
cp -r "C:/Users/MarkoMarkovic/AppData/Roaming/Cursor/User/workspaceStorage" "D:/Projects/waggle-os/harvest-imports/cursor/"
cp -r "C:/Users/MarkoMarkovic/AppData/Roaming/Cursor/User/globalStorage" "D:/Projects/waggle-os/harvest-imports/cursor/"
```

**Note:** I'll reverse-engineer the format and build the adapter once you've copied the data.

---

## 8. Microsoft Graph (email + calendar + files) — FUTURE

**Connector:** NOT BUILT YET (OAuth2 + REST API needed)
**What it covers:** Outlook email, Calendar events, OneDrive/SharePoint files

### Prep (for when I build the connector):
1. Go to https://portal.azure.com
2. Navigate to **App registrations** → **New registration**
3. Name: "Waggle OS Local" 
4. Redirect URI: `http://localhost:3333/api/oauth/callback`
5. Supported account types: "Accounts in this organizational directory only"
6. After creation, note:
   - **Application (client) ID**
   - **Directory (tenant) ID**
7. Go to **Certificates & secrets** → **New client secret** → copy the value
8. Go to **API permissions** → Add:
   - `Mail.Read`
   - `Calendars.Read`
   - `Files.Read.All`
   - `User.Read`
9. **Admin consent** if required by your Egzakta tenant

**I'll build the full OAuth flow + Graph API connector.** Just prep the app registration.

---

## Checklist

| # | Platform | Export method | Where to put it | Done? |
|---|----------|-------------|-----------------|-------|
| 1 | ChatGPT | Settings → Export | `harvest-imports/chatgpt/` | [ ] |
| 2 | Claude Web (gmail) | Settings → Export | `harvest-imports/claude-web/gmail/` | [ ] |
| 3 | Claude Web (egzakta) | Settings → Export | `harvest-imports/claude-web/egzakta/` | [ ] |
| 4 | Claude Desktop | Check if separate from web | `harvest-imports/claude-desktop/` | [ ] |
| 5 | Claude Code (ALL) | Copy ~/.claude/projects/*.jsonl | `harvest-imports/claude-code/` | [ ] |
| 6 | Gemini | Google Takeout → Gemini Apps | `harvest-imports/gemini/` | [ ] |
| 7 | Perplexity | Settings → Export | `harvest-imports/perplexity/` | [ ] |
| 8 | Cursor | Copy AppData/Cursor/ | `harvest-imports/cursor/` | [ ] |
| 9 | MS Graph | Azure App Registration | (prep only — connector not built) | [ ] |

## Keys to add to Waggle vault

| Key | For | How to get |
|-----|-----|-----------|
| `OPENAI_API_KEY` | GPT-5 judge | https://platform.openai.com/api-keys |
| `GOOGLE_API_KEY` | Gemini 2.5 Pro judge | https://aistudio.google.com/apikey |

---

## When you're done

Drop me a message with:
1. "Exports ready" — I'll start the harvest pipeline on everything
2. Which API keys you've added to vault
3. Budget confirmation for the full $2-3K test

I'll continue building while you prep:
- Wire persona denylist (Phase 0)
- Build Cursor adapter
- Fix remaining review majors
- Prep the harvest pipeline for bulk ingest
