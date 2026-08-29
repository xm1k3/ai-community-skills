<script setup lang="ts">
import Button from "primevue/button";
import Checkbox from "primevue/checkbox";
import Column from "primevue/column";
import DataTable from "primevue/datatable";
import Dialog from "primevue/dialog";
import InputText from "primevue/inputtext";
import Message from "primevue/message";
import ProgressSpinner from "primevue/progressspinner";
import Select from "primevue/select";
import SelectButton from "primevue/selectbutton";
import Tag from "primevue/tag";
import Textarea from "primevue/textarea";
import { useConfirm } from "primevue/useconfirm";
import { useToast } from "primevue/usetoast";
import { computed, onMounted, ref, watch } from "vue";
import { RouterLink, useRoute, useRouter } from "vue-router";
import {
  deleteCollection,
  exportCollection,
  fetchLibrary,
  formatDate,
  installCollection,
  planCollectionInstall,
  removeFromCollection,
  toRef,
  updateCollection,
  type Collection,
  type CollectionInstallItem,
  type CollectionInstallResult,
  type LibraryEntry,
} from "../api";
import FlagTags from "../components/FlagTags.vue";
import PageHeader from "../components/PageHeader.vue";
import RiskTag from "../components/RiskTag.vue";
import { skillRoute } from "../router";

const route = useRoute();
const router = useRouter();
const confirm = useConfirm();
const toast = useToast();

const collection = ref<Collection | null>(null);
const error = ref<string | null>(null);
const loading = ref(true);

const editDialog = ref(false);
const editName = ref("");
const editDescription = ref("");
const exportDialog = ref(false);
const exportText = ref("");
const busy = ref(false);

const installDialog = ref(false);
const target = ref("claude-code");
const scope = ref("personal");
const link = ref(false);
const force = ref(false);
const plan = ref<CollectionInstallItem[] | null>(null);
const results = ref<CollectionInstallResult[] | null>(null);
const installError = ref<string | null>(null);

const targets = [
  { label: "Claude Code", value: "claude-code" },
  { label: "Codex", value: "codex" },
  { label: "Web (zip archives)", value: "web" },
];
const scopes = [
  { label: "Personal", value: "personal" },
  { label: "Project", value: "project" },
];

const id = computed(() => String(route.params.id ?? ""));
const highRisk = computed(() => collection.value?.skills.filter((skill) => !skill.missing && skill.riskLevel === "high").length ?? 0);
const installable = computed(() => plan.value?.filter((item) => item.blockers.length === 0).length ?? 0);

function isPresent(entry: LibraryEntry): entry is LibraryEntry & { missing: false } {
  return !entry.missing;
}

function installedLabel(entry: LibraryEntry): string {
  if (!isPresent(entry) || entry.installed.length === 0) return "no";
  return entry.installed.map((item) => item.target).join(", ");
}

async function load() {
  loading.value = true;
  try {
    const library = await fetchLibrary();
    collection.value = library.collections.find((item) => item.id === id.value) ?? null;
    if (!collection.value) error.value = "This group does not exist.";
    else document.title = `${collection.value.name} - ai-community-skills`;
  } catch (cause) {
    error.value = cause instanceof Error ? cause.message : String(cause);
  } finally {
    loading.value = false;
  }
}

function openEdit() {
  if (!collection.value) return;
  editName.value = collection.value.name;
  editDescription.value = collection.value.description;
  editDialog.value = true;
}

async function saveEdit() {
  if (!collection.value) return;
  busy.value = true;
  try {
    await updateCollection({ id: collection.value.id, name: editName.value, description: editDescription.value });
    editDialog.value = false;
    await load();
  } catch (cause) {
    toast.add({ severity: "error", summary: "Could not save group", detail: cause instanceof Error ? cause.message : String(cause), life: 4000 });
  } finally {
    busy.value = false;
  }
}

async function remove(entry: LibraryEntry) {
  if (!collection.value) return;
  try {
    await removeFromCollection(collection.value.id, toRef(entry));
    await load();
  } catch (cause) {
    toast.add({ severity: "error", summary: "Could not remove skill", detail: cause instanceof Error ? cause.message : String(cause), life: 4000 });
  }
}

