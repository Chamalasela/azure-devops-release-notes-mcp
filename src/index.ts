import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import { loadConfig, isUsingDefaultTemplate, templateSourceLabel } from "./utils/config.js";
import {
  generateReleaseNote,
  previewReleaseNote,
  publishReleaseNote,
} from "./commands/generate.js";
import { createAzureDevOpsClient } from "./services/azureDevops.js";
import { checkWikiPageExists, buildWikiPagePath } from "./services/wiki.js";
import { detectTemplateSource, loadTemplate, describeTemplateSource } from "./services/templateLoader.js";

// Explicit return type for all tool handlers — prevents TS2589 deep inference error
type ToolResult = Promise<{ content: Array<{ type: "text"; text: string }> }>;

// ─── Helper ───────────────────────────────────────────────────────────────────

function text(str: string): { content: Array<{ type: "text"; text: string }> } {
  return { content: [{ type: "text", text: str }] };
}

// ─── Tool handlers (named functions with explicit return types) ───────────────

async function handleGenerateReleaseNote(sprint_number: string): ToolResult {
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

  const result = await generateReleaseNote(config, sprint_number);

  if (result.step === "error") {
    return text(result.message);
  }

  const usingDefault = isUsingDefaultTemplate(config);
  const templateStatus = usingDefault
    ? [
        `> 📄 **Template:** Using the **default template** (\`release-note-template.md\`)`,
        `> 💡 You can use a custom template by setting \`RELEASE_NOTE_TEMPLATE_URL\` in your \`.env\``,
        `>    to a remote URL or an Azure DevOps Wiki page URL.`,
      ].join("\n")
    : `> 📄 **Template:** Using your custom template — ${templateSourceLabel(config)}`;

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
    ``,
    templateStatus,
    ``,
    `---`,
    ``,
    `How would you like to proceed?`,
    ``,
    `- Type **"Proceed and view the release note"** to preview with the template above`,
    `- Type **"Use a different template"** to provide a custom template URL`,
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

  const wikiDest = `${config.wikiPathPrefix}/${sprint_name.replace(/\s+/g, "-")}`;

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
    `**Wiki destination:** \`${wikiDest}\``,
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

  const client = createAzureDevOpsClient(config);
  const pagePath = buildWikiPagePath(config.wikiPathPrefix, sprint_name);
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
    `**Wiki Page:** \`${pagePath}\``,
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
      `| Iteration Path Prefix | \`${config.iterationPathPrefix}\` |`,
      `| Sprint Name Format | \`${config.sprintNameFormat}\` |`,
      `| Work Item Types | \`${config.workItemTypes.join(", ")}\` |`,
      `| Shared Query Path | \`${config.sharedQueryPath}\` |`,
      `| Wiki ID | \`${config.wikiId}\` |`,
      `| Wiki Path Prefix | \`${config.wikiPathPrefix}\` |`,
      `| Template | \`${templateSourceLabel(config)}\` |`,
      ``,
      `All required settings are present. You can now run:`,
      `\`/generate release note for <sprint number>\``,
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

async function handleSetTemplateSource(source: string): ToolResult {
  let config;
  try {
    config = loadConfig();
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    return text(`❌ Configuration error: ${msg}`);
  }

  const detected = detectTemplateSource(source);

  let content: string;
  try {
    content = await loadTemplate(source, config);
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    return text(
      `## ❌ Template Load Failed\n\n` +
      `**Source:** ${describeTemplateSource(source)}\n\n` +
      `**Error:** ${msg}`
    );
  }

  const lineCount = content.split("\n").length;
  const preview = content.split("\n").slice(0, 10).join("\n");
  const truncated = lineCount > 10 ? "\n..." : "";

  const output = [
    `## ✅ Template Loaded Successfully`,
    ``,
    `**Source type:** ${detected.type.replace(/_/g, " ")}`,
    `**Source:** ${describeTemplateSource(source)}`,
    `**Size:** ${lineCount} lines`,
    ``,
    `### First 10 lines preview`,
    ``,
    "```markdown",
    preview + truncated,
    "```",
    ``,
    `---`,
    `To use this template permanently, add to your \`.env\`:`,
    `\`\`\``,
    `RELEASE_NOTE_TEMPLATE_URL=${source}`,
    `\`\`\``,
  ].join("\n");

  return text(output);
}

// ─── Tool registrations ───────────────────────────────────────────────────────

const server = new McpServer({
  name: "azure-devops-release-notes",
  version: "1.0.0",
});

server.tool(
  "generate_release_note",
  "Fetch all work items for a sprint/iteration from Azure DevOps and display them for review. " +
    "Call this first when the user runs /generate release note for <sprint>.",
  { sprint_number: z.string().describe('The sprint or iteration number or name, e.g. "42", "Sprint 42"') },
  ({ sprint_number }) => handleGenerateReleaseNote(sprint_number)
);

server.tool(
  "preview_release_note",
  "Render the release note markdown preview using the configured template. " +
    "Call this when the user says 'Proceed and view the release note'.",
  {
    sprint_name: z.string().describe('The formatted sprint name, e.g. "Sprint 42"'),
    iteration_path: z.string().describe('The full iteration path, e.g. "MyProject\\\\Sprint 42"'),
  },
  ({ sprint_name, iteration_path }) => handlePreviewReleaseNote(sprint_name, iteration_path)
);

server.tool(
  "publish_release_note",
  "Create or update the release note wiki page in Azure DevOps. " +
    "Call this when the user confirms they want to publish. " +
    "If the page already exists, ask the user to confirm overwrite first.",
  {
    sprint_name: z.string().describe('The formatted sprint name, e.g. "Sprint 42"'),
    iteration_path: z.string().describe('The full iteration path, e.g. "MyProject\\\\Sprint 42"'),
    confirmed_overwrite: z.boolean().optional().describe(
      "Set to true if the user has explicitly confirmed overwriting an existing page"
    ),
  },
  ({ sprint_name, iteration_path, confirmed_overwrite }) =>
    handlePublishReleaseNote(sprint_name, iteration_path, confirmed_overwrite)
);

server.tool(
  "validate_config",
  "Validate the current .env configuration and show what is configured. " +
    "Useful for troubleshooting setup issues.",
  {},
  () => handleValidateConfig()
);

server.tool(
  "set_template_source",
  "Validate and preview a release note template from a URL or local file path. " +
    "Supports local file paths, raw GitHub/GitLab URLs, and Azure DevOps Wiki page URLs. " +
    "Call this when the user says 'use this template URL' or 'set my template to ...'.",
  {
    source: z.string().describe(
      "Template source: a local file path, remote URL, or Azure DevOps Wiki page URL"
    ),
  },
  ({ source }) => handleSetTemplateSource(source)
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
