<script setup lang="ts">
import Button from "primevue/button";
import Checkbox from "primevue/checkbox";
import Chip from "primevue/chip";
import Column from "primevue/column";
import DataTable, { type DataTablePageEvent, type DataTableRowClickEvent, type DataTableSortEvent } from "primevue/datatable";
import Dialog from "primevue/dialog";
import InputText from "primevue/inputtext";
import Message from "primevue/message";
import MultiSelect from "primevue/multiselect";
import Select from "primevue/select";
import { useToast } from "primevue/usetoast";
import { computed, ref, watch } from "vue";
import { RouterLink, useRoute, useRouter, type LocationQueryRaw } from "vue-router";
import { addToCollection, browseSkills, fetchLibrary, formatDate, toggleLike, toRef, type BrowseResponse, type ListedEntry } from "../api";
import BulkInstallDialog from "../components/BulkInstallDialog.vue";
import FlagTags from "../components/FlagTags.vue";
import LikeButton from "../components/LikeButton.vue";
import PageHeader from "../components/PageHeader.vue";
import RiskTag from "../components/RiskTag.vue";
import { skillRoute } from "../router";

const DEFAULT_PAGE_SIZE = 50;
const PAGE_SIZES = [25, 50, 100];

const route = useRoute();
const router = useRouter();

const flagOptions = [
  { label: "Prompt injection suspected", value: "promptInjection" },
  { label: "Secret references", value: "secrets" },
  { label: "Destructive operations", value: "destructive" },
  { label: "Network calls", value: "network" },
  { label: "Ships scripts", value: "scripts" },
  { label: "Claude Code only", value: "claudeCodeOnly" },
  { label: "Portable (not Claude Code only)", value: "portable" },
  { label: "No findings at all", value: "clean" },
];

const sortOptions = computed(() => {
  const options = [
    { label: "Folder, top level first", value: "folder" },
    { label: "Name", value: "name" },
    { label: "Risk, highest first", value: "risk" },
    { label: "Recently updated", value: "updated" },
    { label: "Installed first", value: "installed" },
    { label: "Source stars", value: "stars" },
    { label: "Size, largest first", value: "size" },
  ];
  return current.value.query ? [{ label: "Relevance", value: "relevance" }, ...options] : options;
});

function str(value: unknown): string {
  return typeof value === "string" ? value : "";
}

function list(value: unknown): string[] {
  return str(value)
    .split(",")
    .map((item) => item.trim())
    .filter((item) => item !== "");
}

const current = computed(() => ({
  query: str(route.query.q),
  risk: list(route.query.risk),
  category: str(route.query.category),
  source: str(route.query.source),
  path: str(route.query.path),
  tag: str(route.query.tag),
  author: str(route.query.author),
  installed: str(route.query.installed),
  flags: list(route.query.flags),
  sort: str(route.query.sort) || (str(route.query.q) ? "relevance" : "folder"),
  order: str(route.query.order),
  page: Math.max(1, Number.parseInt(str(route.query.page), 10) || 1),
  size: PAGE_SIZES.includes(Number.parseInt(str(route.query.size), 10)) ? Number.parseInt(str(route.query.size), 10) : DEFAULT_PAGE_SIZE,
}));

const queryInput = ref(current.value.query);
const response = ref<BrowseResponse | null>(null);
const loading = ref(false);
const error = ref<string | null>(null);
const facets = ref<BrowseResponse["facets"] | null>(null);

function update(patch: Partial<Record<"q" | "risk" | "category" | "source" | "path" | "tag" | "author" | "installed" | "flags" | "sort" | "order" | "page" | "size", string>>) {
  const next: LocationQueryRaw = { ...route.query, ...patch };
  if (!("page" in patch)) delete next.page;
  for (const key of Object.keys(next)) {
    if (next[key] === "" || next[key] === undefined || next[key] === null) delete next[key];
  }
  router.push({ name: "browse", query: next });
}

function submit() {
  update({ q: queryInput.value.trim(), sort: "", order: "" });
}

function toggleRisk(level: string, checked: boolean) {
  const set = new Set(current.value.risk);
  if (checked) set.add(level);
  else set.delete(level);
  update({ risk: [...set].join(",") });
}

const SORT_FIELD_MAP: Record<string, string> = { name: "name", riskLevel: "risk", lastCommitDate: "updated", installed: "installed" };
const tableSortField = computed(() => Object.entries(SORT_FIELD_MAP).find(([, sort]) => sort === current.value.sort)?.[0]);
const tableSortOrder = computed(() => {
  if (current.value.order === "asc") return 1;
  if (current.value.order === "desc") return -1;
  return current.value.sort === "name" ? 1 : -1;
});

