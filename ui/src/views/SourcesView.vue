<script setup lang="ts">
import Button from "primevue/button";
import Checkbox from "primevue/checkbox";
import Column from "primevue/column";
import DataTable from "primevue/datatable";
import Dialog from "primevue/dialog";
import InputText from "primevue/inputtext";
import Message from "primevue/message";
import ProgressSpinner from "primevue/progressspinner";
import Slider from "primevue/slider";
import ToggleSwitch from "primevue/toggleswitch";
import { useConfirm } from "primevue/useconfirm";
import { useToast } from "primevue/usetoast";
import { onMounted, ref, watch } from "vue";
import { RouterLink } from "vue-router";
import { addSource, deleteSource, fetchSources, formatDate, suggestSourceName, updateSource, type SourceStats } from "../api";
import PageHeader from "../components/PageHeader.vue";
import SyncPanel from "../components/SyncPanel.vue";

const confirm = useConfirm();
const toast = useToast();
const sources = ref<SourceStats[] | null>(null);
const error = ref<string | null>(null);
const syncPanel = ref<InstanceType<typeof SyncPanel> | null>(null);

const dialog = ref(false);
const editing = ref<string | null>(null);
const form = ref({ name: "", repo: "", enabled: true, trust: 50 });
const formError = ref<string | null>(null);
const busy = ref(false);
const nameEdited = ref(false);
let suggestTimer: number | null = null;

async function load() {
  try {
    sources.value = (await fetchSources()).sources;
  } catch (cause) {
    error.value = cause instanceof Error ? cause.message : String(cause);
  }
}

function openAdd() {
  editing.value = null;
  form.value = { name: "", repo: "", enabled: true, trust: 50 };
  formError.value = null;
  nameEdited.value = false;
  dialog.value = true;
}

function openEdit(source: SourceStats) {
  editing.value = source.name;
  form.value = { name: source.name, repo: source.repo, enabled: source.enabled, trust: source.trust };
  formError.value = null;
  dialog.value = true;
}

async function suggest() {
  if (editing.value || nameEdited.value || form.value.repo.trim() === "") return;
  try {
    const repo = form.value.repo;
    const { name } = await suggestSourceName(repo);
    if (!editing.value && !nameEdited.value && form.value.repo === repo) form.value.name = name;
  } catch {
    return;
  }
}

watch(
  () => form.value.repo,
  () => {
    if (editing.value || nameEdited.value) return;
    if (suggestTimer !== null) window.clearTimeout(suggestTimer);
    suggestTimer = window.setTimeout(suggest, 350);
  },
);

function trustLabel(trust: number): string {
  if (trust >= 80) return "trusted";
  if (trust >= 50) return "normal";
  return "low trust";
}

async function save(syncAfter: boolean) {
  busy.value = true;
  formError.value = null;
  try {
    if (editing.value) {
      await updateSource({ name: editing.value, repo: form.value.repo, enabled: form.value.enabled, trust: form.value.trust });
      toast.add({ severity: "success", summary: `Source "${editing.value}" updated`, life: 2500 });
    } else {
      const result = await addSource({ name: form.value.name, repo: form.value.repo, enabled: form.value.enabled, trust: form.value.trust });
      toast.add({ severity: "success", summary: `Source "${result.source.name}" added`, life: 2500 });
      if (syncAfter && form.value.enabled) syncPanel.value?.start([result.source.name]);
    }
    dialog.value = false;
    await load();
  } catch (cause) {
    formError.value = cause instanceof Error ? cause.message : String(cause);
  } finally {
    busy.value = false;
  }
}

async function toggleEnabled(source: SourceStats, enabled: boolean) {
  try {
    await updateSource({ name: source.name, enabled });
    source.enabled = enabled;
    toast.add({ severity: "secondary", summary: `${source.name} ${enabled ? "enabled" : "disabled"}`, detail: enabled ? "Sync it to index its skills." : "Its skills leave the index on the next sync.", life: 3000 });
  } catch (cause) {
    toast.add({ severity: "error", summary: "Could not update source", detail: cause instanceof Error ? cause.message : String(cause), life: 4000 });
  }
}

