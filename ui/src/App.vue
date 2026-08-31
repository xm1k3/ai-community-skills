<script setup lang="ts">
import Button from "primevue/button";
import ConfirmDialog from "primevue/confirmdialog";
import Dialog from "primevue/dialog";
import { useToast } from "primevue/usetoast";
import Toast from "primevue/toast";
import { onBeforeUnmount, onMounted, ref } from "vue";
import { RouterLink, RouterView, useRoute } from "vue-router";
import { fetchStatus, formatDate, type Status } from "./api";
import { useTheme } from "./theme";

const { icon, label, cycle } = useTheme();
const status = ref<Status | null>(null);
const route = useRoute();
const toast = useToast();
const upgradeOpen = ref(false);
let timer: number | null = null;

async function refresh() {
  try {
    status.value = await fetchStatus();
  } catch {
    status.value = null;
  }
}

let refreshQueued = false;

function queueRefresh() {
  if (refreshQueued) return;
  refreshQueued = true;
  window.setTimeout(() => {
    refreshQueued = false;
    refresh();
  }, 400);
}

async function copyUpgradeCommand() {
  if (!status.value) return;
  try {
    await navigator.clipboard.writeText(status.value.update.upgradeCommand);
    toast.add({ severity: "success", summary: "Copied", detail: "Upgrade command copied to the clipboard", life: 2500 });
  } catch {
    toast.add({ severity: "warn", summary: "Copy failed", detail: "Select the command and copy it manually", life: 3500 });
  }
}

onMounted(() => {
  refresh();
  timer = window.setInterval(refresh, 15000);
  window.addEventListener("acs-refresh", queueRefresh);
});

onBeforeUnmount(() => {
  if (timer !== null) window.clearInterval(timer);
  window.removeEventListener("acs-refresh", queueRefresh);
});
</script>

<template>
  <Toast position="bottom-right" />
  <ConfirmDialog :style="{ width: '460px', maxWidth: '95vw' }" />
  <div class="shell">
    <aside class="sidebar">
      <RouterLink :to="{ name: 'dashboard' }" class="brand">
        <span class="mark">acs</span>
        <span class="name">Community Skills<span class="tag">local skill registry</span></span>
      </RouterLink>
      <nav class="nav">
        <RouterLink :to="{ name: 'dashboard' }" class="nav-link" :class="{ 'router-link-active': route.name === 'dashboard' }" active-class=""><i class="pi pi-th-large"></i>Dashboard</RouterLink>
        <RouterLink :to="{ name: 'browse' }" class="nav-link" :class="{ 'router-link-active': route.name === 'browse' || route.name === 'skill' }" active-class=""><i class="pi pi-search"></i>Browse<span class="badge" v-if="status">{{ status.skills.toLocaleString() }}</span></RouterLink>
        <RouterLink :to="{ name: 'favorites' }" class="nav-link"><i class="pi pi-heart"></i>Favorites<span class="badge" v-if="status">{{ status.likes }}</span></RouterLink>
        <RouterLink :to="{ name: 'groups' }" class="nav-link" :class="{ 'router-link-active': route.name === 'groups' || route.name === 'group' }" active-class=""><i class="pi pi-folder"></i>Groups<span class="badge" v-if="status">{{ status.groups }}</span></RouterLink>
        <RouterLink :to="{ name: 'installed' }" class="nav-link"><i class="pi pi-download"></i>Installed<span class="badge" v-if="status">{{ status.installed }}</span></RouterLink>
        <div class="nav-section">Manage</div>
        <RouterLink :to="{ name: 'sources' }" class="nav-link"><i class="pi pi-database"></i>Sources<span class="badge" v-if="status">{{ status.sources.length }}</span></RouterLink>
      </nav>
      <div class="sidebar-foot">
        <RouterLink :to="{ name: 'settings' }" class="nav-link"><i class="pi pi-cog"></i>Settings<span class="badge" v-if="status && status.syncRunning"><i class="pi pi-spin pi-spinner"></i></span></RouterLink>
        <div class="row sync" v-if="status">
          <span>Synced</span>
          <span>{{ formatDate(status.lastSync) }}</span>
        </div>
        <div class="row">
          <span>Theme</span>
          <Button :icon="icon" :label="label" text size="small" severity="secondary" @click="cycle" />
        </div>
        <div class="row version" v-if="status">
          <span>Version</span>
          <Button
            v-if="status.update.updateAvailable"
            icon="pi pi-arrow-circle-up"
            :label="`Upgrade to v${status.update.latest}`"
            text
            size="small"
            severity="info"
            @click="upgradeOpen = true"
          />
          <span v-else>v{{ status.update.current }}</span>
        </div>
        <a class="credit" href="https://github.com/xm1k3" target="_blank" rel="noopener">
          <i class="pi pi-github"></i>
          <span>Made with <i class="pi pi-heart-fill heart"></i> by xm1k3</span>
        </a>
      </div>
    </aside>
    <div class="main">
      <RouterView />
    </div>
  </div>
  <Dialog v-model:visible="upgradeOpen" modal header="Update available" :style="{ width: '480px', maxWidth: '95vw' }">
    <template v-if="status">
      <p class="upgrade-text">
        You are running <strong>v{{ status.update.current }}</strong>, the latest release is <strong>v{{ status.update.latest }}</strong>.
        Run this command in a terminal, then restart <code>acs ui</code>.
      </p>
      <div class="upgrade-command">
        <code>{{ status.update.upgradeCommand }}</code>
        <Button icon="pi pi-copy" text size="small" severity="secondary" aria-label="Copy command" @click="copyUpgradeCommand" />
      </div>
      <a class="upgrade-link" :href="status.update.releasesUrl" target="_blank" rel="noopener">
        <i class="pi pi-external-link"></i>
        <span>Release notes</span>
      </a>
    </template>
  </Dialog>
</template>
