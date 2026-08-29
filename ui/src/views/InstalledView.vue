<script setup lang="ts">
import Button from "primevue/button";
import Column from "primevue/column";
import DataTable from "primevue/datatable";
import Message from "primevue/message";
import ProgressSpinner from "primevue/progressspinner";
import Tag from "primevue/tag";
import { useConfirm } from "primevue/useconfirm";
import { useToast } from "primevue/usetoast";
import { computed, onMounted, ref } from "vue";
import { RouterLink } from "vue-router";
import { executeInstall, fetchInstalled, formatDate, uninstallSkill, type InstalledRecord } from "../api";
import PageHeader from "../components/PageHeader.vue";

const confirm = useConfirm();
const toast = useToast();
const records = ref<InstalledRecord[] | null>(null);
const error = ref<string | null>(null);
const selection = ref<InstalledRecord[]>([]);
const bulkBusy = ref(false);

async function load() {
  try {
    records.value = (await fetchInstalled()).installed;
    selection.value = [];
  } catch (cause) {
    error.value = cause instanceof Error ? cause.message : String(cause);
  }
}

function removeSelected() {
  const items = [...selection.value];
  confirm.require({
    header: `Uninstall ${items.length} skill${items.length === 1 ? "" : "s"}`,
    message: `This removes ${items.length} installed cop${items.length === 1 ? "y" : "ies"} from disk and forgets them. The skills stay in the index.`,
    icon: "pi pi-exclamation-triangle",
    rejectProps: { label: "Cancel", severity: "secondary", text: true },
    acceptProps: { label: "Uninstall all", severity: "danger" },
    accept: async () => {
      bulkBusy.value = true;
      let removed = 0;
      const failures: string[] = [];
      for (const record of items) {
        try {
          await uninstallSkill({ name: record.name, source: record.source, target: record.target, installPath: record.installPath });
          removed++;
        } catch (cause) {
          failures.push(`${record.name}: ${cause instanceof Error ? cause.message : String(cause)}`);
        }
      }
      bulkBusy.value = false;
      toast.add({
        severity: failures.length > 0 ? "warn" : "success",
        summary: `Uninstalled ${removed} of ${items.length}`,
        detail: failures.join("; ") || undefined,
        life: 5000,
      });
      await load();
    },
  });
}

function remove(record: InstalledRecord) {
  confirm.require({
    header: `Uninstall ${record.name}`,
    message: `This removes ${record.installPath}${record.link ? " (a symlink)" : " and everything inside it"} and forgets the installation.`,
    icon: "pi pi-exclamation-triangle",
    rejectProps: { label: "Cancel", severity: "secondary", text: true },
    acceptProps: { label: "Uninstall", severity: "danger" },
    accept: async () => {
      try {
        await uninstallSkill({ name: record.name, source: record.source, target: record.target, installPath: record.installPath });
        toast.add({ severity: "success", summary: "Uninstalled", detail: record.installPath, life: 3000 });
        await load();
      } catch (cause) {
        toast.add({ severity: "error", summary: "Uninstall failed", detail: cause instanceof Error ? cause.message : String(cause), life: 6000 });
      }
    },
  });
}

function skillLink(record: InstalledRecord) {
  return { name: "browse", query: { q: record.name, source: record.source } };
}

const updating = ref<string | null>(null);
const bulkUpdating = ref(false);

const selectedDrifted = computed(() => selection.value.filter((record) => record.indexed && record.drift));

function updateSelected() {
  const items = [...selectedDrifted.value];
  confirm.require({
    header: `Update ${items.length} skill${items.length === 1 ? "" : "s"}`,
    message: `This replaces ${items.length} installed cop${items.length === 1 ? "y" : "ies"} with the current upstream versions. Selected skills that are already up to date are left alone.`,
    icon: "pi pi-arrow-circle-up",
    rejectProps: { label: "Cancel", severity: "secondary", text: true },
    acceptProps: { label: "Update all", severity: "warn" },
    accept: async () => {
      bulkUpdating.value = true;
      let updated = 0;
      const failures: string[] = [];
      for (const record of items) {
        try {
          await executeInstall({ name: record.name, source: record.source, target: record.target, scope: record.scope ?? "personal", link: record.link, force: true });
          updated++;
        } catch (cause) {
          failures.push(`${record.name}: ${cause instanceof Error ? cause.message : String(cause)}`);
        }
      }
      bulkUpdating.value = false;
      toast.add({
        severity: failures.length > 0 ? "warn" : "success",
        summary: `Updated ${updated} of ${items.length}`,
        detail: failures.join("; ") || undefined,
        life: 5000,
      });
      await load();
    },
  });
}

