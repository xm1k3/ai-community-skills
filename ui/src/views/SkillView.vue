<script setup lang="ts">
import Button from "primevue/button";
import Column from "primevue/column";
import DataTable from "primevue/datatable";
import Menu from "primevue/menu";
import type { MenuItem } from "primevue/menuitem";
import Message from "primevue/message";
import ProgressSpinner from "primevue/progressspinner";
import Tab from "primevue/tab";
import TabList from "primevue/tablist";
import TabPanel from "primevue/tabpanel";
import TabPanels from "primevue/tabpanels";
import Tabs from "primevue/tabs";
import Tag from "primevue/tag";
import { useConfirm } from "primevue/useconfirm";
import { useToast } from "primevue/usetoast";
import { computed, nextTick, onBeforeUnmount, ref, watch } from "vue";
import { RouterLink, useRoute, useRouter } from "vue-router";
import { fetchSkill, formatDate, uninstallSkill, type Finding, type InstalledRef, type SkillDetail } from "../api";
import AddToGroupMenu from "../components/AddToGroupMenu.vue";
import FileTree from "../components/FileTree.vue";
import FileView from "../components/FileView.vue";
import FlagTags from "../components/FlagTags.vue";
import InstallDialog from "../components/InstallDialog.vue";
import LikeButton from "../components/LikeButton.vue";
import MarkdownView from "../components/MarkdownView.vue";
import RiskTag from "../components/RiskTag.vue";

const route = useRoute();
const router = useRouter();
const toast = useToast();
const confirm = useConfirm();

const detail = ref<SkillDetail | null>(null);
const loading = ref(true);
const error = ref<string | null>(null);
const installOpen = ref(false);
const tab = ref("overview");
const selectedFile = ref("SKILL.md");
const highlight = ref<{ file: string; line: number } | null>(null);
const viewMode = ref<"preview" | "code">("preview");

function isMarkdown(path: string): boolean {
  return /\.(md|markdown)$/i.test(path);
}

function selectFile(path: string) {
  selectedFile.value = path;
  viewMode.value = "preview";
}

const source = computed(() => String(route.params.source ?? ""));
const skillPath = computed(() => {
  const value = route.params.path;
  return Array.isArray(value) ? value.join("/") : String(value ?? "");
});
const query = computed(() => (typeof route.query.q === "string" ? route.query.q : ""));
const pathCrumbs = computed(() => {
  const parts = skillPath.value ? skillPath.value.split("/") : [];
  return parts.map((name, index) => ({ name, prefix: parts.slice(0, index + 1).join("/") }));
});
const backRoute = computed(() => ({ name: "browse", query: query.value ? { q: query.value } : {} }));

const crumbsEl = ref<HTMLElement | null>(null);
const crumbsCollapsed = ref(false);

async function measureCrumbs() {
  crumbsCollapsed.value = false;
  await nextTick();
  const element = crumbsEl.value;
  if (element && element.scrollWidth > element.clientWidth + 1) crumbsCollapsed.value = true;
}

window.addEventListener("resize", measureCrumbs);
onBeforeUnmount(() => window.removeEventListener("resize", measureCrumbs));

const collapseCrumbs = computed(() => crumbsCollapsed.value && pathCrumbs.value.length > 2);
const hiddenCrumbs = computed(() => (collapseCrumbs.value ? pathCrumbs.value.slice(0, -2) : []));
const tailCrumbs = computed(() => (collapseCrumbs.value ? pathCrumbs.value.slice(-2) : pathCrumbs.value));
const crumbMenu = ref<InstanceType<typeof Menu> | null>(null);

function toggleCrumbMenu(event: Event) {
  crumbMenu.value?.toggle(event);
}

const crumbMenuItems = computed<MenuItem[]>(() =>
  hiddenCrumbs.value.map((crumb) => ({
    label: crumb.name,
    icon: "pi pi-folder",
    command: () => router.push({ name: "browse", query: { source: source.value, path: crumb.prefix } }),
  })),
);

const skillMd = computed(() => detail.value?.files.find((file) => file.path === "SKILL.md")?.content ?? "");
const currentFile = computed(() => detail.value?.files.find((file) => file.path === selectedFile.value) ?? detail.value?.files[0] ?? null);

