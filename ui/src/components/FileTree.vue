<script setup lang="ts">
import { computed, ref, watch } from "vue";
import type { SkillFile } from "../api";
import TreeBranch, { type TreeNode } from "./TreeBranch.vue";

const props = defineProps<{ files: SkillFile[]; selected: string }>();
const emit = defineEmits<{ select: [path: string] }>();

const collapsed = ref(new Set<string>());

function buildTree(files: SkillFile[]): TreeNode[] {
  const root: TreeNode = { name: "", path: "", children: [], isFile: false, lines: 0 };
  for (const file of files) {
    const parts = file.path.split("/");
    let node = root;
    parts.forEach((part, index) => {
      const path = parts.slice(0, index + 1).join("/");
      let child = node.children.find((item) => item.name === part);
      if (!child) {
        const isFile = index === parts.length - 1;
        child = { name: part, path, children: [], isFile, lines: isFile ? file.lines : 0 };
        node.children.push(child);
      }
      node = child;
    });
  }
  const sort = (nodes: TreeNode[]) => {
    nodes.sort((a, b) => Number(a.isFile) - Number(b.isFile) || a.name.localeCompare(b.name));
    for (const node of nodes) sort(node.children);
  };
  sort(root.children);
  return root.children;
}

const tree = computed(() => buildTree(props.files));

function toggle(path: string) {
  const next = new Set(collapsed.value);
  if (next.has(path)) next.delete(path);
  else next.add(path);
  collapsed.value = next;
}

watch(
  () => props.selected,
  (selected) => {
    const parts = selected.split("/");
    if (parts.length < 2) return;
    const next = new Set(collapsed.value);
    for (let index = 1; index < parts.length; index++) next.delete(parts.slice(0, index).join("/"));
    collapsed.value = next;
  },
  { immediate: true },
);
</script>

<template>
  <ul class="tree">
    <li v-for="node in tree" :key="node.path">
      <TreeBranch :node="node" :selected="selected" :collapsed="collapsed" :depth="0" @toggle="toggle" @select="(path) => emit('select', path)" />
    </li>
  </ul>
</template>
