<script setup lang="ts">
import Button from "primevue/button";
import Dialog from "primevue/dialog";
import InputText from "primevue/inputtext";
import Message from "primevue/message";
import ProgressSpinner from "primevue/progressspinner";
import Textarea from "primevue/textarea";
import { useToast } from "primevue/usetoast";
import { onMounted, ref } from "vue";
import { RouterLink, useRouter } from "vue-router";
import { createCollection, fetchLibrary, formatDate, importCollection, type Library } from "../api";
import PageHeader from "../components/PageHeader.vue";

const router = useRouter();
const toast = useToast();
const library = ref<Library | null>(null);
const error = ref<string | null>(null);

const createDialog = ref(false);
const name = ref("");
const description = ref("");
const importDialog = ref(false);
const importText = ref("");
const busy = ref(false);

async function load() {
  try {
    library.value = await fetchLibrary();
  } catch (cause) {
    error.value = cause instanceof Error ? cause.message : String(cause);
  }
}

async function create() {
  busy.value = true;
  try {
    const result = await createCollection({ name: name.value, description: description.value });
    createDialog.value = false;
    name.value = "";
    description.value = "";
    router.push({ name: "group", params: { id: result.collection.id } });
  } catch (cause) {
    toast.add({ severity: "error", summary: "Could not create group", detail: cause instanceof Error ? cause.message : String(cause), life: 4000 });
  } finally {
    busy.value = false;
  }
}

async function doImport() {
  busy.value = true;
  try {
    const data: unknown = JSON.parse(importText.value);
    const result = await importCollection(data);
    importDialog.value = false;
    importText.value = "";
    toast.add({
      severity: result.missing.length > 0 ? "warn" : "success",
      summary: `Imported "${result.collection.name}"`,
      detail: result.missing.length > 0 ? `${result.missing.length} skills are not in your index. Add their sources and sync.` : undefined,
      life: 5000,
    });
    router.push({ name: "group", params: { id: result.collection.id } });
  } catch (cause) {
    toast.add({ severity: "error", summary: "Import failed", detail: cause instanceof Error ? cause.message : String(cause), life: 5000 });
  } finally {
    busy.value = false;
  }
}

onMounted(() => {
  document.title = "Groups - ai-community-skills";
  load();
});
</script>

<template>
  <div class="page">
    <PageHeader title="Groups" sub="Named lists of skills you can install in one go and share as JSON.">
      <template #actions>
        <Button label="Import group" icon="pi pi-upload" severity="secondary" outlined @click="importDialog = true" />
        <Button label="New group" icon="pi pi-plus" @click="createDialog = true" />
      </template>
    </PageHeader>

    <Message v-if="error" severity="error">{{ error }}</Message>
    <div v-else-if="!library" class="empty"><ProgressSpinner style="width: 32px; height: 32px" strokeWidth="6" /></div>
    <div v-else-if="library.collections.length === 0" class="panel">
      <div class="hint-box">No groups yet. Create one here, or use "Add to group" on a skill page. Groups can be exported as JSON and imported on another machine.</div>
    </div>
    <div v-else class="group-grid">
      <RouterLink v-for="collection in library.collections" :key="collection.id" class="panel group-card" :to="{ name: 'group', params: { id: collection.id } }">
        <div class="group-name">{{ collection.name }}</div>
        <div class="muted small group-desc">{{ collection.description || "No description" }}</div>
        <div class="muted small" style="margin-top: auto">
          {{ collection.skills.length }} skill{{ collection.skills.length === 1 ? "" : "s" }}<span v-if="collection.skills.some((item) => item.missing)">, some missing from the index</span>, updated {{ formatDate(collection.updatedAt) }}
        </div>
      </RouterLink>
    </div>

    <Dialog v-model:visible="createDialog" modal header="New group" :style="{ width: '440px', maxWidth: '95vw' }">
      <div class="form-row">
        <label for="new-group-name">Name</label>
        <InputText id="new-group-name" v-model="name" autofocus @keyup.enter="create" />
      </div>
      <div class="form-row">
        <label for="new-group-desc">Description</label>
        <Textarea id="new-group-desc" v-model="description" rows="3" autoResize />
      </div>
      <template #footer>
        <Button label="Cancel" severity="secondary" text @click="createDialog = false" />
        <Button label="Create" :loading="busy" :disabled="name.trim() === ''" @click="create" />
      </template>
    </Dialog>

    <Dialog v-model:visible="importDialog" modal header="Import group" :style="{ width: '560px', maxWidth: '95vw' }">
      <p class="muted small" style="margin: 0 0 10px">Paste the JSON exported from another acs installation. Skills are matched by source name and path, so the same sources must be configured here.</p>
      <Textarea v-model="importText" rows="10" style="width: 100%; font-family: var(--acs-mono); font-size: 12.5px" placeholder='{ "format": "acs-collection", ... }' />
      <template #footer>
        <Button label="Cancel" severity="secondary" text @click="importDialog = false" />
        <Button label="Import" :loading="busy" :disabled="importText.trim() === ''" @click="doImport" />
      </template>
    </Dialog>
  </div>
</template>
