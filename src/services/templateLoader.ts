import * as fs from "fs";
import * as https from "https";
import * as http from "http";
import { PluginConfig } from "../utils/config.js";

type TemplateSourceType = "local_file" | "remote_url" | "azure_devops_wiki";

interface TemplateSource {
  type: TemplateSourceType;
}

export function detectTemplateSource(source: string): TemplateSource {
  if (source.includes("dev.azure.com") || source.includes("visualstudio.com")) {
    return { type: "azure_devops_wiki" };
  }
  if (source.startsWith("http://") || source.startsWith("https://")) {
    return { type: "remote_url" };
  }
  return { type: "local_file" };
}

export function describeTemplateSource(source: string): string {
  const { type } = detectTemplateSource(source);
  switch (type) {
    case "azure_devops_wiki":
      return `Azure DevOps Wiki page: ${source}`;
    case "remote_url":
      return `Remote URL: ${source}`;
    case "local_file":
      return `Local file: ${source}`;
  }
}

export async function loadTemplate(source: string, config: PluginConfig): Promise<string> {
  const { type } = detectTemplateSource(source);

  if (type === "local_file") {
    if (!fs.existsSync(source)) {
      throw new Error(`Template file not found: ${source}`);
    }
    return fs.readFileSync(source, "utf-8");
  }

  // Remote URL or Azure DevOps Wiki
  const headers: Record<string, string> = {};
  if (type === "azure_devops_wiki") {
    const token = Buffer.from(`:${config.pat}`).toString("base64");
    headers["Authorization"] = `Basic ${token}`;
  }

  return fetchUrl(source, headers);
}

function fetchUrl(url: string, headers: Record<string, string>): Promise<string> {
  return new Promise((resolve, reject) => {
    const lib = url.startsWith("https://") ? https : http;
    const req = lib.get(url, { headers }, (res) => {
      if (res.statusCode && res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
        fetchUrl(res.headers.location, headers).then(resolve).catch(reject);
        return;
      }
      if (res.statusCode && res.statusCode >= 400) {
        reject(new Error(`HTTP ${res.statusCode} fetching template from ${url}`));
        return;
      }
      const chunks: Buffer[] = [];
      res.on("data", (chunk: Buffer) => chunks.push(chunk));
      res.on("end", () => resolve(Buffer.concat(chunks).toString("utf-8")));
      res.on("error", reject);
    });
    req.on("error", reject);
  });
}