function remove(source: SourceStats) {
  confirm.require({
    header: `Delete ${source.name}`,
    message: `This removes the source from config.json, drops its ${source.skills} indexed skills and embeddings, and deletes the cloned repository from disk. Installed copies are kept.`,
    icon: "pi pi-exclamation-triangle",
    rejectProps: { label: "Cancel", severity: "secondary", text: true },
    acceptProps: { label: "Delete source", severity: "danger" },
    accept: async () => {
      try {
        const result = await deleteSource({ name: source.name, removeFiles: true });
        toast.add({ severity: "success", summary: `Deleted ${source.name}`, detail: `${result.removedSkills} skills removed from the index`, life: 4000 });
        await load();
      } catch (cause) {
        toast.add({ severity: "error", summary: "Delete failed", detail: cause instanceof Error ? cause.message : String(cause), life: 5000 });
      }
    },
  });
}

function syncOne(source: SourceStats) {
  syncPanel.value?.start([source.name]);
}

function repoUrl(repo: string): string {
  if (/^https?:\/\//i.test(repo)) return repo;
  if (/^[A-Za-z0-9][A-Za-z0-9._-]*\/[A-Za-z0-9._-]+$/.test(repo)) return `https://github.com/${repo}`;
  return repo;
}

onMounted(() => {
  document.title = "Sources - ai-community-skills";
  load();
});
</script>

<template>
  <div class="page">
    <PageHeader title="Sources" sub="Git repositories that feed the index. Add a repository, sync it, and its skills show up in Browse.">
      <template #actions>
        <Button label="Add source" icon="pi pi-plus" @click="openAdd" />
      </template>
    </PageHeader>

    <Message v-if="error" severity="error">{{ error }}</Message>
    <div v-else-if="!sources" class="empty"><ProgressSpinner style="width: 32px; height: 32px" strokeWidth="6" /></div>
    <div v-else class="stack">
      <div class="panel flush sources-table">
        <DataTable :value="sources" size="small" sortField="skills" :sortOrder="-1" dataKey="name">
          <Column style="width: 52px" bodyStyle="text-align: center" headerStyle="text-align: center">
            <template #body="{ data }">
              <a class="repo-link" :href="repoUrl(data.repo)" target="_blank" rel="noopener" title="Open repository" aria-label="Open repository">
                <i :class="repoUrl(data.repo).includes('github.com') ? 'pi pi-github' : 'pi pi-external-link'"></i>
              </a>
            </template>
          </Column>
          <Column field="name" header="Source" sortable>
            <template #body="{ data }">
              <a class="skill-name plain-link" :href="repoUrl(data.repo)" target="_blank" rel="noopener" title="Open repository">{{ data.name }}</a>
              <div class="muted small">{{ data.repo.replace(/^https?:\/\/(www\.)?github\.com\//, "") }}</div>
            </template>
          </Column>
          <Column header="Enabled" style="width: 88px">
            <template #body="{ data }"><ToggleSwitch :modelValue="data.enabled" @update:modelValue="(value: boolean) => toggleEnabled(data, value)" /></template>
          </Column>
          <Column field="skills" header="Skills" sortable style="width: 100px">
            <template #body="{ data }">
              <span v-if="!data.cloned" class="muted small">not synced</span>
              <RouterLink v-else-if="data.skills > 0" class="mono" :to="{ name: 'browse', query: { source: data.name } }" title="Browse this source">{{ data.skills.toLocaleString() }}</RouterLink>
              <span v-else class="mono">0</span>
            </template>
          </Column>
          <Column field="trust" header="Trust" sortable style="width: 130px">
            <template #body="{ data }">
              <div class="quality-cell" style="max-width: 110px" :title="`${data.trust}/100, ${trustLabel(data.trust)}. Used to pick which copy survives dedupe.`">
                <span class="quality-track"><span class="quality-fill" :class="data.trust >= 80 ? 'good' : data.trust >= 50 ? 'fair' : 'poor'" :style="{ width: `${data.trust}%` }"></span></span>
                <span class="mono small">{{ data.trust }}</span>
              </div>
            </template>
          </Column>
          <Column header="Risk" style="width: 230px">
            <template #body="{ data }">
              <template v-if="data.skills > 0">
                <div class="risk-bar" :title="`${data.byRisk.low.toLocaleString()} low, ${data.byRisk.medium.toLocaleString()} medium, ${data.byRisk.high.toLocaleString()} high`">
                  <span class="rb-low" :style="{ flexGrow: data.byRisk.low }"></span>
                  <span class="rb-medium" :style="{ flexGrow: data.byRisk.medium }"></span>
                  <span class="rb-high" :style="{ flexGrow: data.byRisk.high }"></span>
                </div>
                <div class="risk-bar-legend">
                  <span class="rb-t-low">{{ data.byRisk.low.toLocaleString() }} low</span>
                  <span class="rb-t-medium">{{ data.byRisk.medium.toLocaleString() }} med</span>
                  <span class="rb-t-high">{{ data.byRisk.high.toLocaleString() }} high</span>
                </div>
              </template>
              <span v-else class="muted small">-</span>
            </template>
          </Column>
          <Column field="lastActivityDate" header="Activity" sortable style="width: 110px">
            <template #body="{ data }"><span class="mono">{{ formatDate(data.lastActivityDate) }}</span></template>
          </Column>
          <Column style="width: 170px">
            <template #body="{ data }">
              <div class="row-actions">
                <Button icon="pi pi-refresh" text rounded size="small" severity="secondary" title="Sync this source" aria-label="Sync" :disabled="!data.enabled" @click="syncOne(data)" />
                <Button icon="pi pi-pencil" text rounded size="small" severity="secondary" title="Edit" aria-label="Edit" @click="openEdit(data)" />
                <Button icon="pi pi-trash" text rounded size="small" severity="secondary" class="danger-hover" title="Delete" aria-label="Delete" @click="remove(data)" />
              </div>
            </template>
          </Column>
        </DataTable>
      </div>

      <div class="panel">
        <div class="panel-head"><h2>Sync</h2></div>
        <SyncPanel ref="syncPanel" @finished="load" />
      </div>
    </div>

    <Dialog v-model:visible="dialog" modal :header="editing ? `Edit ${editing}` : 'Add source'" :style="{ width: '520px', maxWidth: '95vw' }">
      <div class="form-row">
        <label for="src-repo">Repository</label>
        <InputText id="src-repo" v-model="form.repo" placeholder="https://github.com/owner/repo or owner/repo" autofocus @blur="suggest" />
      </div>
      <div class="form-row">
        <label for="src-name">Name <span v-if="editing">(cannot be changed, it keys the index and the cloned folder)</span></label>
        <InputText id="src-name" v-model="form.name" :disabled="editing !== null" placeholder="owner-repo" @input="nameEdited = true" />
      </div>
      <div class="form-row">
        <label for="src-trust">Trust <span class="mono">{{ form.trust }}</span> ({{ trustLabel(form.trust) }})</label>
        <Slider id="src-trust" v-model="form.trust" :min="0" :max="100" :step="5" style="margin: 10px 2px 4px" />
        <p class="muted small" style="margin: 6px 0 0">
          How much you trust this repository. When the same skill exists in more than one source, dedupe keeps the copy from the most trusted one. An official source like anthropics/skills deserves 100.
        </p>
      </div>
      <div class="form-inline" style="margin-bottom: 8px">
        <label><Checkbox v-model="form.enabled" binary inputId="src-enabled" /> Enabled</label>
      </div>
      <Message v-if="formError" severity="error" style="margin-top: 8px">{{ formError }}</Message>
      <template #footer>
        <Button label="Cancel" severity="secondary" text @click="dialog = false" />
        <Button v-if="!editing" label="Add" severity="secondary" outlined :loading="busy" :disabled="form.repo.trim() === ''" @click="save(false)" />
        <Button :label="editing ? 'Save' : 'Add and sync'" :loading="busy" :disabled="form.repo.trim() === ''" @click="save(true)" />
      </template>
    </Dialog>
  </div>
</template>
