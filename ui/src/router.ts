import { createRouter, createWebHistory, type RouteLocationRaw } from "vue-router";
import BrowseView from "./views/BrowseView.vue";
import DashboardView from "./views/DashboardView.vue";
import FavoritesView from "./views/FavoritesView.vue";
import GroupsView from "./views/GroupsView.vue";
import GroupView from "./views/GroupView.vue";
import InstalledView from "./views/InstalledView.vue";
import MaintenanceView from "./views/MaintenanceView.vue";
import SkillView from "./views/SkillView.vue";
import SourcesView from "./views/SourcesView.vue";

export function skillRoute(entry: { source: string; path: string }, query?: string): RouteLocationRaw {
  return {
    name: "skill",
    params: { source: entry.source, path: entry.path ? entry.path.split("/") : [] },
    query: query ? { q: query } : {},
  };
}

export const router = createRouter({
  history: createWebHistory(),
  routes: [
    { path: "/", name: "dashboard", component: DashboardView },
    { path: "/browse", name: "browse", component: BrowseView },
    { path: "/favorites", name: "favorites", component: FavoritesView },
    { path: "/groups", name: "groups", component: GroupsView },
    { path: "/groups/:id", name: "group", component: GroupView },
    { path: "/library", redirect: (to) => ({ name: to.query.tab === "groups" ? "groups" : "favorites" }) },
    { path: "/library/groups/:id", redirect: (to) => ({ name: "group", params: { id: to.params.id } }) },
    { path: "/installed", name: "installed", component: InstalledView },
    { path: "/sources", name: "sources", component: SourcesView },
    { path: "/settings", name: "settings", component: MaintenanceView },
    { path: "/maintenance", redirect: { name: "settings" } },
    { path: "/skill/:source/:path(.*)*", name: "skill", component: SkillView },
    { path: "/search", redirect: (to) => ({ name: "browse", query: to.query }) },
    { path: "/:catchAll(.*)", redirect: "/" },
  ],
  scrollBehavior(to, from, saved) {
    if (saved) return saved;
    if (to.name !== from.name) return { top: 0 };
    return undefined;
  },
});