const categoryLabels: Record<Finding["category"], string> = {
  network: "network",
  destructive: "destructive",
  confirmation: "confirmation",
  promptInjection: "prompt injection",
  secret: "secret",
  script: "script",
  claudeCodeOnly: "claude code only",
};

function categorySeverity(category: Finding["category"]): "danger" | "warn" | "secondary" | "success" | "info" {
  if (category === "promptInjection" || category === "secret") return "danger";
  if (category === "destructive" || category === "network") return "warn";
  if (category === "confirmation") return "success";
  if (category === "claudeCodeOnly") return "info";
  return "secondary";
}

const SEVERITY_ORDER: Finding["category"][] = ["promptInjection", "secret", "destructive", "network", "confirmation", "claudeCodeOnly", "script"];
const findingFilter = ref<Finding["category"] | null>(null);

const sortedFindings = computed(() => {
  const findings = [...(detail.value?.findings ?? [])].sort(
    (a, b) => SEVERITY_ORDER.indexOf(a.category) - SEVERITY_ORDER.indexOf(b.category) || a.file.localeCompare(b.file) || a.line - b.line,
  );
  return findingFilter.value ? findings.filter((finding) => finding.category === findingFilter.value) : findings;
});

function showFindings(category: Finding["category"] | null) {
  findingFilter.value = category;
  tab.value = "findings";
}

const findingCounts = computed(() => {
  const counts = new Map<Finding["category"], number>();
  for (const finding of detail.value?.findings ?? []) counts.set(finding.category, (counts.get(finding.category) ?? 0) + 1);
  return [...counts.entries()].map(([category, count]) => ({ category, count, label: categoryLabels[category], severity: categorySeverity(category) }));
});

const fileAnchor = (path: string) => `f-${path.replace(/[^a-zA-Z0-9]+/g, "-")}`;

async function load() {
  loading.value = true;
  error.value = null;
  highlight.value = null;
  tab.value = "overview";
  findingFilter.value = null;
  try {
    detail.value = await fetchSkill(source.value, skillPath.value, query.value);
    selectedFile.value = detail.value.files.find((file) => file.path !== "SKILL.md")?.path ?? detail.value.files[0]?.path ?? "";
    document.title = `${detail.value.entry.name} - ai-community-skills`;
  } catch (cause) {
    error.value = cause instanceof Error ? cause.message : String(cause);
    detail.value = null;
  } finally {
    loading.value = false;
    if (detail.value) measureCrumbs();
  }
}

async function jumpTo(finding: Finding) {
  if (!detail.value?.files.some((file) => file.path === finding.file)) return;
  tab.value = "files";
  selectedFile.value = finding.file;
  viewMode.value = "code";
  highlight.value = { file: finding.file, line: finding.line };
  await nextTick();
  window.setTimeout(() => {
    const element = document.getElementById(`${fileAnchor(finding.file)}-${finding.line}`);
    if (element) element.scrollIntoView({ block: "center", behavior: "smooth" });
  }, 80);
}

async function refreshLibrary() {
  if (!detail.value) return;
  try {
    const fresh = await fetchSkill(source.value, skillPath.value, query.value);
    detail.value = { ...detail.value, entry: fresh.entry, collections: fresh.collections };
  } catch {
    return;
  }
}

const installMenu = ref<InstanceType<typeof Menu> | null>(null);
const hasDrift = computed(() => (detail.value?.installed ?? []).some((item) => item.drift));

function toggleInstalledMenu(event: Event) {
  installMenu.value?.toggle(event);
}

const TARGET_LABELS: Record<string, string> = { "claude-code": "Claude Code", codex: "Codex", grok: "Grok", web: "web export" };

function locationLabel(record: InstalledRef): string {
  const target = TARGET_LABELS[record.target] ?? record.target;
  return record.scope ? `${target}, ${record.scope}` : target;
}

const installedMenuItems = computed<MenuItem[]>(() => {
  const records = detail.value?.installed ?? [];
  return [
    { label: hasDrift.value ? "Reinstall to update" : "Install again", icon: "pi pi-download", command: () => { installOpen.value = true; } },
    { separator: true },
    ...records.map((record) => ({
      label: records.length === 1 ? "Uninstall" : `Uninstall from ${locationLabel(record)}`,
      icon: "pi pi-trash",
      command: () => confirmUninstall(record),
    })),
  ];
});