type Row = LibraryEntry & { key: string };
const rows = computed<Row[]>(() => (collection.value?.skills ?? []).map((entry) => ({ ...entry, key: `${entry.source}/${entry.path}` })));
const selection = ref<Row[]>([]);
const bulkBusy = ref(false);

async function removeSelected() {
  if (!collection.value) return;
  bulkBusy.value = true;
  try {
    for (const entry of selection.value) await removeFromCollection(collection.value.id, toRef(entry));
    toast.add({ severity: "success", summary: `Removed ${selection.value.length} skill${selection.value.length === 1 ? "" : "s"} from the group`, life: 2500 });
    selection.value = [];
    await load();
  } catch (cause) {
    toast.add({ severity: "error", summary: "Could not remove skills", detail: cause instanceof Error ? cause.message : String(cause), life: 4000 });
  } finally {
    bulkBusy.value = false;
  }
}

function destroy() {
  if (!collection.value) return;
  const current = collection.value;
  confirm.require({
    header: `Delete ${current.name}`,
    message: "The group is removed. Installed skills and favorites are not affected.",
    icon: "pi pi-exclamation-triangle",
    rejectProps: { label: "Cancel", severity: "secondary", text: true },
    acceptProps: { label: "Delete group", severity: "danger" },
    accept: async () => {
      try {
        await deleteCollection(current.id);
        toast.add({ severity: "success", summary: `Deleted ${current.name}`, life: 2500 });
        router.push({ name: "groups" });
      } catch (cause) {
        toast.add({ severity: "error", summary: "Delete failed", detail: cause instanceof Error ? cause.message : String(cause), life: 4000 });
      }
    },
  });
}

async function openExport() {
  if (!collection.value) return;
  try {
    exportText.value = JSON.stringify(await exportCollection(collection.value.id), null, 2);
    exportDialog.value = true;
  } catch (cause) {
    toast.add({ severity: "error", summary: "Export failed", detail: cause instanceof Error ? cause.message : String(cause), life: 4000 });
  }
}

async function copyExport() {
  try {
    await navigator.clipboard.writeText(exportText.value);
    toast.add({ severity: "secondary", summary: "Copied to clipboard", life: 2000 });
  } catch {
    toast.add({ severity: "warn", summary: "Could not copy, select the text manually", life: 3000 });
  }
}

function openInstall() {
  plan.value = null;
  results.value = null;
  installError.value = null;
  installDialog.value = true;
}

watch([target, scope, link, force], () => {
  plan.value = null;
  results.value = null;
});

async function preview() {
  if (!collection.value) return;
  busy.value = true;
  installError.value = null;
  try {
    plan.value = (await planCollectionInstall({ id: collection.value.id, target: target.value, scope: scope.value, link: target.value !== "web" && link.value, force: force.value })).items;
  } catch (cause) {
    installError.value = cause instanceof Error ? cause.message : String(cause);
  } finally {
    busy.value = false;
  }
}

async function confirmInstall() {
  if (!collection.value || !plan.value) return;
  busy.value = true;
  installError.value = null;
  try {
    const skip = plan.value.filter((item) => item.blockers.length > 0).map((item) => item.skill);
    results.value = (await installCollection({ id: collection.value.id, target: target.value, scope: scope.value, link: target.value !== "web" && link.value, force: force.value, skip })).results;
    const installed = results.value.filter((item) => item.status === "installed").length;
    toast.add({ severity: installed > 0 ? "success" : "warn", summary: `${installed} of ${results.value.length} skills installed`, life: 4000 });
    await load();
  } catch (cause) {
    installError.value = cause instanceof Error ? cause.message : String(cause);
  } finally {
    busy.value = false;
  }
}

watch(id, load);
onMounted(load);
</script>

