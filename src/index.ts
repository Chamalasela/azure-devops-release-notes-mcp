import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import { loadConfig, formatPageName } from "./utils/config.js";
import {
  generateReleaseNote,
  previewReleaseNote,
  publishReleaseNote,
} from "./commands/generate.js";
import { createAzureDevOpsClient } from "./services/azureDevops.js";
import { checkWikiPageExists, buildWikiPagePath } from "./services/wiki.js";

// Explicit return type for all tool handlers — prevents TS2589 deep inference error
type ToolResult = Promise<{ content: Array<{ type: "text"; text: string }> }>;

// ─── Helper ───────────────────────────────────────────────────────────────────

function text(str: string): { content: Array<{ type: "text"; text: string }> } {
  return { content: [{ type: "text", text: str }] };
}

// ─── Tool handlers (named functions with explicit return types) ───────────────

async function handleGenerateReleaseNote(sprint_name: string): ToolResult {
  let config;
  try {
    config = loadConfig();
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    return text(
      `❌ Configuration error:\n\n${msg}\n\n` +
      `Please copy .env.example to .env and fill in your Azure DevOps details.`
    );
  }

  const result = await generateReleaseNote(config, sprint_name);

  if (result.step === "error") {
    return text(result.message);
  }

  const output = [
    `## 🔍 Azure DevOps Release Note Generator`,
    ``,
    result.message,
    ``,
    result.workItemsTable ?? "",
    ``,
    `---`,
    ``,
    `**Sprint:** ${result.sprintName ?? ""}`,
    `**Iteration Path:** ${result.iterationPath ?? ""}`,
    `**Wiki Page:** \`${result.pagePath ?? ""}\``,
    ``,
    `---`,
    ``,
    `How would you like to proceed?`,
    ``,
    `- Type **"Proceed and view the release note"** to preview the release note`,
    `- Type **"Don't proceed"** to exit`,
  ].join("\n");

  return text(output);
}

async function handlePreviewReleaseNote(sprint_name: string, iteration_path: string): ToolResult {
  let config;
  try {
    config = loadConfig();
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    return text(`❌ Configuration error: ${msg}`);
  }

  const result = await previewReleaseNote(config, sprint_name, iteration_path);

  if (result.step === "error") {
    return text(result.message);
  }

  const output = [
    `## 📄 Release Note Preview`,
    ``,
    `The following content will be published to the wiki:`,
    ``,
    `---`,
    ``,
    result.previewMarkdown ?? "",
    ``,
    `---`,
    ``,
    `**Wiki destination:** \`${result.pagePath ?? ""}\``,
    ``,
    `How would you like to proceed?`,
    ``,
    `- Type **"Publish release note"** to create the wiki page`,
    `- Type **"Don't proceed"** to exit without publishing`,
  ].join("\n");

  return text(output);
}

async function handlePublishReleaseNote(
  sprint_name: string,
  iteration_path: string,
  confirmed_overwrite: boolean | undefined
): ToolResult {
  let config;
  try {
    config = loadConfig();
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    return text(`❌ Configuration error: ${msg}`);
  }

  const pageName = formatPageName(config.releaseNoteNameFormat, sprint_name);
  const client = createAzureDevOpsClient(config);
  const pagePath = buildWikiPagePath(config.wikiBasePath, pageName);
  const { exists } = await checkWikiPageExists(client, config, pagePath);

  if (exists && !confirmed_overwrite) {
    return text([
      `⚠️  A wiki page already exists at \`${pagePath}\`.`,
      ``,
      `Proceeding will **overwrite** the existing page with the new release note content.`,
      ``,
      `- Type **"Yes, overwrite it"** to overwrite the existing page`,
      `- Type **"Don't proceed"** to cancel`,
    ].join("\n"));
  }

  const result = await publishReleaseNote(config, sprint_name, iteration_path);

  if (result.step === "error") {
    return text(result.message);
  }

  const output = [
    `## ✅ Release Note Published!`,
    ``,
    result.message,
    ``,
    `**Sprint:** ${sprint_name}`,
    `**Wiki Page:** \`${result.pagePath ?? pagePath}\``,
    ...(result.wikiUrl ? [`**URL:** ${result.wikiUrl}`] : []),
    ``,
    `The release note is now live on your Azure DevOps Wiki.`,
  ].join("\n");

  return text(output);
}

