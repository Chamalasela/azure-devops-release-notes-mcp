import axios, { AxiosInstance } from "axios";
import { PluginConfig } from "../utils/config.js";

export function createAzureDevOpsClient(config: PluginConfig): AxiosInstance {
  const token = Buffer.from(`:${config.pat}`).toString("base64");

  return axios.create({
    baseURL: `https://dev.azure.com/${config.org}`,
    headers: {
      Authorization: `Basic ${token}`,
      "Content-Type": "application/json",
    },
  });
}

export function createWikiClient(config: PluginConfig): AxiosInstance {
  const token = Buffer.from(`:${config.pat}`).toString("base64");

  return axios.create({
    baseURL: `https://dev.azure.com/${config.org}`,
    headers: {
      Authorization: `Basic ${token}`,
      "Content-Type": "application/json",
    },
  });
}
