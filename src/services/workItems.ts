import { AxiosInstance } from "axios";
import { PluginConfig } from "../utils/config.js";
import { WorkItem } from "../utils/templateEngine.js";

interface WiqlResult {
  workItems: Array<{ id: number; url: string }>;
}

interface WorkItemBatchResult {
  value: Array<{
    id: number;
    fields: Record<string, string>;
    _links: { html: { href: string } };
  }>;
}

export function buildWiqlQuery(
  iterationPath: string,
  workItemTypes: string[],
  project: string
): string {
  const typeFilter = workItemTypes
    .map((t) => `[System.WorkItemType] = '${t}'`)
    .join(" OR ");

  return `SELECT [System.Id], [System.Title], [System.State], [System.AssignedTo], [System.WorkItemType], [System.Description]
FROM WorkItems
WHERE [System.TeamProject] = '${project}'
AND [System.IterationPath] = '${iterationPath}'
AND (${typeFilter})
ORDER BY [System.WorkItemType], [System.Id]`;
}

export async function fetchWorkItemsByWiql(
  client: AxiosInstance,
  config: PluginConfig,
  wiql: string
): Promise<WorkItem[]> {
  // Step 1: Run the WIQL to get IDs
  const wiqlResponse = await client.post<WiqlResult>(
    `/${config.project}/_apis/wit/wiql?api-version=7.1`,
    { query: wiql }
  );

  const ids = wiqlResponse.data.workItems.map((w) => w.id);

  if (ids.length === 0) {
    return [];
  }

  // Step 2: Fetch full work item details in batches of 200
  const batchSize = 200;
  const allItems: WorkItem[] = [];

  for (let i = 0; i < ids.length; i += batchSize) {
    const batch = ids.slice(i, i + batchSize);

    const detailsResponse = await client.post<WorkItemBatchResult>(
      `/${config.project}/_apis/wit/workitemsbatch?api-version=7.1`,
      {
        ids: batch,
        fields: [
          "System.Id",
          "System.Title",
          "System.State",
          "System.AssignedTo",
          "System.WorkItemType",
          "System.Description",
        ],
      }
    );

    for (const item of detailsResponse.data.value) {
      const assignedTo = item.fields["System.AssignedTo"];
      // AssignedTo can be a string display name or an object with displayName
      const assignedToName =
        typeof assignedTo === "object" && assignedTo !== null
          ? (assignedTo as Record<string, string>).displayName || "Unassigned"
          : assignedTo || "Unassigned";

      allItems.push({
        id: item.id,
        title: item.fields["System.Title"] || "",
        state: item.fields["System.State"] || "",
        assignedTo: assignedToName,
        description: item.fields["System.Description"] || "",
        workItemType: item.fields["System.WorkItemType"] || "",
        url: `https://dev.azure.com/${encodeURIComponent(
          (client.defaults.baseURL || "").split("/")[3] || ""
        )}/${encodeURIComponent(item.fields["System.TeamProject"] || "")}/_workitems/edit/${item.id}`,
      });
    }
  }

  return allItems;
}

export async function saveSharedQuery(
  client: AxiosInstance,
  config: PluginConfig,
  sprintName: string,
  wiql: string
): Promise<{ id: string; url: string } | null> {
  try {
    // Parse the shared query path into folder + query name
    const pathParts = config.sharedQueryPath.split("/");
    const queryName = `Release Notes - ${sprintName}`;

    // Ensure the folder exists (or use root Shared Queries)
    const folderPath = pathParts.join("/");

    const response = await client.post(
      `/${config.project}/_apis/wit/queries/${encodeURIComponent(folderPath)}?api-version=7.1`,
      {
        name: queryName,
        wiql,
        queryType: "flat",
      }
    );

    return {
      id: response.data.id,
      url: response.data._links?.html?.href || "",
    };
  } catch {
    // Shared query saving is optional - don't fail the whole flow
    return null;
  }
}

export async function checkSharedQueryExists(
  client: AxiosInstance,
  config: PluginConfig,
  sprintName: string
): Promise<boolean> {
  try {
    const queryName = `Release Notes - ${sprintName}`;
    const folderPath = config.sharedQueryPath;
    await client.get(
      `/${config.project}/_apis/wit/queries/${encodeURIComponent(
        folderPath
      )}/${encodeURIComponent(queryName)}?api-version=7.1`
    );
    return true;
  } catch {
    return false;
  }
}