async function handleValidateConfig(): ToolResult {
  try {
    const config = loadConfig();
    const output = [
      `## ✅ Configuration Valid`,
      ``,
      `| Setting | Value |`,
      `|---------|-------|`,
      `| Organization | \`${config.org}\` |`,
      `| Project | \`${config.project}\` |`,
      `| PAT | \`${"*".repeat(8)}${config.pat.slice(-4)}\` |`,
      `| Wiki ID | \`${config.wikiId}\` |`,
      `| Wiki Base Path | \`${config.wikiBasePath}\` |`,
      `| Release Note Name Format | \`${config.releaseNoteNameFormat}\` |`,
      `| Iteration Path Prefix | \`${config.iterationPathPrefix}\` |`,
      `| Work Item Types | \`${config.workItemTypes.join(", ")}\` |`,
      ``,
      `All required settings are present. You can now run:`,
      `\`/generate release note for <sprint name>\``,
    ].join("\n");
    return text(output);
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    return text(
      `## ❌ Configuration Error\n\n${msg}\n\n` +
      `**Steps to fix:**\n` +
      `1. Copy \`.env.example\` to \`.env\`\n` +
      `2. Fill in all required values\n` +
      `3. Run \`validate_config\` again to confirm`
    );
  }
}

// ─── Tool registrations ───────────────────────────────────────────────────────

const server = new McpServer({
  name: "azure-devops-release-notes",
  version: "1.0.0",
});

server.registerTool(
  "generate_release_note",
  {
    description:
      "Fetch all work items for a sprint/iteration from Azure DevOps and display them for review. " +
      "Call this first when the user runs /generate release note for <sprint>.",
    inputSchema: { sprint_name: z.string().describe('The sprint or iteration name exactly as it appears in Azure DevOps, e.g. "Sprint 42", "Iteration 5", "PI3 Sprint 2", "2024.Q1"') } as any,
  },
  ({ sprint_name }: { sprint_name: string }) => handleGenerateReleaseNote(sprint_name)
);

server.registerTool(
  "preview_release_note",
  {
    description:
      "Render the release note markdown preview using the configured template. " +
      "Call this when the user says 'Proceed and view the release note'.",
    inputSchema: {
      sprint_name: z.string().describe('The formatted sprint name, e.g. "Sprint 42"'),
      iteration_path: z.string().describe('The full iteration path, e.g. "MyProject\\\\Sprint 42"'),
    } as any,
  },
  ({ sprint_name, iteration_path }: { sprint_name: string; iteration_path: string }) =>
    handlePreviewReleaseNote(sprint_name, iteration_path)
);

server.registerTool(
  "publish_release_note",
  {
    description:
      "Create or update the release note wiki page in Azure DevOps. " +
      "Call this when the user confirms they want to publish. " +
      "If the page already exists, ask the user to confirm overwrite first.",
    inputSchema: {
      sprint_name: z.string().describe('The formatted sprint name, e.g. "Sprint 42"'),
      iteration_path: z.string().describe('The full iteration path, e.g. "MyProject\\\\Sprint 42"'),
      confirmed_overwrite: z.boolean().optional().describe(
        "Set to true if the user has explicitly confirmed overwriting an existing page"
      ),
    } as any,
  },
  ({ sprint_name, iteration_path, confirmed_overwrite }: { sprint_name: string; iteration_path: string; confirmed_overwrite?: boolean }) =>
    handlePublishReleaseNote(sprint_name, iteration_path, confirmed_overwrite)
);

server.registerTool(
  "validate_config",
  {
    description:
      "Validate the current .env configuration and show what is configured. " +
      "Useful for troubleshooting setup issues.",
  },
  () => handleValidateConfig()
);

// ─── Start server ─────────────────────────────────────────────────────────────

async function main(): Promise<void> {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error("Azure DevOps Release Notes MCP server started.");
}

main().catch((err) => {
  console.error("Fatal error:", err);
  process.exit(1);
});
