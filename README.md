# Azure DevOps Release Notes — Claude Code Plugin

A Claude Code MCP plugin that automates generating Azure DevOps release notes with a
guided, consent-driven workflow. Fetches work items by sprint, renders a customisable
Markdown template, and publishes directly to your Azure DevOps Wiki.

## Features

- 🔍 **Smart work item fetching** — queries Azure DevOps by iteration path using WIQL
- 📋 **Work item table preview** — review all items before generating notes
- 🎨 **Custom Handlebars templates** — full control over release note structure
- 📄 **Wiki publishing** — creates or updates wiki pages with overwrite confirmation
- 🔗 **Shared query saving** — optionally saves each sprint's query in Azure DevOps
- ⚙️ **Configuration wizard** — `/configure-release-notes` command to check setup
- 🔒 **Consent at every step** — nothing is published without explicit user approval

---

## Quick Start

### 1. Clone the repo

```bash
git clone https://github.com/your-org/azure-devops-release-notes-mcp.git
cd azure-devops-release-notes-mcp
```

### 2. Run the setup wizard

```bash
chmod +x setup.sh
./setup.sh
```

> **Note:** If you get a *permission denied* error, the script is not yet marked as executable.
> Run `chmod +x setup.sh` once before executing it. This is common after a fresh `git clone`
> on macOS/Linux if the execute bit was not preserved.

The wizard will ask you a series of questions (Azure DevOps org, project, PAT token etc.),
install dependencies, build the project, test your connection, and register the plugin
with Claude Code — all in one go.

### 3. Use it in Claude Code

Restart Claude Code, then say:

```
/generate release note for Sprint 42
```

---

## Manual Setup (for developers)

If you prefer to configure things yourself:

```bash
# 1. Install dependencies
npm install

# 2. Configure
cp .env.example .env
# Edit .env with your Azure DevOps details

# 3. Build
npm run build

# 4. Register with Claude Code — add to ~/.claude/claude_desktop_config.json:
# {
#   "mcpServers": {
#     "azure-devops-release-notes": {
#       "command": "node",
#       "args": ["dist/index.js"],
#       "cwd": "/absolute/path/to/this/folder"
#     }
#   }
# }
```

---

## Workflow

```
/generate release note for Sprint 42
        │
        ▼
  Fetch work items for iteration
  Display work items table
        │
        ▼
  "Proceed and view?" or "Don't proceed"
        │
        ▼
  Render Markdown preview
        │
        ▼
  "Proceed?" or "Don't proceed"
        │
        ▼
  Publish to Azure DevOps Wiki ✅
```

Nothing is ever published without **two explicit confirmations** from you.

---

## Configuration (`.env`)

| Variable | Required | Description | Example |
|----------|----------|-------------|---------|
| `AZURE_DEVOPS_PAT` | ✅ | Personal Access Token | `abc123...` |
| `AZURE_DEVOPS_ORG` | ✅ | Organisation name | `my-company` |
| `AZURE_DEVOPS_PROJECT` | ✅ | Project name | `MyProject` |
| `WORK_ITEM_TYPES` | ✅ | Comma-separated work item types | `User Story,Bug,Task` |
| `ITERATION_PATH_PREFIX` | ✅ | Iteration path prefix | `MyProject\Team Alpha` |
| `SHARED_QUERY_PATH` | ⬜ | Folder for saved queries | `Shared Queries/Release Notes` |
| `WIKI_IDENTIFIER` | ✅ | Wiki name/ID | `MyProject.wiki` |
| `WIKI_RELEASE_NOTES_PATH` | ✅ | Wiki folder for release notes | `Release-Notes` |
| `RELEASE_NOTE_TEMPLATE_PATH` | ⬜ | Path to your `.md` template | `./release-note-template.md` |

---

## PAT Required Scopes

In Azure DevOps → User Settings → Personal Access Tokens, enable:
- ✅ Work Items: **Read**
- ✅ Wiki: **Read & Write**
- ✅ Project and Team: **Read**
- ✅ Work Item Queries: **Read & Write**

---

## Customising the Template

Edit `release-note-template.md`. Uses Handlebars syntax:

```markdown
# Release Notes — {{sprintName}}
**Date:** {{releaseDate}}

## Bug Fixes
{{#each bugs}}
- [#{{this.id}}]({{this.url}}) {{this.title}} — {{this.assignee}}
{{/each}}
```

Available variables: `sprintName`, `releaseDate`, `projectName`, `iterationPath`,
`totalItems`, `features`, `userStories`, `bugs`, `tasks`, `epics`, `generatedAt`.

Each work item has: `id`, `title`, `state`, `assignee`, `url`.

---

## Available Commands (in Claude Code)

| Say this | What happens |
|---|---|
| `/generate release note for Sprint 42` | Full release note flow |
| `/configure-release-notes` | Check configuration status |
| `validate my Azure DevOps connection` | Test API connectivity |

---

## Project Structure

```
├── .env.example                  # Environment variable template
├── release-note-template.md      # Customisable Markdown template
├── setup.sh                      # Interactive setup wizard
├── CLAUDE.md                     # Claude Code plugin registration
├── CHANGELOG.md                  # Version history
└── src/
    ├── index.ts                  # MCP server entry point
    ├── commands/
    │   ├── generate.ts           # 3-step generation flow
    │   └── configure.ts          # Config status & connection test
    ├── services/
    │   ├── azureDevops.ts        # Axios client + error handling
    │   ├── workItems.ts          # WIQL queries + item fetching
    │   ├── wiki.ts               # Wiki page CRUD
    │   └── sharedQuery.ts        # Shared query management
    └── utils/
        ├── config.ts             # .env loader + Zod validation
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
3. Commit your changes: `git commit -m 'feat: add my feature'`
4. Push and open a PR

Please update `CHANGELOG.md` under `[Unreleased]` with a summary of your changes.

---

## License

MIT