function updateRecord(record: InstalledRecord) {
  confirm.require({
    header: `Update ${record.name}`,
    message: `This replaces the installed copy at ${record.installPath} with the current version from ${record.source}. Review the skill's findings first if the change is unexpected.`,
    icon: "pi pi-arrow-circle-up",
    rejectProps: { label: "Cancel", severity: "secondary", text: true },
    acceptProps: { label: "Update", severity: "warn" },
    accept: async () => {
      updating.value = record.installPath;
      try {
        await executeInstall({ name: record.name, source: record.source, target: record.target, scope: record.scope ?? "personal", link: record.link, force: true });
        toast.add({ severity: "success", summary: `Updated ${record.name}`, detail: record.installPath, life: 3000 });
        await load();
      } catch (cause) {
        toast.add({ severity: "error", summary: "Update failed", detail: cause instanceof Error ? cause.message : String(cause), life: 6000 });
      } finally {
        updating.value = null;
      }
    },
  });
}

const TARGET_LABELS: Record<string, string> = { "claude-code": "Claude Code", codex: "Codex", grok: "Grok", web: "web export" };

function targetLabel(record: InstalledRecord): string {
  return TARGET_LABELS[record.target] ?? record.target;
}

onMounted(() => {
  document.title = "Installed - ai-community-skills";
  load();
});
</script>

<template>
  <div class="page">
    <PageHeader title="Installed" sub="Skills installed through acs, where they live, and whether the upstream copy changed since." />

    <Message v-if="error" severity="error">{{ error }}</Message>
    <div v-else-if="!records" class="empty"><ProgressSpinner style="width: 32px; height: 32px" strokeWidth="6" /></div>
    <div v-else-if="records.length === 0" class="panel">
      <div class="hint-box">
        Nothing installed yet. Open a skill from <RouterLink :to="{ name: 'browse' }">Browse</RouterLink> and use Install, or run <code>acs install &lt;skill&gt;</code>.
      </div>
    </div>
    <div v-else class="panel flush">
      <div class="bulk-bar" v-if="selection.length > 0">
        <span class="small"><strong>{{ selection.length }}</strong> selected</span>
        <Button
          v-if="selectedDrifted.length > 0"
          :label="`Update ${selectedDrifted.length}`"
          icon="pi pi-arrow-circle-up"
          size="small"
          severity="warn"
          outlined
          :loading="bulkUpdating"
          @click="updateSelected"
        />
        <Button label="Uninstall" icon="pi pi-trash" size="small" severity="danger" outlined :loading="bulkBusy" @click="removeSelected" />
        <Button label="Clear" size="small" severity="secondary" text @click="selection = []" />
      </div>
      <DataTable v-model:selection="selection" :value="records" size="small" sortField="installedAt" :sortOrder="-1" dataKey="installPath">
        <Column selectionMode="multiple" style="width: 40px" />
        <Column field="name" header="Skill" sortable>
          <template #body="{ data }">
            <RouterLink class="skill-name" :to="skillLink(data)">{{ data.name }}</RouterLink>
            <div class="muted small">{{ data.source }}</div>
          </template>
        </Column>
        <Column field="target" header="Target" sortable style="width: 140px">
          <template #body="{ data }">
            {{ targetLabel(data) }}
            <div class="muted small">{{ data.scope ?? "archive" }}{{ data.link ? ", symlink" : "" }}</div>
          </template>
        </Column>
        <Column header="Path">
          <template #body="{ data }"><span class="mono muted small" style="overflow-wrap: anywhere">{{ data.installPath }}</span></template>
        </Column>
        <Column field="installedAt" header="Installed" sortable style="width: 110px">
          <template #body="{ data }"><span class="mono">{{ formatDate(data.installedAt) }}</span></template>
        </Column>
        <Column header="State" style="width: 150px">
          <template #body="{ data }">
            <Tag v-if="!data.indexed" value="not in index" severity="secondary" />
            <Button
              v-else-if="data.drift"
              label="Update"
              icon="pi pi-arrow-circle-up"
              size="small"
              severity="warn"
              outlined
              :loading="updating === data.installPath"
              title="Upstream changed, click to reinstall the current version"
              @click="updateRecord(data)"
            />
            <Tag v-else value="up to date" severity="success" />
          </template>
        </Column>
        <Column style="width: 60px">
          <template #body="{ data }">
            <Button icon="pi pi-trash" severity="danger" text rounded aria-label="Uninstall" title="Uninstall" @click="remove(data)" />
          </template>
        </Column>
      </DataTable>
    </div>
  </div>
</template>
