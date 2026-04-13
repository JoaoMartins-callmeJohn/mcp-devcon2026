import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative, extname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = fileURLToPath(new URL(".", import.meta.url));
const statesDir = join(__dirname, "..", "code-states");

const STATE_META = [
  {
    id: "state-1",
    label: "1 - Core server (VS Code host)",
    description: "server.js with add + greet tools, connected via VS Code",
    chapter: "1",
  },
  {
    id: "state-2",
    label: "1 - Cost estimator challenge",
    description: "Adds estimate_cost tool, connected via VS Code",
    chapter: "1",
  },
  {
    id: "state-3",
    label: "2 - Weather tool",
    description: "Adds get_weather via Open-Meteo API, connected via VS Code",
    chapter: "2",
  },
  {
    id: "state-4",
    label: "3 - Autodesk APS (2-legged)",
    description:
      "server.js (weather) + standalone aps-server (OSS: list + create buckets), both in mcp.json",
    chapter: "3",
  },
  {
    id: "state-5",
    label: "4 - User Authentication with APS (3-legged)",
    description:
      "aps-server with OSS tools + 3-legged OAuth routes + get_user_info, connected directly via mcp.json",
    chapter: "4",
  },
  {
    id: "state-6",
    label: "5 - Advanced (client.js + agent.js)",
    description: "client.js calling all workshop tools + Gemini agent.js",
    chapter: "5",
  },
  {
    id: "state-7",
    label: "5 - Challenges (system prompt + REPL)",
    description:
      "agent.js with system prompt for AEC professionals and interactive REPL loop",
    chapter: "5",
  },
];

const LANG_MAP = {
  ".js": "javascript",
  ".json": "json",
  ".md": "markdown",
  ".env": "bash",
};

function walkDir(dir, baseDir) {
  const files = [];
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    const rel = relative(baseDir, full).replace(/\\/g, "/");
    const st = statSync(full);
    if (st.isDirectory()) {
      files.push(...walkDir(full, baseDir));
    } else {
      files.push({ fullPath: full, relativePath: rel });
    }
  }
  return files;
}

// File sort order: show root files before .vscode/
function sortFiles(files) {
  return [...files].sort((a, b) => {
    const aDepth = a.relativePath.split("/").length;
    const bDepth = b.relativePath.split("/").length;
    if (aDepth !== bDepth) return aDepth - bDepth;
    return a.relativePath.localeCompare(b.relativePath);
  });
}

export default {
  async load() {
    const { createHighlighter } = await import("shiki");

    const highlighter = await createHighlighter({
      themes: ["github-light", "github-dark"],
      langs: ["javascript", "json", "bash", "markdown"],
    });

    const states = STATE_META.map((meta) => {
      const stateDir = join(statesDir, meta.id);
      const rawFiles = walkDir(stateDir, stateDir);
      const sortedFiles = sortFiles(rawFiles);

      const files = sortedFiles.map(({ fullPath, relativePath }) => {
        const content = readFileSync(fullPath, "utf-8");
        const ext = extname(fullPath);
        const language = LANG_MAP[ext] ?? "text";

        const highlightedHtml = highlighter.codeToHtml(content, {
          lang: language,
          themes: { light: "github-light", dark: "github-dark" },
        });

        return { path: relativePath, content, highlightedHtml, language };
      });

      return { ...meta, files };
    });

    return { states };
  },
};
