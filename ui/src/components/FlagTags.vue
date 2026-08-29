<script setup lang="ts">
import Tag from "primevue/tag";
import { computed } from "vue";
import type { Entry } from "../api";

type Severity = "secondary" | "danger" | "warn" | "info";

const props = defineProps<{ entry: Entry }>();

const flags = computed(() => {
  const list: { label: string; severity: Severity }[] = [];
  const entry = props.entry;
  if (entry.promptInjectionSuspected) list.push({ label: "prompt injection", severity: "danger" });
  if (entry.secretReferences) list.push({ label: "secrets", severity: "danger" });
  if (entry.destructiveOps) {
    list.push({
      label: entry.confirmsBeforeDestructive ? "destructive, confirmed" : "destructive",
      severity: entry.confirmsBeforeDestructive ? "warn" : "danger",
    });
  }
  if (entry.networkCalls) list.push({ label: "network", severity: "warn" });
  if (entry.hasScripts) list.push({ label: "scripts", severity: "secondary" });
  if (entry.claudeCodeOnly) list.push({ label: "claude code only", severity: "info" });
  return list;
});
</script>

<template>
  <div class="tags">
    <Tag v-for="flag in flags" :key="flag.label" :value="flag.label" :severity="flag.severity" />
    <span v-if="flags.length === 0" class="muted small">none</span>
  </div>
</template>