<template>
  <div class="page">
    <div v-if="loading" class="empty"><ProgressSpinner style="width: 32px; height: 32px" strokeWidth="6" /></div>
    <template v-else-if="error || !collection">
      <div class="crumbs"><RouterLink :to="{ name: 'groups' }">Groups</RouterLink></div>
      <Message severity="error">{{ error ?? "This group does not exist." }}</Message>
    </template>
    <template v-else>
      <PageHeader :title="collection.name" :sub="collection.description || `${collection.skills.length} skills, updated ${formatDate(collection.updatedAt)}`">
        <template #crumbs>
          <div class="crumbs"><RouterLink :to="{ name: 'groups' }">Groups</RouterLink><span>/</span><span>{{ collection ? collection.name : "" }}</span></div>
        </template>
        <template #actions>
          <Button label="Edit" icon="pi pi-pencil" severity="secondary" outlined @click="openEdit" />
          <Button label="Export" icon="pi pi-share-alt" severity="secondary" outlined @click="openExport" />
          <Button label="Delete" icon="pi pi-trash" severity="danger" outlined @click="destroy" />
          <Button label="Install all" icon="pi pi-download" :disabled="collection.skills.length === 0" @click="openInstall" />
        </template>
      </PageHeader>

      <div class="panel flush">
        <div v-if="collection.skills.length === 0" class="hint-box" style="margin: 20px">
          This group is empty. Open a skill and use "Add to group", or browse <RouterLink :to="{ name: 'browse' }">the index</RouterLink>.
        </div>
        <template v-else>
        <div class="bulk-bar" v-if="selection.length > 0">
          <span class="small"><strong>{{ selection.length }}</strong> selected</span>
          <Button label="Remove from group" icon="pi pi-minus-circle" size="small" severity="danger" outlined :loading="bulkBusy" @click="removeSelected" />
          <Button label="Clear" size="small" severity="secondary" text @click="selection = []" />
        </div>
        <DataTable v-model:selection="selection" :value="rows" size="small" dataKey="key">
          <Column selectionMode="multiple" style="width: 40px" />
          <Column header="Skill">
            <template #body="{ data }">
              <template v-if="isPresent(data)">
                <RouterLink class="skill-name" :to="skillRoute(data)">{{ data.name }}</RouterLink>
                <div class="skill-desc small">{{ data.description }}</div>
              </template>
              <template v-else>
                <span class="skill-name">{{ data.name }}</span>
                <div class="muted small">not in the index, add the source "{{ data.source }}" and sync</div>
              </template>
            </template>
          </Column>
          <Column header="Source" style="width: 220px">
            <template #body="{ data }"><span class="small">{{ data.source }}</span></template>
          </Column>
          <Column header="Risk" style="width: 90px">
            <template #body="{ data }"><RiskTag v-if="isPresent(data)" :level="data.riskLevel" /><Tag v-else value="missing" severity="secondary" /></template>
          </Column>
          <Column header="Findings" style="width: 220px">
            <template #body="{ data }"><FlagTags v-if="isPresent(data)" :entry="data" /></template>
          </Column>
          <Column header="Installed" style="width: 100px">
            <template #body="{ data }"><span class="small" :class="{ muted: !isPresent(data) || data.installed.length === 0 }">{{ installedLabel(data) }}</span></template>
          </Column>
          <Column style="width: 60px">
            <template #body="{ data }"><Button icon="pi pi-times" text rounded severity="secondary" title="Remove from group" aria-label="Remove" @click="remove(data)" /></template>
          </Column>
        </DataTable>
        </template>
      </div>
    </template>

    <Dialog v-model:visible="editDialog" modal header="Edit group" :style="{ width: '440px', maxWidth: '95vw' }">
      <div class="form-row">
        <label for="edit-group-name">Name</label>
        <InputText id="edit-group-name" v-model="editName" autofocus />
      </div>
      <div class="form-row">
        <label for="edit-group-desc">Description</label>
        <Textarea id="edit-group-desc" v-model="editDescription" rows="3" autoResize />
      </div>
      <template #footer>
        <Button label="Cancel" severity="secondary" text @click="editDialog = false" />
        <Button label="Save" :loading="busy" :disabled="editName.trim() === ''" @click="saveEdit" />
      </template>
    </Dialog>

    <Dialog v-model:visible="exportDialog" modal header="Export group" :style="{ width: '620px', maxWidth: '95vw' }">
      <p class="muted small" style="margin: 0 0 10px">Share this JSON. Another acs installation can import it from Library, as long as the same sources are configured there.</p>
      <Textarea :modelValue="exportText" readonly rows="14" style="width: 100%; font-family: var(--acs-mono); font-size: 12.5px" />
      <template #footer>
        <Button label="Close" severity="secondary" text @click="exportDialog = false" />
        <Button label="Copy JSON" icon="pi pi-copy" @click="copyExport" />
      </template>
    </Dialog>

    <Dialog v-model:visible="installDialog" modal :header="`Install ${collection?.name ?? ''}`" :style="{ width: '680px', maxWidth: '95vw' }">
      <div class="form-row">
        <label for="grp-target">Target</label>
        <Select id="grp-target" v-model="target" :options="targets" optionLabel="label" optionValue="value" />
      </div>
      <div class="form-row" v-if="target !== 'web'">
        <label>Scope</label>
        <SelectButton v-model="scope" :options="scopes" optionLabel="label" optionValue="value" :allowEmpty="false" />
      </div>
      <div class="form-inline" style="margin-bottom: 16px">
        <label v-if="target !== 'web'"><Checkbox v-model="link" binary inputId="grp-link" /> Symlink instead of copy</label>
        <label><Checkbox v-model="force" binary inputId="grp-force" /> Overwrite if present</label>
      </div>
      <Message v-if="highRisk > 0 && !results" severity="warn">{{ highRisk }} skill{{ highRisk > 1 ? "s" : "" }} in this group {{ highRisk > 1 ? "are" : "is" }} rated high risk. Review them before installing.</Message>

      <DataTable v-if="plan && !results" :value="plan" size="small" style="margin-top: 12px" scrollable scrollHeight="320px">
        <Column header="Skill">
          <template #body="{ data }">
            <div class="skill-name">{{ data.skill.name }}</div>
            <div class="muted small">{{ data.skill.source }}</div>
          </template>
        </Column>
        <Column header="Risk" style="width: 90px">
          <template #body="{ data }"><RiskTag v-if="data.riskLevel" :level="data.riskLevel" /></template>
        </Column>
        <Column header="Plan">
          <template #body="{ data }">
            <div v-if="data.blockers.length > 0" class="small" style="color: var(--p-red-500)">skipped: {{ data.blockers.join("; ") }}</div>
            <template v-else>
              <div class="mono small">{{ data.destination }}</div>
              <div v-for="warning in data.warnings" :key="warning" class="small" style="color: var(--p-amber-600)">{{ warning }}</div>
            </template>
          </template>
        </Column>
      </DataTable>

      <DataTable v-if="results" :value="results" size="small" style="margin-top: 12px" scrollable scrollHeight="320px">
        <Column header="Skill">
          <template #body="{ data }"><div class="skill-name">{{ data.skill.name }}</div></template>
        </Column>
        <Column header="Result" style="width: 110px">
          <template #body="{ data }"><Tag :value="data.status" :severity="data.status === 'installed' ? 'success' : data.status === 'skipped' ? 'secondary' : 'danger'" /></template>
        </Column>
        <Column header="Detail">
          <template #body="{ data }"><span class="mono small">{{ data.detail }}</span></template>
        </Column>
      </DataTable>

      <Message v-if="installError" severity="error" style="margin-top: 12px">{{ installError }}</Message>

      <template #footer>
        <Button label="Close" severity="secondary" text @click="installDialog = false" />
        <Button v-if="!plan && !results" label="Preview" :loading="busy" @click="preview" />
        <Button v-else-if="plan && !results" :label="`Install ${installable} skill${installable === 1 ? '' : 's'}`" :disabled="installable === 0" :loading="busy" @click="confirmInstall" />
      </template>
    </Dialog>
  </div>
</template>
