import { createRouter, createWebHistory } from "vue-router";
import NovelWorkspace from "@/components/novel/NovelWorkspace.vue";
import { useNovelStore } from "@/stores/novel";

export const router = createRouter({
  history: createWebHistory(),
  routes: [
    {
      path: "/",
      name: "project-hub",
      component: NovelWorkspace,
      meta: { keepAlive: true }
    },
    {
      path: "/projects/:slug",
      name: "project-workspace",
      component: NovelWorkspace,
      meta: { keepAlive: true }
    },
    {
      path: "/:pathMatch(.*)*",
      redirect: "/"
    }
  ]
});

router.beforeEach((to, from) => {
  if (from.name === "project-workspace" && to.fullPath !== from.fullPath) {
    return useNovelStore().canLeaveCurrentWorkspace();
  }

  return true;
});
