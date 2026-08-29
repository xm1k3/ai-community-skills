<script setup lang="ts">
import Button from "primevue/button";
import Checkbox from "primevue/checkbox";
import Dialog from "primevue/dialog";
import Message from "primevue/message";
import Select from "primevue/select";
import SelectButton from "primevue/selectbutton";
import { useToast } from "primevue/usetoast";
import { computed, ref, watch } from "vue";
import { executeInstall, planInstall, type Entry, type InstallPlan, type InstallRequest } from "../api";

const props = defineProps<{ entry: Entry; visible: boolean }>();
const emit = defineEmits<{ "update:visible": [value: boolean]; installed: [] }>();
const toast = useToast();

const targets = [
  { label: "Claude Code", value: "claude-code" },
  { label: "Codex", value: "codex" },
  { label: "Grok", value: "grok" },
  { label: "Web (zip archive)", value: "web" },
];
const scopes = [
  { label: "Personal", value: "personal" },
  { label: "Project", value: "project" },
];

const target = ref("claude-code");
const scope = ref("personal");
const link = ref(false);
const force = ref(false);
const plan = ref<InstallPlan | null>(null);
const busy = ref(false);
const error = ref<string | null>(null);
const done = ref<string | null>(null);

const isWeb = computed(() => target.value === "web");
const highRisk = computed(() => props.entry.riskLevel === "high");

function request(): InstallRequest {
  return {
    name: props.entry.name,
    source: props.entry.source,
    path: props.entry.path,
    target: target.value,
    scope: scope.value,
    link: !isWeb.value && link.value,
    force: force.value,
  };
}

function reset() {
  plan.value = null;
  done.value = null;
  error.value = null;
}

watch([target, scope, link, force], reset);
watch(
  () => props.visible,
  (visible) => {
    if (visible) reset();
  },
);

async function preview() {
  busy.value = true;
  error.value = null;
  try {
    plan.value = await planInstall(request());
  } catch (cause) {
    error.value = cause instanceof Error ? cause.message : String(cause);
  } finally {
    busy.value = false;
  }
}

async function confirm() {
  busy.value = true;
  error.value = null;
  try {
    const result = await executeInstall(request());
    done.value = result.installed.installPath;
    toast.add({ severity: "success", summary: "Installed", detail: result.installed.installPath, life: 4000 });
    emit("installed");
  } catch (cause) {
    error.value = cause instanceof Error ? cause.message : String(cause);
  } finally {
    busy.value = false;
  }
}

function close() {
  emit("update:visible", false);
}
</script>

<template>
  <Dialog :visible="visible" modal :header="`Install ${entry.name}`" :style="{ width: '560px', maxWidth: '95vw' }" @update:visible="close">
    <div class="form-row">
      <label for="target">Target</label>
      <Select id="target" v-model="target" :options="targets" optionLabel="label" optionValue="value" />
    </div>
    <div class="form-row" v-if="!isWeb">
      <label>Scope</label>
      <SelectButton v-model="scope" :options="scopes" optionLabel="label" optionValue="value" :allowEmpty="false" />
    </div>
    <div class="form-inline" style="margin-bottom: 16px">
      <label v-if="!isWeb"><Checkbox v-model="link" binary inputId="link" /> Symlink instead of copy</label>
      <label><Checkbox v-model="force" binary inputId="force" /> Overwrite if present</label>
    </div>

    <Message v-if="highRisk && !done" severity="warn">This skill is rated high risk. Review the findings on the skill page before installing.</Message>

    <div v-if="plan" class="stack" style="margin-top: 12px">
      <pre class="plan-lines">{{ plan.plan.join("\n") }}</pre>
      <pre class="plan-lines">{{ plan.riskSummary.join("\n") }}</pre>
      <Message v-for="warning in plan.warnings" :key="warning" severity="warn">{{ warning }}</Message>
      <Message v-for="blocker in plan.blockers" :key="blocker" severity="error">{{ blocker }}</Message>
    </div>

    <Message v-if="error" severity="error" style="margin-top: 12px">{{ error }}</Message>
    <Message v-if="done" severity="success" style="margin-top: 12px">Installed to {{ done }}</Message>

    <template #footer>
      <Button label="Close" severity="secondary" text @click="close" />
      <Button v-if="!plan && !done" label="Preview" :loading="busy" @click="preview" />
      <Button v-else-if="plan && !done" label="Confirm install" :disabled="!plan.canInstall" :loading="busy" @click="confirm" />
    </template>
  </Dialog>
</template>