function confirmUninstall(record: InstalledRef) {
  if (!detail.value) return;
  const entry = detail.value.entry;
  confirm.require({
    header: `Uninstall ${entry.name}`,
    message: `This removes the copy installed for ${locationLabel(record)} by deleting ${record.installPath}. The skill stays in the index and can be reinstalled anytime.`,
    icon: "pi pi-exclamation-triangle",
    rejectProps: { label: "Cancel", severity: "secondary", text: true },
    acceptProps: { label: "Uninstall", severity: "danger" },
    accept: async () => {
      try {
        await uninstallSkill({ name: entry.name, source: entry.source, target: record.target, installPath: record.installPath });
        toast.add({ severity: "success", summary: `Uninstalled ${entry.name}`, detail: record.installPath, life: 3000 });
        await load();
      } catch (cause) {
        toast.add({ severity: "error", summary: "Uninstall failed", detail: cause instanceof Error ? cause.message : String(cause), life: 5000 });
      }
    },
  });
}

async function copyLink() {
  try {
    await navigator.clipboard.writeText(window.location.href);
    toast.add({ severity: "secondary", summary: "Link copied", life: 2000 });
  } catch {
    toast.add({ severity: "warn", summary: "Could not copy", detail: window.location.href, life: 4000 });
  }
}

function formatMatch(field: { score: number; type: string }): string {
  return field.type === "none" ? "-" : `${field.type} ${field.score.toFixed(2)}`;
}

function qualityClass(score: number): string {
  if (score >= 80) return "good";
  if (score >= 55) return "fair";
  return "poor";
}

watch(() => [source.value, skillPath.value, query.value], load, { immediate: true });
</script>

