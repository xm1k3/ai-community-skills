<script setup lang="ts">
import Button from "primevue/button";
import Column from "primevue/column";
import DataTable from "primevue/datatable";
import Message from "primevue/message";
import ToggleSwitch from "primevue/toggleswitch";
import { useConfirm } from "primevue/useconfirm";
import { useToast } from "primevue/usetoast";
import { onMounted, ref } from "vue";
import { applyDedupe, fetchDedupePreview, fetchSources, fetchStatus, formatDate, setDedupeAfterSync, type DedupePreview, type Status } from "../api";
import PageHeader from "../components/PageHeader.vue";
import SyncPanel from "../components/SyncPanel.vue";

const confirm = useConfirm();
const toast = useToast();
const status = ref<Status | null>(null);
const preview = ref<DedupePreview | null>(null);
const dedupeAfterSync = ref(false);
const error = ref<string | null>(null);
const busy = ref(false);
const showGroups = ref(false);

async function load() {
  try {
    const [statusResult, sources, dedupe] = await Promise.all([fetchStatus(), fetchSources(), fetchDedupePreview()]);
    status.value = statusResult;
    dedupeAfterSync.value = sources.dedupeAfterSync;
    preview.value = dedupe;
  } catch (cause) {
    error.value = cause instanceof Error ? cause.message : String(cause);
  }
}

async function toggleAuto(value: boolean) {
  try {
    const result = await setDedupeAfterSync(value);
    dedupeAfterSync.value = result.dedupeAfterSync;
    toast.add({ severity: "secondary", summary: result.dedupeAfterSync ? "Duplicates will be removed after every sync" : "Automatic dedupe disabled", life: 2500 });
  } catch (cause) {
    toast.add({ severity: "error", summary: "Could not save setting", detail: cause instanceof Error ? cause.message : String(cause), life: 4000 });
  }
}

function removeDuplicates() {
  if (!preview.value) return;
  confirm.require({
    header: "Remove duplicates",
    message: `${preview.value.removed} entries in ${preview.value.groupCount} groups will be removed from the index. Cloned files are not touched, and the entries come back on the next sync unless automatic dedupe is on.`,
    icon: "pi pi-exclamation-triangle",
    rejectProps: { label: "Cancel", severity: "secondary", text: true },
    acceptProps: { label: "Remove duplicates" },
    accept: async () => {
      busy.value = true;
      try {
        const result = await applyDedupe();
        toast.add({ severity: "success", summary: `Removed ${result.removed} duplicates`, detail: `${result.total} skills remain in the index`, life: 4000 });
        await load();
      } catch (cause) {
        toast.add({ severity: "error", summary: "Dedupe failed", detail: cause instanceof Error ? cause.message : String(cause), life: 5000 });
      } finally {
        busy.value = false;
      }
    },
  });
}

onMounted(() => {
  document.title = "Settings - ai-community-skills";
  load();
});
</script>

<template>
  <div class="page">
    <PageHeader title="Settings" sub="Refresh the sources, rebuild the index, remove duplicate entries, and see where the data lives." />
    <Message v-if="error" severity="error">{{ error }}</Message>

    <div class="stack">
      <div class="panel">
        <div class="panel-head"><h2>Sync</h2><span class="muted small" v-if="status">last index write {{ formatDate(status.lastSync) }}</span></div>
        <p class="muted small" style="margin: 0 0 14px">
          Clones or pulls every enabled source, rebuilds the index, recomputes risk flags, and reports installed skills whose upstream copy changed. Runs as a separate process, so the dashboard stays responsive.
        </p>
        <SyncPanel @finished="load" />
      </div>

      <div class="panel">
        <div class="panel-head">
          <h2>Duplicates <span class="count" v-if="preview">{{ preview.removed.toLocaleString() }}</span></h2>
          <label class="check-row" style="gap: 10px">
            <span class="muted small">Remove automatically after every sync</span>
            <ToggleSwitch :modelValue="dedupeAfterSync" @update:modelValue="toggleAuto" />
          </label>
        </div>
        <p class="muted small" style="margin: 0 0 14px">
          Two entries are duplicates when their normalized content matches: the whole skill body, every shipped file, and the meaningful frontmatter fields (name, description, tool settings). Catalog metadata in the frontmatter (aas-*, risk, source, date_added, tags, author) and whitespace differences are ignored, so the same skill published twice with different annotations still collapses. Of each set, the copy from the first source in config.json is kept, then the shortest path.
        </p>
        <template v-if="preview">
          <div class="grid-4" style="margin-bottom: 16px">
            <div class="panel stat"><div class="label">Index now</div><div class="value">{{ preview.before.toLocaleString() }}</div></div>
            <div class="panel stat"><div class="label">Duplicate entries</div><div class="value">{{ preview.removed.toLocaleString() }}</div><div class="sub">in {{ preview.groupCount.toLocaleString() }} identical sets</div></div>
            <div class="panel stat"><div class="label">After dedupe</div><div class="value">{{ preview.after.toLocaleString() }}</div></div>
            <div class="panel stat"><div class="label">Removed per source</div><div class="sub" style="margin-top: 6px"><div v-for="item in preview.bySource" :key="item.name">{{ item.name }}: {{ item.count.toLocaleString() }}</div><span v-if="preview.bySource.length === 0">none</span></div></div>
          </div>
          <div style="display: flex; gap: 8px; align-items: center">
            <Button :label="preview.removed > 0 ? `Remove ${preview.removed.toLocaleString()} duplicates` : 'No duplicates'" icon="pi pi-clone" :disabled="preview.removed === 0" :loading="busy" @click="removeDuplicates" />
            <Button v-if="preview.groups.length > 0" :label="showGroups ? 'Hide sets' : `Show ${preview.groups.length} sets${preview.truncated ? ' (first 200)' : ''}`" severity="secondary" text @click="showGroups = !showGroups" />
          </div>
          <DataTable v-if="showGroups" :value="preview.groups" size="small" style="margin-top: 16px" scrollable scrollHeight="480px">
            <Column header="Kept" style="width: 40%">
              <template #body="{ data }">
                <div class="skill-name">{{ data.keep.name }}</div>
                <div class="muted small mono">{{ data.keep.source }} / {{ data.keep.path || "." }}</div>
              </template>
            </Column>
            <Column header="Removed">
              <template #body="{ data }">
                <div v-for="item in data.remove" :key="item.source + item.path" class="muted small mono">{{ item.source }} / {{ item.path || "." }}</div>
              </template>
            </Column>
          </DataTable>
        </template>
      </div>

      <div class="panel" v-if="status">
        <div class="panel-head"><h2>Data</h2></div>
        <dl class="kv">
          <dt>Data directory</dt>
          <dd class="mono">{{ status.home }}</dd>
          <dt>Skills indexed</dt>
          <dd>{{ status.skills.toLocaleString() }}</dd>
          <dt>Search mode</dt>
          <dd>{{ status.mode === "semantic" ? `semantic (${status.provider} ${status.model}, ${status.embeddings.toLocaleString()} embeddings)` : "keyword only. Configure an embedding provider in config.json to enable semantic search." }}</dd>
          <dt>Installed</dt>
          <dd>{{ status.installed }}</dd>
          <dt>Favorites and groups</dt>
          <dd>{{ status.likes }} favorites, {{ status.groups }} groups</dd>
          <dt>Project directory</dt>
          <dd class="mono">{{ status.cwd }}</dd>
        </dl>
      </div>
    </div>
  </div>
</template>
