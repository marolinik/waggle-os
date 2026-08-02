# Getting Started with Waggle

Welcome to Waggle — your AI operating system with persistent memory.

## Quick Start

### 1. Install Waggle for Windows

Use only the signed Windows Solo `.exe` installer and SHA-256 identified by a **GO** [launch recommendation](production-readiness/09-LAUNCH_RECOMMENDATION.md). If that recommendation is not GO, no packaged desktop artifact is release-approved; use the source-development instructions in the repository instead. macOS desktop packaging and certification remain roadmap work.

Run the installer and launch Waggle. The Windows Solo release contract does not require developer Node.js, Docker, Python, LiteLLM, administrator access, or a separate Ollama installation.

### 2. Connect a model

The first-launch wizard offers two supported paths:

- **Private local model:** open **Local model**, choose **Install private runtime**, then download and verify the recommended model. Waggle keeps the managed runtime and model in its private data directory; no system Ollama or Docker installation is required.
- **Cloud provider:** open **API key**, choose a provider, and paste your own provider API key. Waggle validates it live when the provider is reachable, labels any unverified result, and stores it encrypted in Vault.

At least one working local model or cloud provider is needed for chat. You can choose **I'll do this later**, but chat remains unavailable until a model is configured.

External coding-agent authentication is separate from Waggle's model setup. Install each supported client yourself and use its own sign-in flow: Claude Code (`claude auth login --claudeai`), Codex (`codex login`), and Hermes' built-in provider OAuth (`hermes auth add openai-codex --type oauth`). Waggle uses the client's existing user session; do not paste or copy those credentials into Waggle.

### 3. Create Your First Workspace
- Choose a template (Sales, Research, Legal, etc.) or start blank
- Pick a persona (Researcher, Writer, Analyst, etc.)
- Name your workspace

### 4. Start Working
Type anything in the chat. Your agent can:
- Search the web (works immediately, no setup)
- Create Word documents with professional formatting
- Read and write files in your workspace
- Run shell commands (sandboxed)
- Run 15 workflow commands (type `/` to see them)
- Remember everything across sessions

### 5. The Memory Magic
After your first conversation, try closing and reopening the workspace.
Type: "What do you remember about our discussion?"
Your agent remembers everything — decisions, context, preferences.

## Key Features

### Workflow Commands
Type `/` in chat to see all commands:
- `/research [topic]` — deep web research with synthesis
- `/draft [type]` — create documents with professional formatting
- `/plan [goal]` — structured planning with steps
- `/catchup` — get a summary of where things stand
- `/decide [question]` — structured decision analysis
- `/review [topic]` — review work or documents
- `/spawn [task]` — delegate work to a sub-agent
- `/skills` — browse and install new capabilities
- `/status` — workspace health and statistics
- `/memory` — explore what your agent remembers
- `/focus` — set the current work focus
- `/now` — quick workspace snapshot
- `/help` — see all available commands

### Personas
Press `Ctrl+Shift+P` to switch personas. Each changes how your agent thinks:
- **Researcher**: deep investigation with citations
- **Writer**: document creation with formatting
- **Analyst**: data analysis with structured output
- **Planner**: project planning and task breakdown
- ...and more

### Keyboard Shortcuts
- `Ctrl+K` — search everything
- `Ctrl+Shift+1` through `Ctrl+Shift+7` — switch views
- `Ctrl+Shift+P` — switch persona
- `/` — workflow commands

### Memory View
Press `Ctrl+Shift+5` to browse everything your agent remembers.
Search, filter by type, and explore the knowledge graph.

### Workspace Home
When you open a workspace, you see the "Workspace Now" overview:
- A summary of where things stand
- Recent decisions and open items
- Recent conversation threads
- Key memories

Once you start chatting, click the **Workspace Overview** toggle above the messages to return to this view at any time.

## Product Scopes

Waggle uses four product tiers:
- **Trial** — 15 days of the Team experience, then Solo
- **Solo (Free)** — personal productivity with persistent memory
- **Team** — shared workspaces, WaggleDance, and governance
- **Enterprise** — sovereign KVARK deployment, compliance, and audit trails

## Need Help?
Type `/help` in chat for a full command reference.
