<script setup lang="ts">
import Column from "primevue/column";
import DataTable from "primevue/datatable";
import Message from "primevue/message";
import ProgressSpinner from "primevue/progressspinner";
import Tag from "primevue/tag";
import { onMounted, ref } from "vue";
import { RouterLink } from "vue-router";
import { fetchPlugins, type PluginSummary } from "../api";
import PageHeader from "../components/PageHeader.vue";

const plugins = ref<PluginSummary[] | null>(null);
const error = ref<string | null>(null);

const COMPONENT_LABELS: Record<string, string> = { commands: "commands", agents: "agents", hooks: "hooks", mcp: "MCP" };

function componentSeverity(component: string): "warn" | "secondary" {
  return component === "hooks" || component === "mcp" ? "warn" : "secondary";
}

function repoUrl(plugin: PluginSummary): string {
  if (plugin.root === "." || !/^https?:\/\//.test(plugin.repository)) return plugin.repository;
  return `${plugin.repository.replace(/\/+$/, "")}/tree/HEAD/${plugin.root}`;
}

function browseLink(plugin: PluginSummary) {
  const query: Record<string, string> = { source: plugin.source };
  if (plugin.root !== ".") query.path = plugin.root;
  return { name: "browse", query };
}

async function load() {
  try {
    plugins.value = (await fetchPlugins()).plugins;
  } catch (cause) {
    error.value = cause instanceof Error ? cause.message : String(cause);
  }
}

onMounted(() => {
  document.title = "Plugins - ai-community-skills";
  load();
});
</script>

<template>
  <div class="page">
    <PageHeader
      title="Plugins"
      sub="Claude Code plugins found in the synced sources. acs installs the skills inside them, never the plugin itself: commands, agents, hooks, and MCP servers listed here only activate if you install the plugin with /plugin in Claude Code."
    />

    <Message v-if="error" severity="error">{{ error }}</Message>
    <div v-else-if="!plugins" class="empty"><ProgressSpinner style="width: 32px; height: 32px" strokeWidth="6" /></div>
    <div v-else-if="plugins.length === 0" class="panel">
      <div class="hint-box">No plugins found. Sync a source that packages its skills with a <code>.claude-plugin/plugin.json</code> manifest.</div>
    </div>
    <div v-else class="panel flush">
      <DataTable :value="plugins" size="small" paginator :rows="50" :rowsPerPageOptions="[25, 50, 100]">
        <Column field="name" header="Plugin" sortable>
          <template #body="{ data }">
            <RouterLink class="skill-name" :to="browseLink(data)">{{ data.name }}</RouterLink>
            <span class="muted small" v-if="data.version"> v{{ data.version }}</span>
            <div class="muted small plugin-description" v-if="data.description">{{ data.description }}</div>
            <div class="muted small mono" v-if="data.root !== '.'">{{ data.root }}</div>
          </template>
        </Column>
        <Column field="source" header="Source" sortable style="width: 240px">
          <template #body="{ data }">
            <RouterLink class="plain-link" :to="{ name: 'browse', query: { source: data.source } }">{{ data.source }}</RouterLink>
          </template>
        </Column>
        <Column field="skills" header="Skills" sortable style="width: 110px">
          <template #body="{ data }">
            <RouterLink class="plain-link" :to="browseLink(data)">{{ data.skills.toLocaleString() }}</RouterLink>
            <span class="muted small" v-if="data.riskLevels.high > 0"> · {{ data.riskLevels.high }} high</span>
          </template>
        </Column>
        <Column header="Also bundles" style="width: 260px">
          <template #body="{ data }">
            <span v-if="data.components.length === 0" class="muted small">skills only</span>
            <span v-else class="tag-row">
              <Tag v-for="component in data.components" :key="component" :value="COMPONENT_LABELS[component] ?? component" :severity="componentSeverity(component)" />
            </span>
          </template>
        </Column>
        <Column style="width: 60px">
          <template #body="{ data }">
            <a class="repo-link" :href="repoUrl(data)" target="_blank" rel="noopener" title="Open the plugin folder on GitHub" aria-label="Open the plugin folder on GitHub">
              <i class="pi pi-github"></i>
            </a>
          </template>
        </Column>
      </DataTable>
    </div>
  </div>
</template>
