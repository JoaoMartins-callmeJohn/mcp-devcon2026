<script setup>
import { ref, computed, watch, onMounted, nextTick } from "vue";

const props = defineProps({
  states: {
    type: Array,
    required: true,
  },
});

const activeStateIndex = ref(0);
const activeFilePath = ref(null);
const linkCopied = ref(false);

const activeState = computed(() => props.states[activeStateIndex.value]);
const activeFile = computed(
  () =>
    activeState.value.files.find((f) => f.path === activeFilePath.value) ??
    activeState.value.files[0],
);

// ── Hash-based deep linking ─────────────────────────────
// Format: #state-2:server.js
function applyHash(hash) {
  if (!hash) return;
  const [stateId, ...fileParts] = hash.slice(1).split(":");
  const filePath = fileParts.join(":");
  const idx = props.states.findIndex((s) => s.id === stateId);
  if (idx !== -1) {
    activeStateIndex.value = idx;
    if (filePath) {
      // Use nextTick so this runs after the watch(activeStateIndex) resets
      // activeFilePath to files[0], giving our target file the final word.
      nextTick(() => {
        activeFilePath.value = decodeURIComponent(filePath);
      });
    }
  }
}

onMounted(() => applyHash(window.location.hash));

// Keep URL hash in sync with current state/file
watch([activeStateIndex, activeFile], () => {
  if (typeof window === "undefined") return;
  const stateId = activeState.value.id;
  const filePath = activeFile.value?.path;
  if (filePath) {
    window.history.replaceState(
      null,
      "",
      `${window.location.pathname}#${stateId}:${encodeURIComponent(filePath)}`,
    );
  }
});

watch(activeStateIndex, () => {
  activeFilePath.value = activeState.value.files[0]?.path ?? null;
});

function onStateChange(event) {
  activeStateIndex.value = Number(event.target.value);
}

function selectFile(path) {
  activeFilePath.value = path;
}

