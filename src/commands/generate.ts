import * as path from "path";
import {
  PluginConfig,
  formatPageName,
  buildIterationPath,
} from "../utils/config.js";
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

// Resolve bundled template relative to compiled output (dist/commands/ → project root)
const TEMPLATE_PATH = path.resolve(__dirname, "../../release-note-template.md");

export interface GenerateResult {
  step: "work_items" | "preview" | "published" | "cancelled" | "error";
  message: string;
  workItemsTable?: string;
  previewMarkdown?: string;
  wikiUrl?: string;
  sprintName?: string;
  iterationPath?: string;
  pagePath?: string;
  wiql?: string;
}

export async function generateReleaseNote(
  config: PluginConfig,
  sprintName: string
): Promise<GenerateResult> {
  try {
    const iterationPath = buildIterationPath(config.iterationPathPrefix, sprintName);
    const pageName = formatPageName(config.releaseNoteNameFormat, sprintName);
    const pagePath = buildWikiPagePath(config.wikiBasePath, pageName);

    const client = createAzureDevOpsClient(config);

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
        `  ✅ Work items fetched for iteration: ${iterationPath}` + sharedQueryNote,
      workItemsTable,
      sprintName,
      iterationPath,
      pagePath,
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

    const data = buildReleaseNoteData(sprintName, iterationPath, config.project, workItems);
    const markdown = renderTemplate(TEMPLATE_PATH, data);

    const pageName = formatPageName(config.releaseNoteNameFormat, sprintName);
    const pagePath = buildWikiPagePath(config.wikiBasePath, pageName);

    return {
      step: "preview",
      message: "  📄 Release note preview generated.",
      previewMarkdown: markdown,
      sprintName,
      iterationPath,
      pagePath,
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

    const data = buildReleaseNoteData(sprintName, iterationPath, config.project, workItems);
    const markdown = renderTemplate(TEMPLATE_PATH, data);

    const pageName = formatPageName(config.releaseNoteNameFormat, sprintName);
    const pagePath = buildWikiPagePath(config.wikiBasePath, pageName);

    const { exists, eTag } = await checkWikiPageExists(client, config, pagePath);

    let result;
    if (exists && eTag) {
      result = await updateWikiPage(client, config, pagePath, markdown, eTag);
      const wikiUrl = result.url || buildWikiUrl(config, pagePath);
      return {
        step: "published",
        message: `  ✅ Wiki page updated successfully.`,
        wikiUrl,
        pagePath,
      };
    } else {
      result = await createWikiPage(client, config, pagePath, markdown);
      const wikiUrl = result.url || buildWikiUrl(config, pagePath);
      return {
        step: "published",
        message: `  ✅ Wiki page created successfully.`,
        wikiUrl,
        pagePath,
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
      `  Check your AZURE_DEVOPS_WIKI_URL and iteration path in .env.\n` +
      `  Detail: ${detail}`
    );
  }
  if (status === 400 && detail.includes("TF51011")) {
    const pathMatch = detail.match(/[«"']([^»"']+)[»"']/);
    if (pathMatch) {
      const path = pathMatch[1];
      const segments = path.split("\\");
      const last = segments[segments.length - 1];
      const secondLast = segments[segments.length - 2];
      if (last === secondLast) {
        return (
          `  ❌ Azure DevOps API error (HTTP 400): Iteration path not found.\n` +
          `  The path "${path}" has a duplicated segment — "${last}" appears twice.\n` +
          `  Your AZURE_DEVOPS_ITERATION_PATH_PREFIX already ends with the sprint name.\n` +
          `  Fix: Remove "\\${last}" from the end of AZURE_DEVOPS_ITERATION_PATH_PREFIX in your .env.\n` +
          `  It should be the parent path only, e.g. "DeveloperExperience\\Developer Portal".`
        );
      }
    }
    return (
      `  ❌ Azure DevOps API error (HTTP 400): Iteration path not found.\n` +
      `  Check that AZURE_DEVOPS_ITERATION_PATH_PREFIX in your .env is the parent path\n` +
      `  (without the sprint name). The sprint name is appended automatically.\n` +
      `  Detail: ${detail}`
    );
  }
  return `  ❌ Azure DevOps API error${status ? ` (HTTP ${status})` : ""}: ${detail}`;
}
