# Azure DevOps Release Notes — Claude Code Plugin

A Claude Code MCP plugin that automates generating Azure DevOps release notes with a
guided, consent-driven workflow. Fetches work items by sprint, renders a Markdown
template, and publishes directly to your Azure DevOps Wiki.

---

## Features

- 🔍 **Smart work item fetching** — queries Azure DevOps by iteration path using WIQL
- 📋 **Work item table preview** — review all items before generating notes
- 🎨 **Bundled Markdown template** — ready to use out of the box, fully customisable
- 📄 **Wiki publishing** — creates or updates wiki pages with overwrite confirmation
- 🔒 **Consent at every step** — nothing is published without two explicit confirmations
- 🔗 **Shared query saving** — optionally saves each sprint's query in Azure DevOps
- ⚙️ **Interactive setup wizard** — `./setup.sh` configures everything in one go
- 🔄 **Easy updates** — `./setup.sh --update` rebuilds without touching your config

---

## Quick Start

### 1. Clone the repo

```bash
git clone https://github.com/Chamalasela/azure-devops-release-notes-mcp.git
cd azure-devops-release-notes-mcp
```

### 2. Fix permissions (macOS / Linux)

If you get a `permission denied` error when running the setup script, fix it first:

```bash
chmod +x setup.sh
```

### 3. Run the setup wizard

```bash
./setup.sh
```

The wizard will:
- Ask for your Azure DevOps credentials (PAT and Wiki URL)
- Install npm dependencies
- Build the TypeScript project
- Test your Azure DevOps connection
- Register the plugin with Claude Code automatically

### 4. Restart Claude Code

| Platform | How to restart |
|---|---|
| **macOS** | Press `Ctrl + C` in the terminal running Claude Code, then run `claude` again |
| **Windows** | Press `Ctrl + Shift + P` → type `Developer: Reload Window` → Enter |

### 5. Use it

```
/generate-release-note Sprint 42
```

---

## Workflow

```
/generate-release-note Sprint 42
        │
        ▼
  Fetch work items for iteration
  Show work items table
        │
        ▼
  "Proceed and view?" or "Don't proceed"
        │
        ▼
  Render Markdown preview
        │
        ▼
  "Proceed?" or "Don't proceed"
  (If page exists: confirm overwrite)
        │
        ▼
  Publish to Azure DevOps Wiki ✅
```

Nothing is ever published without **two explicit confirmations** from you.

---

## Configuration (`.env`)

Copy `.env.example` to `.env` and fill in the values:

```bash
cp .env.example .env
```

### Required

| Variable | Description | Example |
|---|---|---|
| `AZURE_DEVOPS_PAT` | Personal Access Token | `abc123...` |
| `AZURE_DEVOPS_WIKI_URL` | Full browser URL of your wiki folder where release notes will be published | `https://dev.azure.com/myorg/MyProject/_wiki/wikis/MyProject.wiki?pagePath=/Release-Notes` |

> **How to get `AZURE_DEVOPS_WIKI_URL`:** Open your Azure DevOps Wiki in a browser,
> navigate to the folder where you want release notes stored, and copy the URL directly
> from the address bar.

### Optional (sensible defaults provided)

| Variable | Description | Default |
|---|---|---|
| `AZURE_DEVOPS_WORK_ITEM_TYPES` | Comma-separated work item types to include | `User Story,Bug,Feature` |
| `AZURE_DEVOPS_ITERATION_PATH_PREFIX` | Path prefix before the sprint name | Parsed from `AZURE_DEVOPS_WIKI_URL` |
| `RELEASE_NOTE_NAME_FORMAT` | Wiki page name format (`{{sprintName}}` = sprint name) | `{{sprintName}}` |
| `AZURE_DEVOPS_SHARED_QUERY_PATH` | Folder to save shared queries | `Shared Queries/Release Notes` |

