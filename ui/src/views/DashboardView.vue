<script setup lang="ts">
import Button from "primevue/button";
import Chart from "primevue/chart";
import Column from "primevue/column";
import DataTable from "primevue/datatable";
import InputText from "primevue/inputtext";
import Message from "primevue/message";
import ProgressSpinner from "primevue/progressspinner";
import { computed, onMounted, ref } from "vue";
import { RouterLink, useRouter } from "vue-router";
import { fetchStats, formatDate, type Stats } from "../api";
import PageHeader from "../components/PageHeader.vue";
import RiskTag from "../components/RiskTag.vue";
import { skillRoute } from "../router";
import { cssVar, useTheme } from "../theme";

const router = useRouter();
const { isDark } = useTheme();
const stats = ref<Stats | null>(null);
const error = ref<string | null>(null);
const query = ref("");

const palette = computed(() => {
  void isDark.value;
  return {
    high: cssVar("--p-red-500"),
    medium: cssVar("--p-amber-500"),
    low: cssVar("--p-green-500"),
    text: cssVar("--p-text-muted-color"),
    grid: isDark.value ? "rgba(255,255,255,0.06)" : "rgba(0,0,0,0.06)",
    bar: isDark.value ? cssVar("--p-zinc-300") : cssVar("--p-zinc-800"),
  };
});

const riskChart = computed(() => {
  if (!stats.value) return null;
  return {
    labels: ["High", "Medium", "Low"],
    datasets: [
      {
        data: [stats.value.byRisk.high, stats.value.byRisk.medium, stats.value.byRisk.low],
        backgroundColor: [palette.value.high, palette.value.medium, palette.value.low],
        borderWidth: 0,
        hoverOffset: 4,
      },
    ],
  };
});

const riskOptions = computed(() => ({
  cutout: "72%",
  plugins: { legend: { display: false } },
  responsive: true,
  maintainAspectRatio: false,
}));

const categoryChart = computed(() => {
  if (!stats.value) return null;
  const top = stats.value.byCategory.filter((facet) => facet.name !== "general").slice(0, 10);
  return {
    labels: top.map((facet) => facet.name),
    datasets: [{ data: top.map((facet) => facet.count), backgroundColor: palette.value.bar, borderRadius: 3, barThickness: 14 }],
  };
});

const categoryOptions = computed(() => ({
  indexAxis: "y",
  responsive: true,
  maintainAspectRatio: false,
  plugins: { legend: { display: false } },
  scales: {
    x: { grid: { color: palette.value.grid }, ticks: { color: palette.value.text, font: { size: 11 } }, border: { display: false } },
    y: { grid: { display: false }, ticks: { color: palette.value.text, font: { size: 12 } }, border: { display: false } },
  },
  onClick: (_event: unknown, elements: { index: number }[]) => {
    const target = elements[0];
    if (!target || !categoryChart.value) return;
    router.push({ name: "browse", query: { category: categoryChart.value.labels[target.index] } });
  },
}));

const flagRows = computed(() => {
  if (!stats.value) return [];
  const flags = stats.value.flags;
  return [
    { label: "Prompt injection suspected", count: flags.promptInjectionSuspected, flag: "promptInjection" },
    { label: "Secret references", count: flags.secretReferences, flag: "secrets" },
    { label: "Destructive operations", count: flags.destructiveOps, flag: "destructive" },
    { label: "Network calls", count: flags.networkCalls, flag: "network" },
    { label: "Ships scripts", count: flags.hasScripts, flag: "scripts" },
    { label: "Claude Code only", count: flags.claudeCodeOnly, flag: "claudeCodeOnly" },
  ];
});

function submit() {
  const trimmed = query.value.trim();
  router.push({ name: "browse", query: trimmed ? { q: trimmed } : {} });
}

function qualityClass(score: number): string {
  if (score >= 80) return "good";
  if (score >= 55) return "fair";
  return "poor";
}

onMounted(async () => {
  document.title = "Dashboard - ai-community-skills";
  try {
    stats.value = await fetchStats();
  } catch (cause) {
    error.value = cause instanceof Error ? cause.message : String(cause);
  }
});
</script>

