<script setup lang="ts">
import Button from "primevue/button";
import Column from "primevue/column";
import DataTable from "primevue/datatable";
import Dialog from "primevue/dialog";
import Message from "primevue/message";
import ProgressSpinner from "primevue/progressspinner";
import Select from "primevue/select";
import { useToast } from "primevue/usetoast";
import { computed, onMounted, ref } from "vue";
import { RouterLink } from "vue-router";
import { addToCollection, fetchLibrary, toggleLike, toRef, type Library, type LibraryEntry } from "../api";
import BulkInstallDialog from "../components/BulkInstallDialog.vue";
import FlagTags from "../components/FlagTags.vue";
import LikeButton from "../components/LikeButton.vue";
import PageHeader from "../components/PageHeader.vue";
import RiskTag from "../components/RiskTag.vue";
import { skillRoute } from "../router";

const toast = useToast();
const library = ref<Library | null>(null);
const error = ref<string | null>(null);

type Row = LibraryEntry & { key: string };
const rows = computed<Row[]>(() => (library.value?.likes ?? []).map((entry) => ({ ...entry, key: `${entry.source}/${entry.path}` })));
const selection = ref<Row[]>([]);
const bulkOpen = ref(false);
const bulkBusy = ref(false);
const groupDialogOpen = ref(false);
const groupOptions = ref<{ label: string; value: string }[]>([]);
const selectedGroup = ref<string | null>(null);
const selectionRefs = computed(() => selection.value.filter((entry) => !entry.missing).map((entry) => toRef(entry)));

async function load() {
  try {
    library.value = await fetchLibrary();
    selection.value = [];
  } catch (cause) {
    error.value = cause instanceof Error ? cause.message : String(cause);
  }
}

async function unlikeSelected() {
  bulkBusy.value = true;
  try {
    for (const entry of selection.value) await toggleLike(toRef(entry));
    toast.add({ severity: "success", summary: `Removed ${selection.value.length} favorite${selection.value.length === 1 ? "" : "s"}`, life: 2500 });
    await load();
  } catch (cause) {
    toast.add({ severity: "error", summary: "Could not update favorites", detail: cause instanceof Error ? cause.message : String(cause), life: 4000 });
  } finally {
    bulkBusy.value = false;
  }
}

function openGroupDialog() {
  groupOptions.value = (library.value?.collections ?? []).map((collection) => ({ label: `${collection.name} (${collection.skills.length})`, value: collection.id }));
  selectedGroup.value = groupOptions.value[0]?.value ?? null;
  groupDialogOpen.value = true;
}

async function addSelectionToGroup() {
  if (!selectedGroup.value) return;
  bulkBusy.value = true;
  try {
    for (const ref of selectionRefs.value) await addToCollection(selectedGroup.value, ref);
    toast.add({ severity: "success", summary: `Added ${selectionRefs.value.length} skill${selectionRefs.value.length === 1 ? "" : "s"} to the group`, life: 2500 });
    groupDialogOpen.value = false;
    selection.value = [];
  } catch (cause) {
    toast.add({ severity: "error", summary: "Could not add to group", detail: cause instanceof Error ? cause.message : String(cause), life: 4000 });
  } finally {
    bulkBusy.value = false;
  }
}

function isPresent(entry: LibraryEntry): entry is LibraryEntry & { missing: false } {
  return !entry.missing;
}

function installedLabel(entry: LibraryEntry): string {
  if (!isPresent(entry) || entry.installed.length === 0) return "no";
  return entry.installed.map((item) => item.target).join(", ");
}

onMounted(() => {
  document.title = "Favorites - ai-community-skills";
  load();
});
</script>

<template>
  <div class="page">
    <PageHeader title="Favorites" sub="Skills you marked with a heart. Add them to groups to install and share them together." />

    <Message v-if="error" severity="error">{{ error }}</Message>
    <div v-else-if="!library" class="empty"><ProgressSpinner style="width: 32px; height: 32px" strokeWidth="6" /></div>
    <div v-else-if="library.likes.length === 0" class="panel">
      <div class="hint-box">No favorites yet. Use the heart on any skill in <RouterLink :to="{ name: 'browse' }">Browse</RouterLink> or on a skill page.</div>
    </div>
    <div v-else class="panel flush">
      <div class="bulk-bar" v-if="selection.length > 0">
        <span class="small"><strong>{{ selection.length }}</strong> selected</span>
        <Button label="Install" icon="pi pi-download" size="small" :disabled="selectionRefs.length === 0" @click="bulkOpen = true" />
        <Button label="Add to group" icon="pi pi-folder" size="small" severity="secondary" outlined :disabled="selectionRefs.length === 0" @click="openGroupDialog" />
        <Button label="Remove favorite" icon="pi pi-heart-fill" size="small" severity="danger" outlined :loading="bulkBusy" @click="unlikeSelected" />
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
              <div class="muted small">not in the index anymore ({{ data.source }})</div>
            </template>
          </template>
        </Column>
        <Column header="Source" style="width: 220px">
          <template #body="{ data }"><span class="small">{{ data.source }}</span></template>
        </Column>
        <Column header="Risk" style="width: 90px">
          <template #body="{ data }"><RiskTag v-if="isPresent(data)" :level="data.riskLevel" /></template>
        </Column>
        <Column header="Findings" style="width: 220px">
          <template #body="{ data }"><FlagTags v-if="isPresent(data)" :entry="data" /></template>
        </Column>
        <Column header="Installed" style="width: 100px">
          <template #body="{ data }"><span class="small" :class="{ muted: !isPresent(data) || data.installed.length === 0 }">{{ installedLabel(data) }}</span></template>
        </Column>
        <Column style="width: 60px">
          <template #body="{ data }"><LikeButton :skill="data" :liked="true" @change="load" /></template>
        </Column>
      </DataTable>
    </div>

    <BulkInstallDialog v-model:visible="bulkOpen" :skills="selectionRefs" @done="load" />

    <Dialog v-model:visible="groupDialogOpen" modal header="Add to group" :style="{ width: '420px', maxWidth: '95vw' }">
      <p class="muted small" style="margin: 0 0 10px">Add the selected skills to an existing group.</p>
      <div v-if="groupOptions.length === 0" class="hint-box">No groups yet. Create one from the Groups page first.</div>
      <Select v-else v-model="selectedGroup" :options="groupOptions" optionLabel="label" optionValue="value" style="width: 100%" />
      <template #footer>
        <Button label="Cancel" severity="secondary" text @click="groupDialogOpen = false" />
        <Button label="Add" :loading="bulkBusy" :disabled="!selectedGroup" @click="addSelectionToGroup" />
      </template>
    </Dialog>
  </div>
</template>