function onSort(event: DataTableSortEvent) {
  const sort = SORT_FIELD_MAP[String(event.sortField)] ?? "";
  if (!sort) return;
  update({ sort, order: event.sortOrder === 1 ? "asc" : "desc" });
}

function onPage(event: DataTablePageEvent) {
  if (event.rows !== current.value.size) {
    update({ size: event.rows === DEFAULT_PAGE_SIZE ? "" : String(event.rows), page: "" });
    return;
  }
  update({ page: String(event.page + 1) });
}

function onRowClick(event: DataTableRowClickEvent) {
  const target = event.originalEvent.target as HTMLElement | null;
  if (target && target.closest("a")) return;
  router.push(skillRoute(event.data as ListedEntry, current.value.query));
}

function reset() {
  queryInput.value = "";
  router.push({ name: "browse" });
}

function installedTitle(entry: ListedEntry): string {
  if (entry.installed.length === 0) return "Not installed";
  return `Installed: ${entry.installed.map((item) => `${item.target}${item.scope ? ` (${item.scope})` : ""}`).join(", ")}`;
}

const toast = useToast();
const selection = ref<ListedEntry[]>([]);
const bulkOpen = ref(false);
const groupDialogOpen = ref(false);
const groupOptions = ref<{ label: string; value: string }[]>([]);
const selectedGroup = ref<string | null>(null);
const bulkBusy = ref(false);

const selectionRefs = computed(() => selection.value.map((entry) => toRef(entry)));

async function favoriteSelected() {
  bulkBusy.value = true;
  try {
    const pending = selection.value.filter((entry) => !entry.liked);
    for (const entry of pending) {
      await toggleLike(toRef(entry));
      entry.liked = true;
    }
    toast.add({ severity: "success", summary: `Added ${pending.length} favorite${pending.length === 1 ? "" : "s"}`, life: 2500 });
    selection.value = [];
  } catch (cause) {
    toast.add({ severity: "error", summary: "Could not update favorites", detail: cause instanceof Error ? cause.message : String(cause), life: 4000 });
  } finally {
    bulkBusy.value = false;
  }
}

async function openGroupDialog() {
  try {
    const library = await fetchLibrary();
    groupOptions.value = library.collections.map((collection) => ({ label: `${collection.name} (${collection.skills.length})`, value: collection.id }));
    selectedGroup.value = groupOptions.value[0]?.value ?? null;
    groupDialogOpen.value = true;
  } catch (cause) {
    toast.add({ severity: "error", summary: "Could not load groups", detail: cause instanceof Error ? cause.message : String(cause), life: 4000 });
  }
}

async function addSelectionToGroup() {
  if (!selectedGroup.value) return;
  bulkBusy.value = true;
  try {
    for (const entry of selection.value) await addToCollection(selectedGroup.value, toRef(entry));
    toast.add({ severity: "success", summary: `Added ${selection.value.length} skill${selection.value.length === 1 ? "" : "s"} to the group`, life: 2500 });
    groupDialogOpen.value = false;
    selection.value = [];
  } catch (cause) {
    toast.add({ severity: "error", summary: "Could not add to group", detail: cause instanceof Error ? cause.message : String(cause), life: 4000 });
  } finally {
    bulkBusy.value = false;
  }
}

function onBulkInstalled() {
  selection.value = [];
  load();
}

const hasFilters = computed(
  () =>
    current.value.risk.length > 0 ||
    current.value.category !== "" ||
    current.value.source !== "" ||
    current.value.path !== "" ||
    current.value.tag !== "" ||
    current.value.author !== "" ||
    current.value.installed !== "" ||
    current.value.flags.length > 0 ||
    current.value.query !== "",
);

async function load() {
  loading.value = true;
  error.value = null;
  try {
    const data = await browseSkills(current.value);
    response.value = data;
    facets.value = data.facets;
    document.title = current.value.query ? `${current.value.query} - ai-community-skills` : "Browse - ai-community-skills";
  } catch (cause) {
    error.value = cause instanceof Error ? cause.message : String(cause);
    response.value = null;
  } finally {
    loading.value = false;
  }
}

watch(
  () => route.fullPath,
  () => {
    queryInput.value = current.value.query;
    selection.value = [];
    load();
  },
  { immediate: true },
);

const categoryOptions = computed(() => (facets.value?.categories ?? []).map((facet) => ({ label: `${facet.name} (${facet.count})`, value: facet.name })));
const sourceOptions = computed(() => (facets.value?.sources ?? []).map((facet) => ({ label: `${facet.name} (${facet.count})`, value: facet.name })));
const tagFacets = computed(() => (facets.value?.tags ?? []).slice(0, 18));
const folderFacets = computed(() => facets.value?.folders ?? []);
</script>

