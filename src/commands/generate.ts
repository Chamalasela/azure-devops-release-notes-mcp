import { PluginConfig, formatSprintName, buildIterationPath } from "../utils/config.js";
import {
  buildReleaseNoteData,
  renderTemplate,
  formatWorkItemsTable,
} from "../utils/templateEngine.js";
import { createAzureDevOpsClient } from "../services/azureDevops.js";
import {
  buildWiqlQuery,
  fetchWorkItemsByWiql,
  saveSharedQuery,
} from "../services/workItems.js";
import {
  checkWikiPageExists,
  createWikiPage,
  updateWikiPage,
  buildWikiPagePath,
  buildWikiUrl,
} from "../services/wiki.js";

export interface GenerateResult {
  step: "work_items" | "preview" | "published" | "cancelled" | "error";
  message: string;
  workItemsTable?: string;
  previewMarkdown?: string;
  wikiUrl?: string;
  sprintName?: string;
  iterationPath?: string;
  wiql?: string;
}

export async function generateReleaseNote(
  config: PluginConfig,
  sprintNumber: string
): Promise<GenerateResult> {
  try {
    // Build sprint name and iteration path
    const sprintName = formatSprintName(config.sprintNameFormat, sprintNumber);
    const iterationPath = buildIterationPath(
      config.iterationPathPrefix,
      sprintName
    );

    const client = createAzureDevOpsClient(config);

    // Build WIQL and fetch work items
    const wiql = buildWiqlQuery(iterationPath, config.workItemTypes, config.project);
    const workItems = await fetchWorkItemsByWiql(client, config, wiql);

    const workItemsTable = formatWorkItemsTable(workItems);

    // Save as shared query (best-effort, don't fail if it errors)
    const savedQuery = await saveSharedQuery(client, config, sprintName, wiql);

    let sharedQueryNote = "";
    if (savedQuery) {
      sharedQueryNote = `\n  📎 Shared query saved: ${savedQuery.url}`;
    }

    return {
      step: "work_items",
      message:
        `  ✅ Work items fetched for iteration: ${iterationPath}` +
        sharedQueryNote,
      workItemsTable,
      sprintName,
      iterationPath,
      wiql,
    };
  } catch (err: unknown) {
    const error = err as { message?: string; response?: { data?: { message?: string }; status?: number } };
    const detail =
      error?.response?.data?.message || error?.message || "Unknown error";
    const status = error?.response?.status;
    return {
      step: "error",
      message: buildErrorMessage(status, detail),
    };
  }
}

export async function previewReleaseNote(
  config: PluginConfig,
  sprintName: string,
  iterationPath: string
): Promise<GenerateResult> {
  try {
    const client = createAzureDevOpsClient(config);
    const wiql = buildWiqlQuery(iterationPath, config.workItemTypes, config.project);
    const workItems = await fetchWorkItemsByWiql(client, config, wiql);

    const data = buildReleaseNoteData(
      sprintName,
      iterationPath,
      config.project,
      workItems
    );
    const markdown = renderTemplate(config.templatePath, data);

    return {
      step: "preview",
      message: "  📄 Release note preview generated.",
      previewMarkdown: markdown,
      sprintName,
      iterationPath,
    };
  } catch (err: unknown) {
    const error = err as { message?: string; response?: { data?: { message?: string }; status?: number } };
    const detail =
      error?.response?.data?.message || error?.message || "Unknown error";
    return {
      step: "error",
      message: `  ❌ Error generating preview: ${detail}`,
    };
  }
}

export async function publishReleaseNote(
  config: PluginConfig,
  sprintName: string,
  iterationPath: string
): Promise<GenerateResult> {
  try {
    const client = createAzureDevOpsClient(config);
    const wiql = buildWiqlQuery(iterationPath, config.workItemTypes, config.project);
    const workItems = await fetchWorkItemsByWiql(client, config, wiql);

    const data = buildReleaseNoteData(
      sprintName,
      iterationPath,
      config.project,
      workItems
    );
    const markdown = renderTemplate(config.templatePath, data);
    const pagePath = buildWikiPagePath(config.wikiPathPrefix, sprintName);

    // Check if page already exists
    const { exists, eTag } = await checkWikiPageExists(
      client,
      config,
      pagePath
    );

    let result;
    if (exists && eTag) {
      result = await updateWikiPage(client, config, pagePath, markdown, eTag);
      const wikiUrl = result.url || buildWikiUrl(config, pagePath);
      return {
        step: "published",
        message: `  ✅ Wiki page updated successfully.`,
        wikiUrl,
      };
    } else {
      result = await createWikiPage(client, config, pagePath, markdown);
      const wikiUrl = result.url || buildWikiUrl(config, pagePath);
      return {
        step: "published",
        message: `  ✅ Wiki page created successfully.`,
        wikiUrl,
      };
    }
  } catch (err: unknown) {
    const error = err as { message?: string; response?: { data?: { message?: string }; status?: number } };
    const detail =
      error?.response?.data?.message || error?.message || "Unknown error";
    const status = error?.response?.status;
    return {
      step: "error",
      message: buildErrorMessage(status, detail),
    };
  }
}

function buildErrorMessage(status: number | undefined, detail: string): string {
  if (status === 401 || status === 403) {
    return (
      `  ❌ Authentication failed (HTTP ${status}).\n` +
      `  Please check your AZURE_DEVOPS_PAT in .env.\n` +
      `  The PAT needs: Work Items (Read), Wiki (Read & Write).\n` +
      `  Detail: ${detail}`
    );
  }
  if (status === 404) {
    return (
      `  ❌ Resource not found (HTTP 404).\n` +
      `  Check your AZURE_DEVOPS_ORG, AZURE_DEVOPS_PROJECT, and iteration path.\n` +
      `  Detail: ${detail}`
    );
  }
  return `  ❌ Azure DevOps API error${status ? ` (HTTP ${status})` : ""}: ${detail}`;
}