<template>
  <div class="page">
    <div v-if="loading" class="empty"><ProgressSpinner style="width: 32px; height: 32px" strokeWidth="6" /></div>
    <template v-else-if="error">
      <div class="crumbs"><RouterLink :to="backRoute">Browse</RouterLink><span>/</span><span>{{ source }}</span></div>
      <Message severity="error">{{ error }}</Message>
    </template>

    <template v-else-if="detail">
      <div class="skill-top">
      <div class="crumbs" ref="crumbsEl">
        <RouterLink :to="backRoute">Browse</RouterLink>
        <span>/</span>
        <RouterLink :to="{ name: 'browse', query: { source: detail.entry.source } }">{{ detail.entry.source }}</RouterLink>
        <template v-if="hiddenCrumbs.length > 0">
          <span>/</span>
          <button type="button" class="crumb-more" title="Show full path" aria-haspopup="true" aria-controls="crumb-menu" @click="toggleCrumbMenu">&hellip;</button>
          <Menu id="crumb-menu" ref="crumbMenu" :model="crumbMenuItems" :popup="true" />
        </template>
        <template v-for="crumb in tailCrumbs" :key="crumb.prefix">
          <span>/</span>
          <RouterLink class="crumb" :to="{ name: 'browse', query: { source: detail.entry.source, path: crumb.prefix } }">{{ crumb.name }}</RouterLink>
        </template>
      </div>
        <div class="actions">
          <LikeButton :skill="detail.entry" :liked="detail.entry.liked" label @change="refreshLibrary" />
          <AddToGroupMenu :skill="detail.entry" :groups="detail.entry.groups" :collections="detail.collections" @changed="refreshLibrary" />
          <Button label="Copy link" icon="pi pi-link" severity="secondary" outlined @click="copyLink" />
          <Button
            v-if="detail.repositoryUrl"
            :icon="detail.repositoryUrl.includes('github.com') ? 'pi pi-github' : 'pi pi-external-link'"
            severity="secondary"
            outlined
            as="a"
            :href="detail.repositoryUrl"
            target="_blank"
            rel="noopener"
            title="Open repository"
            aria-label="Open repository"
            style="text-decoration: none"
          />
          <Button v-if="detail.installed.length === 0" label="Install" icon="pi pi-download" @click="installOpen = true" />
          <template v-else>
            <Button
              :label="hasDrift ? 'Update available' : 'Installed'"
              :icon="hasDrift ? 'pi pi-arrow-circle-up' : 'pi pi-check'"
              :severity="hasDrift ? 'warn' : 'success'"
              outlined
              aria-haspopup="true"
              aria-controls="installed-menu"
              @click="toggleInstalledMenu"
            >
              <template #default>
                <i :class="hasDrift ? 'pi pi-arrow-circle-up' : 'pi pi-check'"></i>
                <span class="p-button-label">{{ hasDrift ? "Update available" : "Installed" }}</span>
                <i class="pi pi-chevron-down" style="font-size: 11px"></i>
              </template>
            </Button>
            <Menu id="installed-menu" ref="installMenu" :model="installedMenuItems" :popup="true" />
          </template>
        </div>
      </div>

      <div class="skill-head" style="margin-bottom: 22px">
        <div style="display: flex; align-items: center; gap: 12px; flex-wrap: wrap">
          <h1>{{ detail.entry.name }}</h1>
          <RiskTag :level="detail.entry.riskLevel" />
        </div>
        <p class="desc">{{ detail.entry.description }}</p>
        <div class="meta-row">
          <span>Category <strong>{{ detail.entry.category }}</strong></span>
          <span>Updated <strong>{{ formatDate(detail.entry.lastCommitDate) }}</strong></span>
          <span>Size <strong>{{ detail.entry.lines }} lines, ~{{ detail.entry.tokenEstimate.toLocaleString() }} tokens</strong></span>
          <span>Files <strong>{{ detail.files.length }}</strong></span>
        </div>
        <FlagTags :entry="detail.entry" />
        <div class="chips" v-if="detail.entry.tags.length > 0">
          <RouterLink v-for="tag in detail.entry.tags" :key="tag" class="chip" :to="{ name: 'browse', query: { tag } }">{{ tag }}</RouterLink>
        </div>
      </div>

      <div class="panel">
          <Tabs v-model:value="tab">
            <TabList>
              <Tab value="overview">Overview</Tab>
              <Tab value="files">Files ({{ detail.files.length }})</Tab>
              <Tab value="details"><span class="dot" :class="`dot-${detail.entry.riskLevel}`" style="margin-right: 7px"></span>Details</Tab>
              <Tab value="findings">Findings ({{ detail.findings.length }})</Tab>
              <Tab value="frontmatter">Frontmatter</Tab>
            </TabList>
            <TabPanels style="padding: 0">
              <TabPanel value="overview">
                <div class="tab-body">
                  <MarkdownView v-if="skillMd" :source="skillMd" />
                  <p v-else class="muted">This skill has no SKILL.md to render.</p>
                </div>
              </TabPanel>
              <TabPanel value="findings">
                <div class="tab-body">
                  <p class="muted small" v-if="detail.findings.length === 0" style="margin: 0">No static findings. Nothing in this skill matched the risk rules.</p>
                  <template v-else>
                    <p class="muted small" style="margin: 0 0 12px">
                      Every finding is a static pattern match. Open the location to judge whether it is a real risk or a false positive: a match in prose usually explains something, a match in a code block or a shipped script is what actually runs.
                    </p>
                    <div class="chips" style="margin-bottom: 14px">
                      <button type="button" class="chip" :class="{ active: findingFilter === null }" @click="findingFilter = null">All {{ detail.findings.length }}</button>
                      <button v-for="item in findingCounts" :key="item.category" type="button" class="chip" :class="{ active: findingFilter === item.category }" @click="findingFilter = item.category">{{ item.label }} {{ item.count }}</button>
                    </div>
                    <DataTable :value="sortedFindings" size="small" scrollable scrollHeight="600px">
                      <Column header="Category" style="width: 140px">
                        <template #body="{ data }"><Tag :value="categoryLabels[data.category as Finding['category']]" :severity="categorySeverity(data.category)" /></template>
                      </Column>
                      <Column field="label" header="Rule" style="width: 230px" />
                      <Column header="Location" style="width: 170px">
                        <template #body="{ data }">
                          <button type="button" class="loc" @click="jumpTo(data)">{{ data.file }}:{{ data.line }}</button>
                          <div class="muted small">{{ data.blockKind }}</div>
                        </template>
                      </Column>
                      <Column header="Match" style="width: 130px">
                        <template #body="{ data }"><span class="mono">{{ data.match }}</span></template>
                      </Column>
                      <Column header="Excerpt">
                        <template #body="{ data }"><div class="excerpt">{{ data.excerpt }}</div></template>
                      </Column>
                    </DataTable>
                  </template>
                </div>
              </TabPanel>
              <TabPanel value="files">
                <div class="tab-body">
                  <div class="files-layout">
                    <div class="files-tree">
                      <FileTree :files="detail.files" :selected="currentFile ? currentFile.path : ''" @select="selectFile" />
                    </div>
                    <div class="files-view" v-if="currentFile">
                      <div class="files-view-head">
                        <span class="mono path">{{ currentFile.path }}</span>
                        <span class="muted small">{{ currentFile.lines }} lines</span>
                        <span class="spacer"></span>
                        <div class="seg" v-if="isMarkdown(currentFile.path)">
                          <button type="button" :class="{ active: viewMode === 'preview' }" @click="viewMode = 'preview'">Preview</button>
                          <button type="button" :class="{ active: viewMode === 'code' }" @click="viewMode = 'code'">Code</button>
                        </div>
                      </div>
                      <div class="files-view-body" v-if="isMarkdown(currentFile.path) && viewMode === 'preview'">
                        <MarkdownView :source="currentFile.content" />
                      </div>
                      <FileView v-else :content="currentFile.content" :anchor="fileAnchor(currentFile.path)" :highlight="highlight && highlight.file === currentFile.path ? highlight.line : null" />
                    </div>
                  </div>
                </div>
              </TabPanel>
              <TabPanel value="frontmatter">
                <div class="tab-body">
                  <pre class="json">{{ JSON.stringify(detail.frontmatter, null, 2) }}</pre>
                </div>
              </TabPanel>
              <TabPanel value="details">
                <div class="tab-body detail-grid">
          <div class="panel" v-if="detail.scoreExplanation">
            <div class="panel-head"><h2>Search score</h2><span class="muted small">"{{ query }}"</span></div>
            <div class="score-big">{{ detail.scoreExplanation.score.toFixed(2) }}</div>
            <div class="muted small">{{ detail.scoreExplanation.matchedTerms }} of {{ detail.scoreExplanation.totalTerms }} terms matched<span v-if="detail.mode === 'semantic'">, keyword breakdown shown for reference</span></div>
            <ul class="term-list">
              <li v-for="term in detail.scoreExplanation.terms" :key="term.term">
                <span class="term">{{ term.term }}</span>
                <span class="where">
                  <template v-if="term.best === 'none'">no match</template>
                  <template v-else>{{ term.best }}, {{ formatMatch(term[term.best]) }}</template>
                </span>
              </li>
            </ul>
            <p class="muted small" style="margin: 12px 0 0">Name matches count twice, category matches half. Score is the average contribution times coverage, halved and capped at 1.</p>
          </div>

          <div class="panel">
            <div class="panel-head"><h2>Risk</h2><RiskTag :level="detail.entry.riskLevel" /></div>
            <p class="muted small" v-if="detail.reasons.length === 0" style="margin: 0">No risk rule matched this skill.</p>
            <ul class="reasons" v-else style="margin-top: 0">
              <li v-for="reason in detail.reasons" :key="reason">{{ reason }}</li>
            </ul>
            <div class="finding-counts" v-if="findingCounts.length > 0">
              <button v-for="item in findingCounts" :key="item.category" type="button" class="tag-button" @click="showFindings(item.category)">
                <Tag :value="`${item.count} ${item.label}`" :severity="item.severity" />
              </button>
            </div>
            <Button v-if="detail.findings.length > 0" label="Review all findings" size="small" text style="margin-top: 12px; padding-left: 0" @click="showFindings(null)" />
          </div>

          <div class="panel" v-if="detail.validation.errors.length > 0 || detail.validation.warnings.length > 0">
            <div class="panel-head">
              <h2>Validation</h2>
              <span class="muted small">{{ detail.validation.errors.length }} errors, {{ detail.validation.warnings.length }} warnings</span>
            </div>
            <ul class="validation-list">
              <li v-for="item in detail.validation.errors" :key="item" class="err"><i class="pi pi-times-circle"></i><span>{{ item }}</span></li>
              <li v-for="item in detail.validation.warnings" :key="item" class="warn"><i class="pi pi-exclamation-triangle"></i><span>{{ item }}</span></li>
            </ul>
          </div>

          <div class="panel">
            <div class="panel-head"><h2>Source</h2></div>
            <dl class="kv">
              <dt>Repository</dt>
              <dd>
                <a v-if="detail.repositoryUrl" :href="detail.entry.repository" target="_blank" rel="noopener">{{ detail.entry.repository.replace(/^https?:\/\/(www\.)?github\.com\//, "") }}</a>
                <span v-else>{{ detail.entry.repository }}</span>
              </dd>
              <dt>Stars</dt>
              <dd>{{ detail.entry.sourceReputation.stars.toLocaleString() }}</dd>
              <dt>Last activity</dt>
              <dd>{{ formatDate(detail.entry.sourceReputation.lastActivityDate) }}</dd>
              <dt>Maintainers</dt>
              <dd>{{ detail.entry.sourceReputation.singleMaintainer ? "single maintainer" : "multiple contributors" }}</dd>
              <dt>CI</dt>
              <dd>{{ detail.entry.sourceReputation.hasCi ? "present" : "not detected" }}</dd>
              <template v-if="detail.entry.author">
                <dt>Author</dt>
                <dd><RouterLink :to="{ name: 'browse', query: { author: detail.entry.author } }">{{ detail.entry.author }}</RouterLink></dd>
              </template>
              <template v-if="detail.entry.qualityScore !== null">
                <dt>Quality</dt>
                <dd>
                  <div class="quality-cell" style="max-width: 160px">
                    <span class="quality-track"><span class="quality-fill" :class="qualityClass(detail.entry.qualityScore)" :style="{ width: `${detail.entry.qualityScore}%` }"></span></span>
                    <span class="mono small">{{ detail.entry.qualityScore }}</span>
                  </div>
                </dd>
              </template>
              <dt>Content hash</dt>
              <dd class="mono">{{ detail.entry.contentHash.slice(0, 12) }}</dd>
            </dl>
          </div>

          <div class="panel" v-if="detail.entry.upstreamRisk || detail.entry.upstreamCategory || detail.entry.tools.length > 0 || detail.entry.setup">
            <div class="panel-head"><h2>Upstream metadata</h2></div>
            <p class="muted small" style="margin: 0 0 10px">Declared by the source repository, not verified by acs. The risk badge above comes from our own static analysis.</p>
            <dl class="kv">
              <template v-if="detail.entry.upstreamCategory">
                <dt>Category</dt>
                <dd>{{ detail.entry.upstreamCategory }}</dd>
              </template>
              <template v-if="detail.entry.upstreamRisk">
                <dt>Risk label</dt>
                <dd>{{ detail.entry.upstreamRisk }}</dd>
              </template>
              <template v-if="detail.entry.tools.length > 0">
                <dt>Tools</dt>
                <dd>{{ detail.entry.tools.join(", ") }}</dd>
              </template>
              <template v-if="detail.entry.setup">
                <dt>Setup</dt>
                <dd>{{ detail.entry.setup.type }}{{ detail.entry.setup.summary ? `: ${detail.entry.setup.summary}` : "" }}</dd>
              </template>
            </dl>
          </div>

          <div class="panel" v-if="detail.installed.length > 0">
            <div class="panel-head"><h2>Installed</h2></div>
            <div class="stack tight">
              <div v-for="item in detail.installed" :key="item.installPath">
                <div class="small">{{ locationLabel(item) }}
                  <Tag :value="item.drift ? 'upstream changed' : 'up to date'" :severity="item.drift ? 'warn' : 'success'" style="margin-left: 8px" />
                </div>
                <div class="mono muted">{{ item.installPath }}</div>
              </div>
            </div>
          </div>
                </div>
              </TabPanel>
            </TabPanels>
          </Tabs>
      </div>

      <InstallDialog :entry="detail.entry" v-model:visible="installOpen" @installed="load" />
    </template>
  </div>
</template>
