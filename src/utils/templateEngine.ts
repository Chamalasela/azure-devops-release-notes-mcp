import Handlebars from "handlebars";
import * as fs from "fs";

export interface WorkItem {
  id: number;
  title: string;
  state: string;
  assignedTo: string;
  description: string;
  workItemType: string;
  url: string;
}

export interface ReleaseNoteData {
  sprintName: string;
  generatedDate: string;
  project: string;
  iterationPath: string;
  totalCount: number;
  summary: Array<{ label: string; count: number }>;
  features: WorkItem[];
  userStories: WorkItem[];
  bugs: WorkItem[];
  tasks: WorkItem[];
  epics: WorkItem[];
}

function stripHtml(html: string): string {
  if (!html) return "";
  return html
    .replace(/<[^>]*>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/\s+/g, " ")
    .trim();
}

export function groupWorkItems(workItems: WorkItem[]): {
  features: WorkItem[];
  userStories: WorkItem[];
  bugs: WorkItem[];
  tasks: WorkItem[];
  epics: WorkItem[];
} {
  return {
    features: workItems.filter((w) => w.workItemType === "Feature"),
    userStories: workItems.filter((w) => w.workItemType === "User Story"),
    bugs: workItems.filter((w) => w.workItemType === "Bug"),
    tasks: workItems.filter((w) => w.workItemType === "Task"),
    epics: workItems.filter((w) => w.workItemType === "Epic"),
  };
}

export function buildReleaseNoteData(
  sprintName: string,
  iterationPath: string,
  project: string,
  workItems: WorkItem[]
): ReleaseNoteData {
  const grouped = groupWorkItems(workItems);
  const clean = (items: WorkItem[]) =>
    items.map((w) => ({ ...w, description: stripHtml(w.description) }));

  const features = clean(grouped.features);
  const userStories = clean(grouped.userStories);
  const bugs = clean(grouped.bugs);
  const tasks = clean(grouped.tasks);
  const epics = clean(grouped.epics);

  const summary: Array<{ label: string; count: number }> = [];
  if (features.length) summary.push({ label: "🚀 Features", count: features.length });
  if (userStories.length) summary.push({ label: "📖 User Stories", count: userStories.length });
  if (bugs.length) summary.push({ label: "🐛 Bug Fixes", count: bugs.length });
  if (tasks.length) summary.push({ label: "✅ Tasks", count: tasks.length });
  if (epics.length) summary.push({ label: "🏔️ Epics", count: epics.length });

  return {
    sprintName,
    generatedDate: new Date().toLocaleDateString("en-GB", {
      day: "2-digit",
      month: "long",
      year: "numeric",
    }),
    project,
    iterationPath,
    totalCount: workItems.length,
    summary,
    features,
    userStories,
    bugs,
    tasks,
    epics,
  };
}

export function renderTemplate(templatePath: string, data: ReleaseNoteData): string {
  const source = fs.readFileSync(templatePath, "utf-8");
  const template = Handlebars.compile(source);
  return template(data);
}

export function formatWorkItemsTable(workItems: WorkItem[]): string {
  if (workItems.length === 0) {
    return "No work items found for this iteration.";
  }

  const lines: string[] = [
    `Found **${workItems.length}** work item(s):\n`,
    `| ID | Type | Title |`,
    `|----|------|-------|`,
  ];

  for (const wi of workItems) {
    const id = `[#${wi.id}](${wi.url})`;
    const type = wi.workItemType;
    const title = wi.title.replace(/\|/g, "\\|");
    lines.push(`| ${id} | ${type} | ${title} |`);
  }

  return lines.join("\n");
}
