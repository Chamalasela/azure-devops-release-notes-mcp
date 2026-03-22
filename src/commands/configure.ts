import * as fs from "fs";
import * as path from "path";
import { PluginConfig } from "../utils/config.js";
import { createAzureDevOpsClient } from "../services/azureDevops.js";

export interface ConfigureResult {
  success: boolean;
  message: string;
}

interface ConfigField {
  envVar: string;
  description: string;
  example: string;
  required: boolean;
}

const CONFIG_FIELDS: ConfigField[] = [
  {
    envVar: "AZURE_DEVOPS_PAT",
    description: "Personal Access Token for authentication",
    example: "abc123xyz...",
    required: true,
  },
  {
    envVar: "AZURE_DEVOPS_ORG",
    description: "Organization name from dev.azure.com/{org}",
    example: "my-company",
    required: true,
  },
  {
    envVar: "AZURE_DEVOPS_PROJECT",
    description: "Project name",
    example: "MyProject",
    required: true,
  },
  {
    envVar: "AZURE_DEVOPS_WIKI_ID",
    description: "Wiki identifier (found in the Wiki URL)",
    example: "MyProject.wiki",
    required: true,
  },
  {
    envVar: "AZURE_DEVOPS_WORK_ITEM_TYPES",
    description: "Comma-separated work item types to include",
    example: "User Story,Bug,Feature",
    required: false,
  },
  {
    envVar: "AZURE_DEVOPS_ITERATION_PATH_PREFIX",
    description: "Iteration path prefix before the sprint name",
    example: "MyProject\\Team Alpha",
    required: false,
  },
  {
    envVar: "AZURE_DEVOPS_SPRINT_NAME_FORMAT",
    description: "Sprint name format — use {{number}} as placeholder",
    example: "Sprint {{number}}",
    required: false,
  },
  {
    envVar: "AZURE_DEVOPS_SHARED_QUERY_PATH",
    description: "Folder path for saving shared queries",
    example: "Shared Queries/Release Notes",
    required: false,
  },
  {
    envVar: "AZURE_DEVOPS_WIKI_PATH_PREFIX",
    description: "Wiki folder where release notes will be published",
    example: "/Release Notes",
    required: false,
  },
  {
    envVar: "RELEASE_NOTE_TEMPLATE_PATH",
    description: "Path to your Markdown template file",
    example: "./release-note-template.md",
    required: false,
  },
];

export function showConfigStatus(): ConfigureResult {
  const envPath = path.resolve(".env");
  const currentEnv: Record<string, string> = {};

  if (fs.existsSync(envPath)) {
    const content = fs.readFileSync(envPath, "utf-8");
    for (const line of content.split("\n")) {
      const match = line.match(/^([^#=\s][^=]*)=(.*)$/);
      if (match) currentEnv[match[1].trim()] = match[2].trim();
    }
  }

  const missing = CONFIG_FIELDS.filter(
    (f) => f.required && !currentEnv[f.envVar]
  );

  let message = `## ⚙️ Release Notes Plugin — Configuration Status\n\n`;

  if (missing.length === 0) {
    message += `✅ **All required fields are configured.**\n\n`;
  } else {
    message += `⚠️ **${missing.length} required field(s) missing** — add them to \`.env\`:\n`;
    for (const f of missing) {
      message += `  • \`${f.envVar}\`\n`;
    }
    message += `\n`;
  }

  message += `### All fields\n\n`;
  for (const field of CONFIG_FIELDS) {
    const val = currentEnv[field.envVar];
    const status = val ? "✅" : field.required ? "❌" : "⬜";
    const display = val
      ? field.envVar === "AZURE_DEVOPS_PAT"
        ? `\`${"•".repeat(8)}${val.slice(-4)}\``
        : `\`${val}\``
      : `_not set_ (example: \`${field.example}\`)`;
    message += `**${status} ${field.envVar}** — ${field.description}\n${display}\n\n`;
  }

  message += `---\n📁 Config file: \`${envPath}\`\n`;
  message += `📄 Template: Copy \`.env.example\` to \`.env\` to get started.\n`;

  return { success: true, message };
}

export async function validateConnection(
  config: PluginConfig
): Promise<ConfigureResult> {
  try {
    const client = createAzureDevOpsClient(config);

    // Test 1: project access
    await client.get(`/${encodeURIComponent(config.project)}/_apis/project?api-version=7.1`);

    // Test 2: wiki access
    let wikiStatus = "";
    try {
      await client.get(
        `/${encodeURIComponent(config.project)}/_apis/wiki/wikis/${encodeURIComponent(config.wikiId)}?api-version=7.1`
      );
      wikiStatus = `✅ Wiki \`${config.wikiId}\` found`;
    } catch {
      wikiStatus = `⚠️  Wiki \`${config.wikiId}\` not found — check AZURE_DEVOPS_WIKI_ID`;
    }

    const message = [
      `## ✅ Connection Successful`,
      ``,
      `| Setting | Value |`,
      `|---------|-------|`,
      `| Organization | \`${config.org}\` |`,
      `| Project | \`${config.project}\` |`,
      `| Iteration prefix | \`${config.iterationPathPrefix}\` |`,
      `| Work item types | \`${config.workItemTypes.join(", ")}\` |`,
      ``,
      wikiStatus,
      ``,
      `You're all set. Try: \`/generate release note for <sprint name>\``,
    ].join("\n");

    return { success: true, message };
  } catch (err: unknown) {
    const error = err as { message?: string; response?: { status?: number } };
    const status = error?.response?.status;
    let message = `## ❌ Connection Failed\n\n`;
    if (status === 401 || status === 403) {
      message += `Authentication error (HTTP ${status}).\n`;
      message += `• Check that \`AZURE_DEVOPS_PAT\` is valid and not expired\n`;
      message += `• Required PAT scopes: Work Items (Read), Wiki (Read & Write)\n`;
    } else if (status === 404) {
      message += `Project not found (HTTP 404).\n`;
      message += `• Check \`AZURE_DEVOPS_ORG\` and \`AZURE_DEVOPS_PROJECT\` in your .env\n`;
    } else {
      message += `${error?.message || "Unknown error"}\n`;
    }
    return { success: false, message };
  }
}
