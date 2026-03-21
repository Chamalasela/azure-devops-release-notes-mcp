import * as dotenv from "dotenv";
import * as fs from "fs";
import * as path from "path";

dotenv.config();

export interface PluginConfig {
  pat: string;
  org: string;
  project: string;
  iterationPathPrefix: string;
  sprintNameFormat: string;
  workItemTypes: string[];
  sharedQueryPath: string;
  wikiId: string;
  wikiPathPrefix: string;
  templatePath: string;
}

export function loadConfig(): PluginConfig {
  const missing: string[] = [];

  const required: Record<string, string | undefined> = {
    AZURE_DEVOPS_PAT: process.env.AZURE_DEVOPS_PAT,
    AZURE_DEVOPS_ORG: process.env.AZURE_DEVOPS_ORG,
    AZURE_DEVOPS_PROJECT: process.env.AZURE_DEVOPS_PROJECT,
    AZURE_DEVOPS_WIKI_ID: process.env.AZURE_DEVOPS_WIKI_ID,
  };

  for (const [key, value] of Object.entries(required)) {
    if (!value) missing.push(key);
  }

  if (missing.length > 0) {
    throw new Error(
      `Missing required environment variables: ${missing.join(", ")}\n` +
        `Please copy .env.example to .env and fill in the values.`
    );
  }

  const workItemTypesRaw =
    process.env.AZURE_DEVOPS_WORK_ITEM_TYPES || "User Story,Bug,Feature";
  const workItemTypes = workItemTypesRaw
    .split(",")
    .map((t) => t.trim())
    .filter(Boolean);

  const templatePath = path.resolve(
    process.env.RELEASE_NOTE_TEMPLATE_PATH || "./release-note-template.md"
  );

  if (!fs.existsSync(templatePath)) {
    throw new Error(
      `Release note template not found at: ${templatePath}\n` +
        `Please ensure the template file exists or update RELEASE_NOTE_TEMPLATE_PATH in .env`
    );
  }

  return {
    pat: process.env.AZURE_DEVOPS_PAT!,
    org: process.env.AZURE_DEVOPS_ORG!,
    project: process.env.AZURE_DEVOPS_PROJECT!,
    iterationPathPrefix:
      process.env.AZURE_DEVOPS_ITERATION_PATH_PREFIX ||
      process.env.AZURE_DEVOPS_PROJECT!,
    sprintNameFormat:
      process.env.AZURE_DEVOPS_SPRINT_NAME_FORMAT || "Sprint {{number}}",
    workItemTypes,
    sharedQueryPath:
      process.env.AZURE_DEVOPS_SHARED_QUERY_PATH ||
      "Shared Queries/Release Notes",
    wikiId: process.env.AZURE_DEVOPS_WIKI_ID!,
    wikiPathPrefix:
      process.env.AZURE_DEVOPS_WIKI_PATH_PREFIX || "/Release Notes",
    templatePath,
  };
}

export function formatSprintName(format: string, sprintNumber: string): string {
  return format.replace("{{number}}", sprintNumber);
}

export function buildIterationPath(prefix: string, sprintName: string): string {
  return `${prefix}\\${sprintName}`;
}
