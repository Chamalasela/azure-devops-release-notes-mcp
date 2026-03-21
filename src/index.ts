import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import { loadConfig } from "./utils/config.js";
import {
  generateReleaseNote,
  previewReleaseNote,
  publishReleaseNote,
} from "./commands/generate.js";

const server = new McpServer({
  name: "azure-devops-release-notes",
  version: "1.0.0",
});

// ─── Tool: generate_release_note ────────────────────────────────────────────
// Step 1: Fetch work items for the given sprint and display them
server.tool(
  "generate_release_note",
  "Fetch all work items for a sprint/iteration from Azure DevOps and display them for review. " +
    "Call this first when the user runs /generate release note for <sprint>.",
  {
    sprint_number: z
      .string()
      .describe(
        'The sprint or iteration number or name, e.g. "42", "3", "2025-Q1"'
      ),
  },
  async ({ sprint_number }) => {
    let config;
    try {
      config = loadConfig();
    } catch (err: unknown) {
      const error = err as { message?: string };
      return {
        content: [
          {
            type: "text",
            text:
              `❌ Configuration error:\n\n${error?.message}\n\n` +
              `Please ensure you have a .env file configured. ` +
              `Copy .env.example to .env and fill in your Azure DevOps details.`,
          },
        ],
      };
    }

    const result = await generateReleaseNote(config, sprint_number);

    if (result.step === "error") {
      return { content: [{ type: "text", text: result.message }] };
    }

    const output = [
      `## 🔍 Azure DevOps Release Note Generator`,
      ``,
      result.message,
      ``,
      result.workItemsTable || "",
      ``,
      `---`,
      ``,
      `**Sprint:** ${result.sprintName}`,
      `**Iteration Path:** ${result.iterationPath}`,
      ``,
      `How would you like to proceed?`,
      ``,
      `- Type **"Proceed and view the release note"** to see a preview of the wiki page`,
      `- Type **"Don't proceed"** to exit`,
    ].join("\n");

    return { content: [{ type: "text", text: output }] };
  }
);

// ─── Tool: preview_release_note ──────────────────────────────────────────────
// Step 2: Render the release note markdown for review
server.tool(
  "preview_release_note",
  "Render the release note markdown preview using the configured template. " +
    "Call this when the user says 'Proceed and view the release note'.",
  {
    sprint_name: z
      .string()
      .describe('The formatted sprint name, e.g. "Sprint 42"'),
    iteration_path: z
      .string()
      .describe('The full iteration path, e.g. "MyProject\\\\Sprint 42"'),
  },
  async ({ sprint_name, iteration_path }) => {
    let config;
    try {
      config = loadConfig();
    } catch (err: unknown) {
      const error = err as { message?: string };
      return {
        content: [{ type: "text", text: `❌ Configuration error: ${error?.message}` }],
      };
    }

    const result = await previewReleaseNote(config, sprint_name, iteration_path);

    if (result.step === "error") {
      return { content: [{ type: "text", text: result.message }] };
    }

    const output = [
      `## 📄 Release Note Preview`,
      ``,
      `The following content will be published to the wiki:`,
      ``,
      `---`,
      ``,
      result.previewMarkdown || "",
      ``,
      `---`,
      ``,
      `**Wiki destination:** \`${config.wikiPathPrefix}/${sprint_name.replace(/\s+/g, "-")}\``,
      ``,
      `How would you like to proceed?`,
      ``,
      `- Type **"Publish release note"** to create the wiki page`,
      `- Type **"Don't proceed"** to exit without publishing`,
    ].join("\n");

    return { content: [{ type: "text", text: output }] };
  }
);

// ─── Tool: publish_release_note ──────────────────────────────────────────────
// Step 3: Publish to Azure DevOps Wiki (with overwrite confirmation)
server.tool(
  "publish_release_note",
  "Create or update the release note wiki page in Azure DevOps. " +
    "Call this when the user confirms they want to publish. " +
    "If the page already exists, ask the user to confirm overwrite first.",
  {
    sprint_name: z
      .string()
      .describe('The formatted sprint name, e.g. "Sprint 42"'),
    iteration_path: z
      .string()
      .describe('The full iteration path, e.g. "MyProject\\\\Sprint 42"'),
    confirmed_overwrite: z
      .boolean()
      .optional()
      .describe(
        "Set to true if the user has explicitly confirmed overwriting an existing page"
      ),
  },
  async ({ sprint_name, iteration_path, confirmed_overwrite }) => {
    let config;
    try {
      config = loadConfig();
    } catch (err: unknown) {
      const error = err as { message?: string };
      return {
        content: [{ type: "text", text: `❌ Configuration error: ${error?.message}` }],
      };
    }

    // Import wiki check inline to avoid circular deps
    const { createAzureDevOpsClient } = await import("./services/azureDevops.js");
    const { checkWikiPageExists, buildWikiPagePath } = await import("./services/wiki.js");

    const client = createAzureDevOpsClient(config);
    const pagePath = buildWikiPagePath(config.wikiPathPrefix, sprint_name);
    const { exists } = await checkWikiPageExists(client, config, pagePath);

    // If page exists and user hasn't confirmed overwrite, ask for confirmation
    if (exists && !confirmed_overwrite) {
      return {
        content: [
          {
            type: "text",
            text: [
              `⚠️  A wiki page already exists at \`${pagePath}\`.`,
              ``,
              `Proceeding will **overwrite** the existing page with the new release note content.`,
              ``,
              `- Type **"Yes, overwrite it"** to overwrite the existing page`,
              `- Type **"Don't proceed"** to cancel`,
            ].join("\n"),
          },
        ],
      };
    }

    const result = await publishReleaseNote(config, sprint_name, iteration_path);

    if (result.step === "error") {
      return { content: [{ type: "text", text: result.message }] };
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

    return { content: [{ type: "text", text: output }] };
  }
);

// ─── Tool: validate_config ───────────────────────────────────────────────────
// Utility: validate the current .env configuration
server.tool(
  "validate_config",
  "Validate the current .env configuration and show what is configured. " +
    "Useful for troubleshooting setup issues.",
  {},
  async () => {
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
        `| Template Path | \`${config.templatePath}\` |`,
        ``,
        `All required settings are present. You can now run:`,
        `\`/generate release note for <sprint number>\``,
      ].join("\n");

      return { content: [{ type: "text", text: output }] };
    } catch (err: unknown) {
      const error = err as { message?: string };
      return {
        content: [
          {
            type: "text",
            text:
              `## ❌ Configuration Error\n\n${error?.message}\n\n` +
              `**Steps to fix:**\n` +
              `1. Copy \`.env.example\` to \`.env\`\n` +
              `2. Fill in all required values\n` +
              `3. Run \`validate_config\` again to confirm`,
          },
        ],
      };
    }
  }
);

// ─── Start the server ────────────────────────────────────────────────────────
async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error("Azure DevOps Release Notes MCP server started.");
}

main().catch((err) => {
  console.error("Fatal error:", err);
  process.exit(1);
});