<template>
  <div class="page">
    <PageHeader title="Dashboard" :sub="stats ? `${stats.total.toLocaleString()} skills from ${stats.sources.filter((source) => source.enabled).length} sources, synced ${formatDate(stats.lastSync)}` : ''">
      <template #actions>
        <form class="search-bar" style="width: 420px; max-width: 100%" @submit.prevent="submit">
          <InputText v-model="query" placeholder="Search skills" />
          <Button type="submit" label="Search" />
        </form>
      </template>
    </PageHeader>

    <Message v-if="error" severity="error">{{ error }}</Message>
    <div v-else-if="!stats" class="empty"><ProgressSpinner style="width: 32px; height: 32px" strokeWidth="6" /></div>

    <div v-else class="stack">
      <div class="grid-4">
        <RouterLink class="panel stat" :to="{ name: 'browse' }">
          <div class="label"><i class="pi pi-book"></i>Skills indexed</div>
          <div class="value">{{ stats.total.toLocaleString() }}</div>
          <div class="sub">{{ stats.byCategory.length }} categories from {{ stats.sources.filter((source) => source.enabled).length }} sources</div>
        </RouterLink>
        <RouterLink class="panel stat" :to="{ name: 'installed' }">
          <div class="label"><i class="pi pi-download"></i>Installed</div>
          <div class="value">{{ stats.installed }}</div>
          <div class="sub" :class="{ attention: stats.drifted > 0 }">{{ stats.drifted > 0 ? `${stats.drifted} update${stats.drifted === 1 ? "" : "s"} available` : "all up to date" }}</div>
        </RouterLink>
        <RouterLink class="panel stat" :to="{ name: 'favorites' }">
          <div class="label"><i class="pi pi-heart"></i>Library</div>
          <div class="value">{{ stats.likes + stats.groups }}</div>
          <div class="sub">{{ stats.likes }} favorites, {{ stats.groups }} groups</div>
        </RouterLink>
        <RouterLink class="panel stat" :to="{ name: 'settings' }">
          <div class="label"><i class="pi pi-clone"></i>Duplicates</div>
          <div class="value">{{ stats.duplicates.toLocaleString() }}</div>
          <div class="sub">{{ stats.duplicates > 0 ? "clean them up in Maintenance" : "index is clean" }}</div>
        </RouterLink>
      </div>

      <div class="panel" v-if="stats.drifted > 0">
        <div class="panel-head">
          <h2>Updates available</h2>
          <RouterLink :to="{ name: 'installed' }">Installed</RouterLink>
        </div>
        <p class="muted small" style="margin: 0 0 10px">These installed skills changed upstream since you installed them. Open one to review the changes and reinstall.</p>
        <ul class="facet-list">
          <li v-for="item in stats.driftedSkills" :key="item.installPath">
            <RouterLink :to="{ name: 'browse', query: { q: item.name, source: item.source } }">{{ item.name }}</RouterLink>
            <span class="count">{{ item.target }}</span>
          </li>
        </ul>
      </div>

      <div class="panel" v-if="stats.tags.length > 0">
        <div class="panel-head"><h2>Browse by tag</h2></div>
        <div class="chips">
          <RouterLink v-for="tag in stats.tags" :key="tag.name" class="chip" :to="{ name: 'browse', query: { tag: tag.name } }">{{ tag.name }} {{ tag.count }}</RouterLink>
        </div>
      </div>

      <div class="grid-3-2">
        <div class="panel">
          <div class="panel-head">
            <h2>Top categories</h2>
            <RouterLink :to="{ name: 'browse' }">All {{ stats.byCategory.length }}</RouterLink>
          </div>
          <div class="chart-box tall">
            <Chart v-if="categoryChart" type="bar" :data="categoryChart" :options="categoryOptions" style="height: 100%" />
          </div>
          <p class="muted small" style="margin: 10px 0 0">
            "general" ({{ (stats.byCategory.find((facet) => facet.name === 'general')?.count ?? 0).toLocaleString() }}) is left out: it groups skills whose repository declares no category.
          </p>
        </div>
        <div class="panel">
          <div class="panel-head">
            <h2>Risk distribution</h2>
          </div>
          <div class="chart-box">
            <Chart v-if="riskChart" type="doughnut" :data="riskChart" :options="riskOptions" style="height: 100%" />
          </div>
          <div class="legend">
            <RouterLink :to="{ name: 'browse', query: { risk: 'high' } }"><span class="dot dot-high"></span>high {{ stats.byRisk.high.toLocaleString() }}</RouterLink>
            <RouterLink :to="{ name: 'browse', query: { risk: 'medium' } }"><span class="dot dot-medium"></span>medium {{ stats.byRisk.medium.toLocaleString() }}</RouterLink>
            <RouterLink :to="{ name: 'browse', query: { risk: 'low' } }"><span class="dot dot-low"></span>low {{ stats.byRisk.low.toLocaleString() }}</RouterLink>
          </div>
          <p class="muted small" style="margin: 12px 0 0">
            Static analysis only. High means prompt injection, secret references, or destructive operations without a confirmation step.
          </p>
        </div>
      </div>

      <div class="grid-3-2">
        <div class="panel flush">
          <div class="panel-head">
            <h2>Top authors <span class="count">by declared author, ranked with a quality score</span></h2>
          </div>
          <DataTable :value="stats.authors" size="small" style="margin-top: 8px">
            <Column header="Author">
              <template #body="{ data }">
                <RouterLink class="skill-name" :to="{ name: 'browse', query: { author: data.name } }">{{ data.name }}</RouterLink>
              </template>
            </Column>
            <Column header="Skills" style="width: 90px">
              <template #body="{ data }"><span class="mono">{{ data.count.toLocaleString() }}</span></template>
            </Column>
            <Column header="Quality" style="width: 160px">
              <template #body="{ data }">
                <div class="quality-cell" v-if="data.avgQuality !== null">
                  <span class="quality-track"><span class="quality-fill" :class="qualityClass(data.avgQuality)" :style="{ width: `${data.avgQuality}%` }"></span></span>
                  <span class="mono small">{{ data.avgQuality }}</span>
                </div>
                <span v-else class="muted small">-</span>
              </template>
            </Column>
          </DataTable>
          <p class="muted small" style="margin: 8px 20px 14px">
            Quality is a static score per skill: 100 minus penalties for validation errors (missing description, broken referenced paths) and warnings. Authors come from the skill frontmatter or the source catalog.
          </p>
        </div>
        <div class="panel">
          <div class="panel-head">
            <h2>Findings</h2>
          </div>
          <ul class="facet-list">
            <li v-for="row in flagRows" :key="row.flag">
              <RouterLink :to="{ name: 'browse', query: { flags: row.flag } }">{{ row.label }}</RouterLink>
              <span class="count">{{ row.count.toLocaleString() }}</span>
            </li>
          </ul>
        </div>
      </div>

      <div class="panel flush">
        <div class="panel-head">
          <h2>Recently updated</h2>
          <RouterLink :to="{ name: 'browse', query: { sort: 'updated' } }">All by date</RouterLink>
        </div>
        <DataTable :value="stats.recent" size="small" style="margin-top: 8px">
          <Column header="Skill">
            <template #body="{ data }">
              <RouterLink class="skill-name" :to="skillRoute(data)">{{ data.name }}</RouterLink>
              <div class="skill-desc small">{{ data.description }}</div>
            </template>
          </Column>
          <Column field="source" header="Source" style="width: 220px" />
          <Column header="Risk" style="width: 90px">
            <template #body="{ data }"><RiskTag :level="data.riskLevel" /></template>
          </Column>
          <Column header="Updated" style="width: 110px">
            <template #body="{ data }"><span class="mono">{{ formatDate(data.lastCommitDate) }}</span></template>
          </Column>
        </DataTable>
      </div>
    </div>
  </div>
</template>