function downloadFile() {
  const file = activeFile.value;
  if (!file) return;
  const blob = new Blob([file.content], { type: "text/plain" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = file.path.split("/").pop();
  a.click();
  URL.revokeObjectURL(url);
}

async function downloadZip() {
  const { default: JSZip } = await import("jszip");
  const zip = new JSZip();
  for (const file of activeState.value.files) {
    zip.file(file.path, file.content);
  }
  const blob = await zip.generateAsync({ type: "blob" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `${activeState.value.id}.zip`;
  a.click();
  URL.revokeObjectURL(url);
}

async function copyCode() {
  const code = activeFile.value?.content;
  if (!code) return;
  await navigator.clipboard.writeText(code);
  linkCopied.value = true;
  setTimeout(() => (linkCopied.value = false), 2000);
}

const FILE_ICONS = {
  js: `<svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"/></svg>`,
  json: `<svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M8 3H7a2 2 0 0 0-2 2v5a2 2 0 0 1-2 2 2 2 0 0 1 2 2v5c0 1.1.9 2 2 2h1"/><path d="M16 3h1a2 2 0 0 1 2 2v5a2 2 0 0 0 2 2 2 2 0 0 0-2 2v5a2 2 0 0 1-2 2h-1"/></svg>`,
  md: `<svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M14.5 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7.5L14.5 2z"/><polyline points="14 2 14 8 20 8"/><path d="M10 13l-2 2 2 2"/><path d="M14 17l2-2-2-2"/></svg>`,
  env: `<svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="7.5" cy="15.5" r="5.5"/><path d="M21 2l-9.6 9.6"/><path d="M15.5 7.5l3 3L22 7l-3-3"/></svg>`,
  file: `<svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M14.5 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7.5L14.5 2z"/><polyline points="14 2 14 8 20 8"/></svg>`,
};

function fileIconSvg(path) {
  if (path.endsWith(".js")) return FILE_ICONS.js;
  if (path.endsWith(".json")) return FILE_ICONS.json;
  if (path.endsWith(".md")) return FILE_ICONS.md;
  if (path.includes(".env")) return FILE_ICONS.env;
  return FILE_ICONS.file;
}

function fileIconClass(path) {
  if (path.endsWith(".js")) return "icon-js";
  if (path.endsWith(".json")) return "icon-json";
  if (path.endsWith(".md")) return "icon-md";
  if (path.includes(".env")) return "icon-env";
  return "icon-file";
}
</script>

<template>
  <div class="code-browser">
    <!-- State selector dropdown -->
    <div class="state-selector-bar">
      <label class="state-label" for="state-select">Snapshot:</label>
      <select
        id="state-select"
        class="state-select"
        :value="activeStateIndex"
        @change="onStateChange"
      >
        <option v-for="(state, index) in states" :key="state.id" :value="index">
          {{ state.label }}
        </option>
      </select>
      <span class="state-description">{{ activeState.description }}</span>
    </div>

    <!-- Split pane: file tree + code viewer -->
    <div class="browser-pane">
      <!-- Left: file tree -->
      <div class="file-tree" role="tree" aria-label="File tree">
        <button
          v-for="file in activeState.files"
          :key="file.path"
          role="treeitem"
          :aria-selected="file.path === activeFile.path"
          :class="['file-entry', { active: file.path === activeFile.path }]"
          @click="selectFile(file.path)"
        >
          <span
            class="file-icon"
            :class="fileIconClass(file.path)"
            v-html="fileIconSvg(file.path)"
          ></span>
          <span class="file-name">{{ file.path }}</span>
        </button>
      </div>

      <!-- Right: code viewer -->
      <div class="code-panel">
        <!-- Toolbar -->
        <div class="code-toolbar">
          <span class="toolbar-filename">{{ activeFile?.path }}</span>
          <div class="toolbar-actions">
            <button
              class="toolbar-btn"
              :title="linkCopied ? 'Copied!' : 'Copy code'"
              @click="copyCode"
            >
              <svg
                width="14"
                height="14"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                stroke-width="2"
                stroke-linecap="round"
                stroke-linejoin="round"
              >
                <rect x="9" y="9" width="13" height="13" rx="2" ry="2" />
                <path
                  d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"
                />
              </svg>
              {{ linkCopied ? "Copied!" : "Copy code" }}
            </button>
            <button
              class="toolbar-btn"
              title="Download this file"
              @click="downloadFile"
            >
              <svg
                width="14"
                height="14"
                viewBox="0 0 16 16"
                fill="currentColor"
              >
                <path d="M8 12l-4-4h2.5V4h3v4H12L8 12z" />
                <rect x="2" y="13" width="12" height="1.5" rx="0.75" />
              </svg>
              Download file
            </button>
            <button
              class="toolbar-btn toolbar-btn--primary"
              title="Download all files as ZIP"
              @click="downloadZip"
            >
              <svg
                width="14"
                height="14"
                viewBox="0 0 16 16"
                fill="currentColor"
              >
                <path d="M8 12l-4-4h2.5V4h3v4H12L8 12z" />
                <rect x="2" y="13" width="12" height="1.5" rx="0.75" />
              </svg>
              Download .zip
            </button>
          </div>
        </div>

        <!-- Highlighted code - always dark background -->
        <div class="code-content" v-html="activeFile?.highlightedHtml"></div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.code-browser {
  border: 1px solid var(--vp-c-border);
  border-radius: 8px;
  overflow: hidden;
  font-family: var(--vp-font-family-mono);
  font-size: 13px;
  width: 100%;
  margin: 24px 0;
}

/* State selector bar */
.state-selector-bar {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 8px 14px;
  background: var(--vp-c-bg-soft);
  border-bottom: 1px solid var(--vp-c-border);
  flex-wrap: wrap;
}

.state-label {
  font-size: 12px;
  font-family: var(--vp-font-family-base);
  color: var(--vp-c-text-2);
  white-space: nowrap;
}

.state-select {
  padding: 4px 28px 4px 10px;
  border: 1px solid var(--vp-c-border);
  border-radius: 5px;
  background: var(--vp-c-bg);
  color: var(--vp-c-text-1);
  font-size: 12px;
  font-family: var(--vp-font-family-base);
  cursor: pointer;
  appearance: none;
  -webkit-appearance: none;
  background-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='10' height='6' viewBox='0 0 10 6'%3E%3Cpath d='M0 0l5 6 5-6z' fill='%23888'/%3E%3C/svg%3E");
  background-repeat: no-repeat;
  background-position: right 8px center;
  min-width: 200px;
}

.state-select:focus {
  outline: 2px solid var(--vp-c-brand-1);
  outline-offset: 1px;
}

.state-description {
  font-size: 12px;
  font-family: var(--vp-font-family-base);
  color: var(--vp-c-text-2);
}

/* Split pane */
.browser-pane {
  display: flex;
  min-height: 420px;
  max-height: 680px;
  overflow: hidden;
}

/* File tree */
.file-tree {
  width: 220px;
  min-width: 180px;
  flex-shrink: 0;
  overflow-y: auto;
  background: var(--vp-c-bg-soft);
  border-right: 1px solid var(--vp-c-border);
  padding: 8px 0;
}

.file-entry {
  display: flex;
  align-items: center;
  gap: 6px;
  width: 100%;
  padding: 5px 12px;
  border: none;
  background: transparent;
  color: var(--vp-c-text-2);
  cursor: pointer;
  text-align: left;
  font-size: 12px;
  font-family: var(--vp-font-family-mono);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  transition:
    background 0.1s,
    color 0.1s;
}

.file-entry:hover {
  background: var(--vp-c-bg-mute);
  color: var(--vp-c-text-1);
}

.file-entry.active {
  background: var(--vp-c-brand-soft);
  color: var(--vp-c-brand-1);
}

.file-icon {
  width: 14px;
  height: 14px;
  flex-shrink: 0;
  display: flex;
  align-items: center;
  justify-content: center;
}

.icon-js {
  color: #e8c84a;
}
.icon-json {
  color: #a8b542;
}
.icon-md {
  color: #519aba;
}
.icon-env {
  color: #e37933;
}
.icon-file {
  color: var(--vp-c-text-3);
}

.file-name {
  overflow: hidden;
  text-overflow: ellipsis;
}

/* Code panel - adapts to VitePress light/dark theme */
.code-panel {
  flex: 1;
  display: flex;
  flex-direction: column;
  overflow: hidden;
  background: var(--vp-c-bg-soft);
}

:global(html.dark) .code-panel {
  background: #0d1117;
}

.code-toolbar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 6px 12px;
  background: var(--vp-c-bg-soft);
  border-bottom: 1px solid var(--vp-c-border);
  flex-shrink: 0;
}

.toolbar-filename {
  font-size: 12px;
  color: var(--vp-c-text-2);
  font-family: var(--vp-font-family-mono);
}

.toolbar-actions {
  display: flex;
  gap: 6px;
}

.toolbar-btn {
  display: flex;
  align-items: center;
  gap: 4px;
  padding: 4px 10px;
  border: 1px solid var(--vp-c-border);
  border-radius: 4px;
  background: var(--vp-c-bg);
  color: var(--vp-c-text-2);
  font-size: 11px;
  font-family: var(--vp-font-family-base);
  cursor: pointer;
  transition:
    background 0.15s,
    color 0.15s,
    border-color 0.15s;
}

.toolbar-btn:hover {
  background: var(--vp-c-bg-mute);
  color: var(--vp-c-text-1);
  border-color: var(--vp-c-brand-1);
}

.toolbar-btn--primary {
  background: var(--vp-c-brand-soft);
  color: var(--vp-c-brand-1);
  border-color: var(--vp-c-brand-1);
}

.toolbar-btn--primary:hover {
  background: var(--vp-c-brand-1);
  color: var(--vp-c-bg);
}

.code-content {
  flex: 1;
  overflow: auto;
  background: transparent;
}

:global(html.dark) .code-content {
  background: #0d1117;
}

.code-content :deep(pre) {
  margin: 0;
  padding: 16px;
  min-height: 100%;
  overflow: auto;
  border-radius: 0;
  font-size: 12.5px;
  line-height: 1.6;
}

.code-content :deep(code) {
  background: transparent !important;
}

@media (max-width: 640px) {
  .browser-pane {
    flex-direction: column;
    max-height: none;
  }

  .file-tree {
    width: 100%;
    min-width: unset;
    border-right: none;
    border-bottom: 1px solid var(--vp-c-border);
    max-height: 160px;
  }
}
</style>
