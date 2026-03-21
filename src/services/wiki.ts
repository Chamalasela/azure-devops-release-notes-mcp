import { AxiosInstance } from "axios";
import { PluginConfig } from "../utils/config.js";

export interface WikiPageResult {
  path: string;
  url: string;
  remoteUrl: string;
  eTag?: string;
}

export async function checkWikiPageExists(
  client: AxiosInstance,
  config: PluginConfig,
  pagePath: string
): Promise<{ exists: boolean; eTag?: string }> {
  try {
    const response = await client.get(
      `/${config.project}/_apis/wiki/wikis/${encodeURIComponent(
        config.wikiId
      )}/pages?path=${encodeURIComponent(pagePath)}&api-version=7.1`
    );
    const eTag = response.headers["etag"] as string | undefined;
    return { exists: true, eTag };
  } catch (err: unknown) {
    const error = err as { response?: { status?: number } };
    if (error?.response?.status === 404) {
      return { exists: false };
    }
    throw err;
  }
}

export async function createWikiPage(
  client: AxiosInstance,
  config: PluginConfig,
  pagePath: string,
  content: string
): Promise<WikiPageResult> {
  const response = await client.put(
    `/${config.project}/_apis/wiki/wikis/${encodeURIComponent(
      config.wikiId
    )}/pages?path=${encodeURIComponent(pagePath)}&api-version=7.1`,
    { content },
    {
      headers: {
        "Content-Type": "application/json",
      },
    }
  );

  return {
    path: response.data.path,
    url: response.data._links?.html?.href || "",
    remoteUrl: response.data.remoteUrl || "",
    eTag: response.headers["etag"] as string | undefined,
  };
}

export async function updateWikiPage(
  client: AxiosInstance,
  config: PluginConfig,
  pagePath: string,
  content: string,
  eTag: string
): Promise<WikiPageResult> {
  const response = await client.put(
    `/${config.project}/_apis/wiki/wikis/${encodeURIComponent(
      config.wikiId
    )}/pages?path=${encodeURIComponent(pagePath)}&api-version=7.1`,
    { content },
    {
      headers: {
        "Content-Type": "application/json",
        "If-Match": eTag,
      },
    }
  );

  return {
    path: response.data.path,
    url: response.data._links?.html?.href || "",
    remoteUrl: response.data.remoteUrl || "",
  };
}

export function buildWikiPagePath(
  wikiPathPrefix: string,
  sprintName: string
): string {
  // Normalise prefix: ensure it starts with / and has no trailing /
  const prefix = wikiPathPrefix.startsWith("/")
    ? wikiPathPrefix
    : `/${wikiPathPrefix}`;
  const cleanPrefix = prefix.replace(/\/$/, "");

  // Sanitise sprint name for wiki path (replace spaces with -)
  const sanitisedSprint = sprintName.replace(/\s+/g, "-");

  return `${cleanPrefix}/${sanitisedSprint}`;
}

export function buildWikiUrl(config: PluginConfig, pagePath: string): string {
  const encodedPath = pagePath
    .split("/")
    .map((p) => encodeURIComponent(p))
    .join("/");
  return `https://dev.azure.com/${config.org}/${encodeURIComponent(
    config.project
  )}/_wiki/wikis/${encodeURIComponent(config.wikiId)}${encodedPath}`;
}