<template>
  <div class="page">
    <PageHeader title="Browse" :sub="response && response.mode === 'lexical' ? 'Keyword search over names, descriptions, and categories. Configure an embedding provider for semantic search.' : 'Search the whole index, then narrow it down with the filters.'">
      <template #actions>
        <form class="search-bar" style="width: 460px; max-width: 100%" @submit.prevent="submit">
          <InputText v-model="queryInput" placeholder="Search skills" />
          <Button type="submit" label="Search" :loading="loading" />
        </form>
      </template>
    </PageHeader>

    <div class="browse">
      <aside class="panel filters">
        <div class="group">
          <span class="group-label">Risk level</span>
          <label class="check-row" v-for="level in ['high', 'medium', 'low']" :key="level">
            <Checkbox :modelValue="current.risk.includes(level)" binary @update:modelValue="(checked: boolean) => toggleRisk(level, checked)" />
            <span>{{ level }}</span>
            <span class="count" v-if="facets">{{ facets.risk[level as 'high' | 'medium' | 'low'].toLocaleString() }}</span>
          </label>
        </div>
        <div class="group">
          <label for="source">Source</label>
          <Select id="source" :modelValue="current.source || null" :options="sourceOptions" optionLabel="label" optionValue="value" placeholder="All sources" showClear size="small" @update:modelValue="(value: string | null) => update({ source: value ?? '' })" />
        </div>
        <div class="group">
          <label for="category">Category</label>
          <Select id="category" :modelValue="current.category || null" :options="categoryOptions" optionLabel="label" optionValue="value" placeholder="All categories" showClear filter size="small" @update:modelValue="(value: string | null) => update({ category: value ?? '' })" />
        </div>
        <div class="group">
          <label for="installed-filter">Installed</label>
          <Select
            id="installed-filter"
            :modelValue="current.installed || null"
            :options="[{ label: 'Installed', value: 'yes' }, { label: 'Not installed', value: 'no' }]"
            optionLabel="label"
            optionValue="value"
            placeholder="Any"
            showClear
            size="small"
            @update:modelValue="(value: string | null) => update({ installed: value ?? '' })"
          />
        </div>
        <div class="group">
          <label for="flags">Findings</label>
          <MultiSelect id="flags" :modelValue="current.flags" :options="flagOptions" optionLabel="label" optionValue="value" placeholder="Any" size="small" display="chip" @update:modelValue="(value: string[]) => update({ flags: value.join(',') })" />
        </div>
        <div class="group" v-if="current.source && (folderFacets.length > 1 || current.path)">
          <span class="group-label">Folder</span>
          <div class="chips">
            <button v-if="current.path" type="button" class="chip active mono" @click="update({ path: '' })">{{ current.path }} ✕</button>
            <template v-for="facet in folderFacets" :key="facet.name">
              <button v-if="facet.name !== current.path" type="button" class="chip mono" @click="update({ path: facet.name })">{{ facet.name }} {{ facet.count }}</button>
            </template>
          </div>
        </div>
        <div class="group" v-if="tagFacets.length > 0 || current.tag">
          <span class="group-label">Tags</span>
          <div class="chips">
            <button v-if="current.tag" type="button" class="chip active" @click="update({ tag: '' })">{{ current.tag }} ✕</button>
            <template v-for="facet in tagFacets" :key="facet.name">
              <button v-if="facet.name !== current.tag" type="button" class="chip" @click="update({ tag: facet.name })">{{ facet.name }} {{ facet.count }}</button>
            </template>
          </div>
        </div>
        <div class="group">
          <label for="sort">Sort</label>
          <Select id="sort" :modelValue="current.sort" :options="sortOptions" optionLabel="label" optionValue="value" size="small" @update:modelValue="(value: string) => update({ sort: value, order: '' })" />
        </div>
        <Button v-if="hasFilters" label="Reset filters" severity="secondary" outlined size="small" @click="reset" />
      </aside>

      <div class="panel flush">
        <Message v-if="error" severity="error" style="margin: 20px">{{ error }}</Message>
        <template v-else-if="response">
          <div class="toolbar">
            <span class="summary">
              {{ response.total.toLocaleString() }} skills<span v-if="current.query"> for "{{ current.query }}"</span>
              <span v-if="response.total > current.size">, page {{ response.page }} of {{ Math.ceil(response.total / current.size) }}</span>
            </span>
            <div class="active-filters" v-if="current.path || current.tag || current.author">
              <template v-if="current.path">
                <span class="muted small">Path</span>
                <Chip :label="current.path" removable class="mono" @remove="update({ path: '' })" />
              </template>
              <template v-if="current.tag">
                <span class="muted small">Tag</span>
                <Chip :label="current.tag" removable @remove="update({ tag: '' })" />
              </template>
              <template v-if="current.author">
                <span class="muted small">Author</span>
                <Chip :label="current.author" removable @remove="update({ author: '' })" />
              </template>
            </div>
          </div>
          <div class="bulk-bar" v-if="selection.length > 0">
            <span class="small"><strong>{{ selection.length }}</strong> selected</span>
            <Button label="Install" icon="pi pi-download" size="small" @click="bulkOpen = true" />
            <Button label="Favorite" icon="pi pi-heart" size="small" severity="secondary" outlined :loading="bulkBusy" @click="favoriteSelected" />
            <Button label="Add to group" icon="pi pi-folder" size="small" severity="secondary" outlined @click="openGroupDialog" />
            <Button label="Clear" size="small" severity="secondary" text @click="selection = []" />
          </div>
          <DataTable
            v-if="response.total > 0"
            v-model:selection="selection"
            :value="response.results"
            size="small"
            rowHover
            lazy
            paginator
            :rows="current.size"
            :rowsPerPageOptions="PAGE_SIZES"
            :first="(response.page - 1) * current.size"
            :totalRecords="response.total"
            :loading="loading"
            dataKey="contentHash"
            :rowClass="() => 'clickable'"
            paginatorTemplate="PrevPageLink PageLinks NextPageLink RowsPerPageDropdown"
            :sortField="tableSortField"
            :sortOrder="tableSortOrder"
            @sort="onSort"
            @page="onPage"
            @row-click="onRowClick"
          >
            <Column selectionMode="multiple" style="width: 40px" />
            <Column header="Skill" field="name" sortable>
              <template #body="{ data }">
                <RouterLink class="skill-name" :to="skillRoute(data, current.query)">{{ data.name }}</RouterLink>
                <div class="skill-desc small">{{ data.description }}</div>
                <div class="muted small">
                  {{ data.source }} · {{ data.category }}<span v-if="data.copies > 1"> · {{ data.copies }} identical copies</span>
                </div>
              </template>
            </Column>
            <Column header="Risk" field="riskLevel" sortable style="width: 100px">
              <template #body="{ data }"><RiskTag :level="data.riskLevel" /></template>
            </Column>
            <Column header="Findings" style="width: 210px">
              <template #body="{ data }"><FlagTags :entry="data" /></template>
            </Column>
            <Column v-if="current.query" header="Score" style="width: 70px">
              <template #body="{ data }"><span class="mono">{{ data.score === null ? "-" : data.score.toFixed(2) }}</span></template>
            </Column>
            <Column v-else header="Updated" field="lastCommitDate" sortable style="width: 115px">
              <template #body="{ data }"><span class="mono">{{ formatDate(data.lastCommitDate) }}</span></template>
            </Column>
            <Column header="Installed" field="installed" sortable style="width: 110px">
              <template #body="{ data }">
                <i
                  :class="data.installed.length > 0 ? 'pi pi-check-circle installed-yes' : 'pi pi-minus installed-no'"
                  :title="installedTitle(data)"
                ></i>
              </template>
            </Column>
            <Column style="width: 56px">
              <template #body="{ data }"><LikeButton :skill="data" :liked="data.liked" @change="(value: boolean) => (data.liked = value)" /></template>
            </Column>
          </DataTable>
          <div class="empty" v-else>No skills match these filters.</div>
        </template>
      </div>
    </div>

    <BulkInstallDialog v-model:visible="bulkOpen" :skills="selectionRefs" @done="onBulkInstalled" />

    <Dialog v-model:visible="groupDialogOpen" modal header="Add to group" :style="{ width: '420px', maxWidth: '95vw' }">
      <p class="muted small" style="margin: 0 0 10px">Add the {{ selection.length }} selected skill{{ selection.length === 1 ? "" : "s" }} to an existing group.</p>
      <div v-if="groupOptions.length === 0" class="hint-box">No groups yet. Create one from the Groups page first.</div>
      <Select v-else v-model="selectedGroup" :options="groupOptions" optionLabel="label" optionValue="value" style="width: 100%" />
      <template #footer>
        <Button label="Cancel" severity="secondary" text @click="groupDialogOpen = false" />
        <Button label="Add" :loading="bulkBusy" :disabled="!selectedGroup" @click="addSelectionToGroup" />
      </template>
    </Dialog>
  </div>
</template>
