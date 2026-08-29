<script setup lang="ts">
import Button from "primevue/button";
import Checkbox from "primevue/checkbox";
import Column from "primevue/column";
import DataTable from "primevue/datatable";
import Dialog from "primevue/dialog";
import Message from "primevue/message";
import Select from "primevue/select";
import Tag from "primevue/tag";
import { computed, ref, watch } from "vue";
import { bulkInstall, planBulkInstall, type CollectionInstallItem, type CollectionInstallResult, type SkillRef } from "../api";
import RiskTag from "./RiskTag.vue";

const props = defineProps<{ skills: SkillRef[] }>();
const visible = defineModel<boolean>("visible", { required: true });
const emit = defineEmits<{ done: [] }>();

const targetOptions = [
  { label: "Claude Code", value: "claude-code" },
  { label: "Codex", value: "codex" },
  { label: "Grok", value: "grok" },
  { label: "Web (zip export)", value: "web" },
];
const target = ref("claude-code");
const scope = ref("personal");
const force = ref(false);
const step = ref<"configure" | "preview" | "results">("configure");
const items = ref<CollectionInstallItem[]>([]);
const results = ref<CollectionInstallResult[]>([]);
const busy = ref(false);
const error = ref<string | null>(null);

const blocked = computed(() => items.value.filter((item) => item.blockers.length > 0));
const installable = computed(() => items.value.length - blocked.value.length);

watch(visible, (open) => {
  if (open) {
    step.value = "configure";
    items.value = [];
    results.value = [];
    error.value = null;
  }
});

async function preview() {
  busy.value = true;
  error.value = null;
  try {
    const response = await planBulkInstall({ skills: props.skills, target: target.value, scope: scope.value, link: false, force: force.value });
    items.value = response.items;
    step.value = "preview";
  } catch (cause) {
    error.value = cause instanceof Error ? cause.message : String(cause);
  } finally {
    busy.value = false;
  }
}

async function run() {
  busy.value = true;
  error.value = null;
  try {
    const skip = blocked.value.map((item) => item.skill);
    const response = await bulkInstall({ skills: props.skills, target: target.value, scope: scope.value, link: false, force: force.value, skip });
    results.value = response.results;
    step.value = "results";
    emit("done");
  } catch (cause) {
    error.value = cause instanceof Error ? cause.message : String(cause);
  } finally {
    busy.value = false;
  }
}

function resultSeverity(status: CollectionInstallResult["status"]): "success" | "danger" | "secondary" {
  if (status === "installed") return "success";
  if (status === "failed") return "danger";
  return "secondary";
}
</script>

<template>
  <Dialog v-model:visible="visible" modal :header="`Install ${skills.length} skill${skills.length === 1 ? '' : 's'}`" :style="{ width: '760px', maxWidth: '95vw' }">
    <template v-if="step === 'configure'">
      <div class="form-row">
        <label for="bulk-target">Target</label>
        <Select id="bulk-target" v-model="target" :options="targetOptions" optionLabel="label" optionValue="value" />
      </div>
      <div class="form-row" v-if="target !== 'web'">
        <label>Scope</label>
        <div class="seg">
          <button type="button" :class="{ active: scope === 'personal' }" @click="scope = 'personal'">Personal</button>
          <button type="button" :class="{ active: scope === 'project' }" @click="scope = 'project'">Project</button>
        </div>
      </div>
      <div class="form-inline" style="margin-bottom: 8px">
        <label><Checkbox v-model="force" binary inputId="bulk-force" /> Overwrite if present</label>
      </div>
    </template>

    <template v-else-if="step === 'preview'">
      <p class="muted small" style="margin: 0 0 10px">
        {{ installable }} of {{ items.length }} will be installed.
        <span v-if="blocked.length > 0">{{ blocked.length }} blocked (already present or missing files) will be skipped automatically.</span>
      </p>
      <DataTable :value="items" size="small" scrollable scrollHeight="420px">
        <Column header="Skill">
          <template #body="{ data }">
            <span class="skill-name">{{ data.skill.name }}</span>
            <div class="muted small">{{ data.skill.source }}</div>
          </template>
        </Column>
        <Column header="Risk" style="width: 90px">
          <template #body="{ data }"><RiskTag v-if="data.riskLevel" :level="data.riskLevel" /></template>
        </Column>
        <Column header="Status">
          <template #body="{ data }">
            <div v-if="data.blockers.length > 0" class="small" style="color: var(--p-red-500)">{{ data.blockers.join("; ") }}</div>
            <template v-else>
              <div class="mono muted small">{{ data.destination }}</div>
              <div v-for="warning in data.warnings" :key="warning" class="small" style="color: var(--p-amber-600)">{{ warning }}</div>
            </template>
          </template>
        </Column>
      </DataTable>
    </template>

    <template v-else>
      <DataTable :value="results" size="small" scrollable scrollHeight="420px">
        <Column header="Skill">
          <template #body="{ data }"><span class="skill-name">{{ data.skill.name }}</span></template>
        </Column>
        <Column header="Result" style="width: 110px">
          <template #body="{ data }"><Tag :value="data.status" :severity="resultSeverity(data.status)" /></template>
        </Column>
        <Column header="Detail">
          <template #body="{ data }"><span class="small mono">{{ data.detail }}</span></template>
        </Column>
      </DataTable>
    </template>

    <Message v-if="error" severity="error" style="margin-top: 10px">{{ error }}</Message>

    <template #footer>
      <Button :label="step === 'results' ? 'Close' : 'Cancel'" severity="secondary" text @click="visible = false" />
      <Button v-if="step === 'configure'" label="Preview" :loading="busy" @click="preview" />
      <Button v-else-if="step === 'preview'" :label="`Install ${installable}`" :loading="busy" :disabled="installable === 0" @click="run" />
    </template>
  </Dialog>
</template>
