# Changelog

All notable changes to **azure-devops-release-notes-mcp** are documented here.

This project follows [Semantic Versioning](https://semver.org/) — `MAJOR.MINOR.PATCH`:
- **MAJOR** — breaking changes (config keys renamed, tool signatures changed)
- **MINOR** — new features, backwards compatible
- **PATCH** — bug fixes, documentation updates

---

## [Unreleased]

> Changes that are merged but not yet in a tagged release.

### Added
- Nothing yet.

### Changed
- Nothing yet.

### Fixed
- Nothing yet.

---

## [1.0.0] — 2026-03-21

Initial public release.

### Added
- `generate_release_note` MCP tool — fetches work items for a sprint via WIQL and displays them in a formatted table
- `preview_release_note` MCP tool — renders the configured Handlebars template into a Markdown preview
- `publish_release_note` MCP tool — creates or overwrites an Azure DevOps Wiki page with user confirmation at every step
- `show_release_notes_config` MCP tool — displays current `.env` configuration status with field-by-field validation
- `validate_azure_connection` MCP tool — tests the PAT + org + project combination and discovers the wiki identifier
- Handlebars-based template engine with support for `features`, `userStories`, `bugs`, `tasks`, and `epics` sections
- Optional shared query saving to Azure DevOps Queries after each sprint fetch
- Batch work item fetching (handles sprints with 200+ items automatically)
- ETag-based wiki page conflict detection to prevent accidental overwrites
- Zod-validated `.env` configuration with friendly error messages
- `setup.sh` interactive wizard — guides users through config, installs dependencies, builds the project, tests the connection, and registers the plugin with Claude Code
- Starter `release-note-template.md` with tables for each work item type
- `CLAUDE.md` with slash command documentation and MCP registration instructions

---

<!--
─────────────────────────────────────────────────────────────
TEMPLATE FOR FUTURE RELEASES — copy this block for each new version
─────────────────────────────────────────────────────────────

## [X.Y.Z] — YYYY-MM-DD

### Added
- Brief description of new feature (issue #N)

### Changed
- What behaviour changed and why (breaking changes go in MAJOR releases)

### Deprecated
- Features that will be removed in a future version

### Removed
- Features removed in this release

### Fixed
- Bug description and what was causing it (issue #N)

### Security
- Any security-related fixes
─────────────────────────────────────────────────────────────
-->

---

## How to upgrade

After pulling a new version:

```bash
# Re-run setup to rebuild and refresh Claude Code config
./setup.sh

# Or manually:
npm install
npm run build
```

Restart Claude Code after upgrading to pick up the new plugin build.

---

## Breaking change policy

Config keys in `.env` will not be renamed without a **MAJOR** version bump and a migration
note in this file. MCP tool names and parameter shapes follow the same policy.

[Unreleased]: https://github.com/your-org/azure-devops-release-notes-mcp/compare/v1.0.0...HEAD
[1.0.0]: https://github.com/your-org/azure-devops-release-notes-mcp/releases/tag/v1.0.0
