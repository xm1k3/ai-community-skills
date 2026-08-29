<script setup lang="ts">
import Button from "primevue/button";
import Checkbox from "primevue/checkbox";
import Message from "primevue/message";
import Tag from "primevue/tag";
import { computed, nextTick, onBeforeUnmount, onMounted, ref } from "vue";
import { cancelSync, fetchSyncStatus, formatDate, notifyDataChanged, startSync, type SyncJob } from "../api";

const props = defineProps<{ sources?: string[]; compact?: boolean }>();
const emit = defineEmits<{ finished: [job: SyncJob] }>();

const job = ref<SyncJob | null>(null);
const error = ref<string | null>(null);
const dedupe = ref(false);
const logBox = ref<HTMLElement | null>(null);
let timer: number | null = null;
let lastStatus: string | null = null;

const running = computed(() => job.value?.status === "running");

async function poll() {
  try {
    const { job: current } = await fetchSyncStatus();
    job.value = current;
    if (current && current.status !== "running" && lastStatus === "running") {
      emit("finished", current);
      notifyDataChanged();
    }
    lastStatus = current?.status ?? null;
    if (current?.status === "running") {
      await nextTick();
      if (logBox.value) logBox.value.scrollTop = logBox.value.scrollHeight;
      schedule();
    }
  } catch (cause) {
    error.value = cause instanceof Error ? cause.message : String(cause);
  }
}

function schedule() {
  if (timer !== null) window.clearTimeout(timer);
  timer = window.setTimeout(poll, 1000);
}

async function start(sources?: string[]) {
  error.value = null;
  try {
    const result = await startSync({ sources: sources && sources.length > 0 ? sources : undefined, dedupe: dedupe.value });
    job.value = result.job;
    lastStatus = "running";
    schedule();
  } catch (cause) {
    error.value = cause instanceof Error ? cause.message : String(cause);
  }
}

async function cancel() {
  try {
    await cancelSync();
  } catch (cause) {
    error.value = cause instanceof Error ? cause.message : String(cause);
  }
}

defineExpose({ start });

onMounted(poll);
onBeforeUnmount(() => {
  if (timer !== null) window.clearTimeout(timer);
});
</script>

<template>
  <div class="sync-panel">
    <div class="sync-toolbar">
      <Button :label="props.sources && props.sources.length > 0 ? `Sync ${props.sources.join(', ')}` : 'Sync all sources'" icon="pi pi-refresh" :disabled="running" @click="start(props.sources)" />
      <Button v-if="running" label="Cancel" severity="secondary" outlined @click="cancel" />
      <label class="check-row" v-if="!running"><Checkbox v-model="dedupe" binary inputId="dedupe-now" /> Remove duplicates after this sync</label>
      <span class="spacer"></span>
      <template v-if="job">
        <Tag :value="job.status" :severity="job.status === 'running' ? 'info' : job.status === 'done' ? 'success' : 'danger'" />
        <span class="muted small">started {{ formatDate(job.startedAt) }} {{ job.startedAt.slice(11, 19) }}<span v-if="job.finishedAt">, finished {{ job.finishedAt.slice(11, 19) }}</span></span>
      </template>
    </div>
    <Message v-if="error" severity="error" style="margin-top: 12px">{{ error }}</Message>
    <pre v-if="job && (job.lines.length > 0 || job.partial)" ref="logBox" class="log" :class="{ compact: props.compact }">{{ job.lines.join("\n") }}{{ job.lines.length > 0 && job.partial ? "\n" : "" }}{{ job.partial }}</pre>
    <p v-else-if="!job" class="muted small" style="margin: 12px 0 0">No sync has run since the server started. Clone or update the enabled sources and rebuild the index here, the log streams below.</p>
  </div>
</template>
