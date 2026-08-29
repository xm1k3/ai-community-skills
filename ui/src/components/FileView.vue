<script setup lang="ts">
import { computed } from "vue";

const props = defineProps<{ content: string; anchor: string; highlight: number | null }>();
const lines = computed(() => props.content.replace(/\r\n/g, "\n").split("\n"));
</script>

<template>
  <div class="code">
    <div v-for="(text, index) in lines" :key="index" :id="`${anchor}-${index + 1}`" class="ln" :class="{ hit: highlight === index + 1 }">
      <span class="n">{{ index + 1 }}</span>
      <span class="t">{{ text }}</span>
    </div>
  </div>
</template>
