<script setup lang="ts">
import Button from "primevue/button";
import Dialog from "primevue/dialog";
import InputText from "primevue/inputtext";
import Menu from "primevue/menu";
import Textarea from "primevue/textarea";
import { useToast } from "primevue/usetoast";
import { computed, ref } from "vue";
import { addToCollection, createCollection, removeFromCollection, type SkillRef } from "../api";

const props = defineProps<{ skill: SkillRef; groups: string[]; collections: { id: string; name: string }[] }>();
const emit = defineEmits<{ changed: [] }>();
const toast = useToast();

const menu = ref<InstanceType<typeof Menu> | null>(null);
const dialog = ref(false);
const name = ref("");
const description = ref("");
const busy = ref(false);

const items = computed(() => [
  ...props.collections.map((collection) => ({
    label: collection.name,
    icon: props.groups.includes(collection.id) ? "pi pi-check-square" : "pi pi-stop",
    command: () => toggle(collection.id),
  })),
  ...(props.collections.length > 0 ? [{ separator: true }] : []),
  {
    label: "New group",
    icon: "pi pi-plus",
    command: () => {
      name.value = "";
      description.value = "";
      dialog.value = true;
    },
  },
]);

async function toggle(id: string) {
  try {
    if (props.groups.includes(id)) await removeFromCollection(id, props.skill);
    else await addToCollection(id, props.skill);
    emit("changed");
  } catch (cause) {
    toast.add({ severity: "error", summary: "Could not update group", detail: cause instanceof Error ? cause.message : String(cause), life: 4000 });
  }
}

async function create() {
  busy.value = true;
  try {
    const result = await createCollection({ name: name.value, description: description.value, skills: [props.skill] });
    toast.add({ severity: "success", summary: `Group "${result.collection.name}" created`, life: 2500 });
    dialog.value = false;
    emit("changed");
  } catch (cause) {
    toast.add({ severity: "error", summary: "Could not create group", detail: cause instanceof Error ? cause.message : String(cause), life: 4000 });
  } finally {
    busy.value = false;
  }
}

function open(event: Event) {
  menu.value?.toggle(event);
}
</script>

<template>
  <Button :label="groups.length > 0 ? `In ${groups.length} group${groups.length > 1 ? 's' : ''}` : 'Add to group'" icon="pi pi-folder-plus" severity="secondary" outlined @click="open" />
  <Menu ref="menu" :model="items" popup />
  <Dialog v-model:visible="dialog" modal header="New group" :style="{ width: '440px', maxWidth: '95vw' }">
    <div class="form-row">
      <label for="group-name">Name</label>
      <InputText id="group-name" v-model="name" autofocus @keyup.enter="create" />
    </div>
    <div class="form-row">
      <label for="group-desc">Description</label>
      <Textarea id="group-desc" v-model="description" rows="3" autoResize />
    </div>
    <template #footer>
      <Button label="Cancel" severity="secondary" text @click="dialog = false" />
      <Button label="Create and add" :loading="busy" :disabled="name.trim() === ''" @click="create" />
    </template>
  </Dialog>
</template>