> ⚠️ **`AZURE_DEVOPS_ITERATION_PATH_PREFIX` warning:** This should be the **parent** path
> only — do not include the sprint name at the end. For example if your full iteration
> path is `MyProject\Team Alpha\Sprint 42`, the prefix should be `MyProject\Team Alpha`.
> The sprint name is appended automatically. Setting it to `MyProject\Team Alpha\Sprint 42`
> will cause a duplicated segment error (`Sprint 42\Sprint 42`).

---

## PAT Required Scopes

In Azure DevOps → User Settings → Personal Access Tokens, enable:

- ✅ Work Items: **Read**
- ✅ Wiki: **Read & Write**
- ✅ Project and Team: **Read**
- ✅ Work Item Queries: **Read & Write**

---

## Available Commands (in Claude Code)

| Command | What happens |
|---|---|
| `/generate-release-note <sprint>` | Full release note flow |
| `/configure-release-notes` | Show configuration status |
| `/validate-connection` | Test Azure DevOps connectivity |

**Examples:**
```
/generate-release-note Sprint 42
/generate-release-note 2026-03
/configure-release-notes
/validate-connection
```

---

## Customising the Template

The bundled `release-note-template.md` uses Handlebars syntax and works out of the box.
Edit it to match your team's style:

```markdown
# Release Notes — {{sprintName}}
**Date:** {{generatedDate}} | **Project:** {{project}}

## 🐛 Bug Fixes
{{#each bugs}}
- [#{{this.id}}]({{this.url}}) {{this.title}} — *{{this.assignedTo}}*
{{/each}}

## 📖 User Stories
{{#each userStories}}
- [#{{this.id}}]({{this.url}}) {{this.title}}
{{/each}}
```

Available variables:

| Variable | Type | Description |
|---|---|---|
| `{{sprintName}}` | string | Sprint name as provided |
| `{{generatedDate}}` | string | Formatted date |
| `{{project}}` | string | Azure DevOps project name |
| `{{iterationPath}}` | string | Full iteration path |
| `{{totalCount}}` | number | Total work item count |
| `{{features}}` | array | Feature work items |
| `{{userStories}}` | array | User Story work items |
| `{{bugs}}` | array | Bug work items |
| `{{tasks}}` | array | Task work items |
| `{{epics}}` | array | Epic work items |

Each work item has: `id`, `title`, `state`, `assignedTo`, `workItemType`, `url`.

---

## Updating the Plugin

### Same machine (after `git pull`)

```bash
git pull
./setup.sh --update
```

The `--update` flag skips all configuration questions — it just reinstalls dependencies,
rebuilds, and ensures the MCP server is registered. Your `.env` is untouched.

Then restart Claude Code.

### New machine (or teammate cloning for first time)

```bash
git clone https://github.com/Chamalasela/azure-devops-release-notes-mcp.git
cd azure-devops-release-notes-mcp
chmod +x setup.sh
./setup.sh
```

| Situation | Command |
|---|---|
| First time on this machine | `./setup.sh` |
| After `git pull` on same machine | `./setup.sh --update` |
| Just rebuild | `npm run build` |

---

## Troubleshooting

### `permission denied: ./setup.sh`

```bash
chmod +x setup.sh
```

### `TypeScript build failed — heap out of memory`

```bash
NODE_OPTIONS=--max-old-space-size=8192 npm run build
```

Or when the wizard asks to continue after a failed build, say `y` — it will use
`ts-node` mode (no compiled output needed).

### `declare: -g: invalid option` (macOS)

macOS ships with bash 3.2. Pull the latest and re-run — the script is compatible:

```bash
git pull && chmod +x setup.sh && ./setup.sh
```

### `Authentication failed (401)`

Your PAT has expired or has insufficient scopes. Create a new one at
`dev.azure.com` → User Settings → Personal Access Tokens, then update
`AZURE_DEVOPS_PAT` in your `.env` and re-run `./setup.sh --update`.

### `No work items found`

