<script lang="ts">
export interface TreeNode {
  name: string;
  path: string;
  children: TreeNode[];
  isFile: boolean;
  lines: number;
}
</script>

<script setup lang="ts">
import { computed } from "vue";

const props = defineProps<{ node: TreeNode; selected: string; collapsed: Set<string>; depth: number }>();
const emit = defineEmits<{ toggle: [path: string]; select: [path: string] }>();

const isCollapsed = computed(() => props.collapsed.has(props.node.path));

const icon = computed(() => {
  const name = props.node.name;
  if (!props.node.isFile) return isCollapsed.value ? "pi pi-folder" : "pi pi-folder-open";
  if (/\.md$/i.test(name)) return "pi pi-file-edit";
  if (/\.(py|sh|bash|zsh|js|mjs|cjs|ts|rb|go|rs|java|kt|swift|c|h|cpp|cs|php|pl|lua)$/i.test(name)) return "pi pi-code";
  if (/\.(json|ya?ml|toml|ini|cfg|env|xml)$/i.test(name)) return "pi pi-cog";
  return "pi pi-file";
});
</script>

<template>
  <button v-if="!node.isFile" type="button" class="tree-row dir" :style="{ paddingLeft: `${8 + depth * 14}px` }" @click="emit('toggle', node.path)">
    <i class="pi caret" :class="isCollapsed ? 'pi-angle-right' : 'pi-angle-down'"></i>
    <i :class="icon"></i>
    <span class="label">{{ node.name }}</span>
  </button>
  <button v-else type="button" class="tree-row file" :class="{ active: node.path === selected }" :style="{ paddingLeft: `${8 + depth * 14}px` }" @click="emit('select', node.path)">
    <i class="pi caret" style="visibility: hidden"></i>
    <i :class="icon"></i>
    <span class="label">{{ node.name }}</span>
    <span class="lines">{{ node.lines }}</span>
  </button>
  <ul v-if="!node.isFile && !isCollapsed" class="tree">
    <li v-for="child in node.children" :key="child.path">
      <TreeBranch :node="child" :selected="selected" :collapsed="collapsed" :depth="depth + 1" @toggle="(path) => emit('toggle', path)" @select="(path) => emit('select', path)" />
    </li>
  </ul>
</template>
