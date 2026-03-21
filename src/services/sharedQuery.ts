import { AxiosInstance } from "axios";

interface QueryFolder {
  id: string;
  name: string;
  path: string;
  isFolder: boolean;
}

interface CreateQueryResponse {
  id: string;
  name: string;
  path: string;
  wiql: string;
}

export async function saveSharedQuery(
  client: AxiosInstance,
  project: string,
  queryPath: string,
  sprintName: string,
  wiql: string
): Promise<{ id: string; name: string; path: string } | null> {
  try {
    const queryName = `Release Note - ${sprintName}`;
    const folderPath = queryPath.split("/").map((p) => p.trim()).join("/");

    const response = await client.post<CreateQueryResponse>(
      `/${encodeURIComponent(project)}/_apis/wit/queries/${encodeURIComponent(folderPath)}?api-version=7.1`,
      {
        name: queryName,
        wiql,
        isFolder: false,
      }
    );

    return {
      id: response.data.id,
      name: response.data.name,
      path: response.data.path,
    };
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    console.error(`⚠️  Could not save shared query (non-fatal): ${message}`);
    return null;
  }
}

export async function checkQueryExists(
  client: AxiosInstance,
  project: string,
  queryPath: string,
  sprintName: string
): Promise<{ exists: boolean; id?: string }> {
  try {
    const queryName = `Release Note - ${sprintName}`;
    const fullPath = `${queryPath}/${queryName}`;

    const response = await client.get<QueryFolder>(
      `/${encodeURIComponent(project)}/_apis/wit/queries/${encodeURIComponent(fullPath)}?api-version=7.1`
    );

    return { exists: true, id: response.data.id };
  } catch {
    return { exists: false };
  }
}
