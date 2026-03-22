import * as dotenv from "dotenv";

dotenv.config();

export interface PluginConfig {
  pat: string;
  org: string;
  project: string;
  wikiId: string;
  wikiBasePath: string;
  iterationPathPrefix: string;
  workItemTypes: string[];
  sharedQueryPath: string;
  releaseNoteNameFormat: string;
}

export function parseWikiUrl(wikiUrl: string): {
  org: string;
  project: string;
  wikiId: string;
  basePath: string;
} {
  // Expected: https://dev.azure.com/{org}/{project}/_wiki/wikis/{wikiId}?pagePath=/Your/Path
  let url: URL;
  try {
    url = new URL(wikiUrl);
  } catch {
    throw new Error(
      `Invalid AZURE_DEVOPS_WIKI_URL: "${wikiUrl}"\n` +
      `Expected format: https://dev.azure.com/{org}/{project}/_wiki/wikis/{wiki-id}?pagePath=/Your/Path\n` +
      `Copy this URL directly from your browser when viewing your Azure DevOps Wiki.`
    );
  }

  const parts = url.pathname.split("/").filter(Boolean);
  // pathname: /{org}/{project}/_wiki/wikis/{wikiId}
  const org = parts[0];
  const project = parts[1];
  const wikiId = parts[4];
  const basePath = url.searchParams.get("pagePath") || "/Release-Notes";

  if (!org || !project || !wikiId) {
    throw new Error(
      `Could not parse org, project, or wiki ID from AZURE_DEVOPS_WIKI_URL.\n` +
      `Expected: https://dev.azure.com/{org}/{project}/_wiki/wikis/{wiki-id}?pagePath=/Your/Path\n` +
      `Got: ${wikiUrl}`
    );
  }

  return { org, project, wikiId, basePath };
}

export function loadConfig(): PluginConfig {
  const missing: string[] = [];
  if (!process.env.AZURE_DEVOPS_PAT) missing.push("AZURE_DEVOPS_PAT");
  if (!process.env.AZURE_DEVOPS_WIKI_URL) missing.push("AZURE_DEVOPS_WIKI_URL");

  if (missing.length > 0) {
    throw new Error(
      `Missing required environment variables: ${missing.join(", ")}\n` +
      `Please copy .env.example to .env and fill in the values.`
    );
  }

  const { org, project, wikiId, basePath } = parseWikiUrl(
    process.env.AZURE_DEVOPS_WIKI_URL!
  );

  const workItemTypesRaw =
    process.env.AZURE_DEVOPS_WORK_ITEM_TYPES || "User Story,Bug,Feature";
  const workItemTypes = workItemTypesRaw
    .split(",")
    .map((t) => t.trim())
    .filter(Boolean);

  return {
    pat: process.env.AZURE_DEVOPS_PAT!,
    org,
    project,
    wikiId,
    wikiBasePath: basePath,
    iterationPathPrefix:
      process.env.AZURE_DEVOPS_ITERATION_PATH_PREFIX || project,
    workItemTypes,
    sharedQueryPath:
      process.env.AZURE_DEVOPS_SHARED_QUERY_PATH || "Shared Queries/Release Notes",
    releaseNoteNameFormat:
      process.env.RELEASE_NOTE_NAME_FORMAT || "{{sprintName}}",
  };
}

export function formatPageName(format: string, sprintName: string): string {
  return format.replace("{{sprintName}}", sprintName);
}

export function buildIterationPath(prefix: string, sprintName: string): string {
  return `${prefix}\\${sprintName}`;
}
