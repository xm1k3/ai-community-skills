<script setup lang="ts">
import Tag from "primevue/tag";
import { computed } from "vue";
import type { RiskLevel } from "../api";

const props = defineProps<{ level: RiskLevel }>();
const severity = computed(() => (props.level === "high" ? "danger" : props.level === "medium" ? "warn" : "success"));
</script>

<template>
  <Tag :value="level" :severity="severity" />
</template>