Check `AZURE_DEVOPS_ITERATION_PATH_PREFIX` matches your Azure DevOps project structure.
The full path is built as:

```
{AZURE_DEVOPS_ITERATION_PATH_PREFIX}\{sprint name you provided}
```

Run `/validate-connection` in Claude Code — it will warn you if the prefix looks
misconfigured.

### `Iteration path not found (HTTP 400)` / duplicated path segment

This means `AZURE_DEVOPS_ITERATION_PATH_PREFIX` already ends with the sprint name.
For example if you set it to `MyProject\Team\2026-03` and then generate notes for
`2026-03`, the path becomes `MyProject\Team\2026-03\2026-03`.

**Fix:** Remove the trailing sprint segment from `AZURE_DEVOPS_ITERATION_PATH_PREFIX`.
It should be the **parent** path only — `MyProject\Team`.

### `generate_release_note tool unavailable` / MCP server not connected

```bash
claude mcp list
```

If `azure-devops-release-notes` is missing, register it:

```bash
claude mcp add azure-devops-release-notes \
  --scope user \
  -- node /absolute/path/to/azure-devops-release-notes-mcp/dist/index.js
```

Then restart Claude Code. If you used `./setup.sh --update` on a new machine and the
tool is still missing, run the full `./setup.sh` once to register on this machine.

### Plugin works on one machine but not another

The MCP server path is machine-specific. Always run `./setup.sh` (not `--update`) the
**first time** on a new machine. To fix a wrong path:

```bash
claude mcp remove azure-devops-release-notes
claude mcp add azure-devops-release-notes \
  --scope user \
  -- node /correct/path/to/dist/index.js
```

### `./setup.sh` keeps asking for the PAT on re-runs

Pull the latest — older versions always re-prompted even when `.env` existed:

```bash
git pull && ./setup.sh
```

---

## Manual Setup (for developers)

```bash
# 1. Install dependencies
npm install

# 2. Configure
cp .env.example .env
# Edit .env — minimum required: AZURE_DEVOPS_PAT and AZURE_DEVOPS_WIKI_URL

# 3. Build
npm run build

# 4. Register with Claude Code
claude mcp add azure-devops-release-notes \
  --scope user \
  -- node /absolute/path/to/azure-devops-release-notes-mcp/dist/index.js

# 5. Verify
claude mcp list
```

---

## Project Structure

```
├── .env.example                  # Environment variable template
├── release-note-template.md      # Bundled Handlebars template (edit to customise)
├── setup.sh                      # Interactive setup wizard (bash 3.2+ compatible)
├── CLAUDE.md                     # Claude Code plugin registration docs
├── CHANGELOG.md                  # Version history
├── .claude/
│   └── commands/                 # Slash command definitions
│       ├── generate-release-note.md
│       ├── configure-release-notes.md
│       └── validate-connection.md
└── src/
    ├── index.ts                  # MCP server — tool registrations
    ├── commands/
    │   ├── generate.ts           # 3-step generation flow
    │   └── configure.ts          # Config status & connection test
    ├── services/
    │   ├── azureDevops.ts        # Axios client + error handling
    │   ├── workItems.ts          # WIQL queries + batch item fetching
    │   ├── wiki.ts               # Wiki page create/update (ETag safe)
    │   └── sharedQuery.ts        # Shared query management
    └── utils/
        ├── config.ts             # .env loader + validation
        └── templateEngine.ts     # Handlebars renderer + table formatter
```

---

## Development

```bash
npm run dev        # Run without building (ts-node)
npm run build      # Compile TypeScript → dist/
npm run typecheck  # Type check without emitting
```

---

## Contributing

1. Fork the repo
2. Create a feature branch: `git checkout -b feat/my-feature`
3. Commit: `git commit -m 'feat: add my feature'`
4. Push and open a PR

Please update `CHANGELOG.md` under `[Unreleased]` with a summary of your changes.

---

## License

MIT
