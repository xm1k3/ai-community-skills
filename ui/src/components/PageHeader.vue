<script setup lang="ts">
defineProps<{ title: string; sub?: string }>();
</script>

<template>
  <div class="page-head">
    <div>
      <slot name="crumbs"></slot>
      <h1>{{ title }}</h1>
      <p class="sub" v-if="sub">{{ sub }}</p>
      <slot name="below"></slot>
    </div>
    <div class="actions"><slot name="actions"></slot></div>
  </div>
</template>
