# Azure DevOps Release Notes Plugin

This project is a Claude Code MCP plugin that generates Azure DevOps sprint release notes and publishes them to an Azure DevOps Wiki.

## Setup

### 1. Install dependencies

```bash
npm install
```

### 2. Configure environment

```bash
cp .env.example .env
```

Edit `.env` and fill in all required values:

| Variable | Description |
|---|---|
| `AZURE_DEVOPS_PAT` | Personal Access Token (scopes: Work Items Read/Write, Wiki Read/Write) |
| `AZURE_DEVOPS_ORG` | Your Azure DevOps organisation name |
| `AZURE_DEVOPS_PROJECT` | Project name |
| `WORK_ITEM_TYPES` | Comma-separated types: `User Story,Bug,Feature,Task,Epic` |
| `EXCLUDE_STATES` | Comma-separated states to skip: `Removed,Cancelled` |
| `ITERATION_PATH_PREFIX` | Path prefix, e.g. `MyProject\Team A` |
| `SHARED_QUERY_FOLDER` | (Optional) Where to save the ADO shared query |
| `WIKI_IDENTIFIER` | Wiki name, usually `YourProject.wiki` |
| `WIKI_PARENT_PATH` | Parent wiki path, e.g. `/Release Notes` |
| `RELEASE_NOTE_TEMPLATE_PATH` | Path to your Markdown template file |

### 3. Customise your template

Edit `release-note-template.md` to match your team's release note format.

Available template variables:

| Variable | Description |
|---|---|
| `{{sprintName}}` | e.g. "Sprint 42" |
| `{{sprintNumber}}` | e.g. "42" |
| `{{project}}` | Project name from config |
| `{{iterationPath}}` | Full iteration path |
| `{{date}}` | Generation date |
| `{{totalItems}}` | Total work item count |
| `{{#each features}}` | Loop over Feature items |
| `{{#each userStories}}` | Loop over User Story items |
| `{{#each bugs}}` | Loop over Bug items |
| `{{#each tasks}}` | Loop over Task items |
| `{{#each epics}}` | Loop over Epic items |
| `{{#each other}}` | Loop over any other item types |

Each item in a loop has: `{{this.id}}`, `{{this.title}}`, `{{this.assignedTo}}`, `{{this.state}}`, `{{this.url}}`, `{{this.tags}}`

### 4. Build

```bash
npm run build
```

### 5. Register with Claude Code

Add to your Claude Code MCP config (`~/.claude/claude_desktop_config.json`):

```json
{
  "mcpServers": {
    "azure-devops-release-notes": {
      "command": "node",
      "args": ["/absolute/path/to/azure-devops-release-notes/dist/index.js"],
      "env": {
        "NODE_ENV": "production"
      }
    }
  }
}
```

---

## Usage

### Generate a release note

Type in Claude Code chat:

```
/generate release note for 42
```

or naturally:

```
Generate release note for Sprint 42
```

### Workflow

```
You: Generate release note for Sprint 42
  ↓
Claude fetches work items → shows table
  ↓
You: Proceed and view release note
  ↓
Claude renders preview using your template
  ↓
You: Publish release note
  ↓
Claude publishes to Azure DevOps Wiki
  ↓
✅ Wiki URL returned
```

If a page already exists for the sprint, Claude will ask whether to overwrite it.

---

## MCP Tools exposed

| Tool | Description |
|---|---|
| `generate_release_note` | Fetch work items for a sprint |
| `preview_release_note` | Render the release note preview |
| `publish_release_note` | Publish to the Azure DevOps Wiki |
| `overwrite_release_note` | Overwrite an existing wiki page |

---

## Project structure

```
azure-devops-release-notes/
├── .env                          # Your config (git-ignored)
├── .env.example                  # Config template
├── release-note-template.md      # Handlebars Markdown template
├── CLAUDE.md                     # This file
├── src/
│   ├── index.ts                  # MCP server + tool definitions
│   ├── commands/
│   │   └── generate.ts           # Release note generation logic
│   ├── services/
│   │   ├── azureDevops.ts        # HTTP client factory
│   │   ├── workItems.ts          # WIQL queries + work item fetch
│   │   ├── wiki.ts               # Wiki page create/update
│   │   └── sharedQuery.ts        # Optional shared query save
│   └── utils/
│       ├── config.ts             # .env loader + validation
│       └── templateEngine.ts    # Handlebars renderer
└── package.json
```
