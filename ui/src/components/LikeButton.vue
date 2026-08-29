<script setup lang="ts">
import Button from "primevue/button";
import { useToast } from "primevue/usetoast";
import { ref, watch } from "vue";
import { toggleLike, type SkillRef } from "../api";

const props = defineProps<{ skill: SkillRef; liked: boolean; label?: boolean }>();
const emit = defineEmits<{ change: [liked: boolean] }>();
const toast = useToast();
const state = ref(props.liked);
const busy = ref(false);

watch(
  () => props.liked,
  (value) => {
    state.value = value;
  },
);

async function toggle(event: Event) {
  event.stopPropagation();
  busy.value = true;
  try {
    const result = await toggleLike({ name: props.skill.name, source: props.skill.source, path: props.skill.path });
    state.value = result.liked;
    emit("change", result.liked);
  } catch (cause) {
    toast.add({ severity: "error", summary: "Could not update favorites", detail: cause instanceof Error ? cause.message : String(cause), life: 4000 });
  } finally {
    busy.value = false;
  }
}
</script>

<template>
  <Button
    :icon="state ? 'pi pi-heart-fill' : 'pi pi-heart'"
    :label="label ? (state ? 'Favorite' : 'Add to favorites') : undefined"
    :severity="state ? 'danger' : 'secondary'"
    :text="!label"
    :outlined="label"
    :rounded="!label"
    :loading="busy"
    :aria-label="state ? 'Remove from favorites' : 'Add to favorites'"
    :title="state ? 'Remove from favorites' : 'Add to favorites'"
    @click="toggle"
  />
</template>
