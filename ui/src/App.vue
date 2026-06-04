<template>
  <RouterView v-slot="{ Component, route }">
    <KeepAlive :include="['NovelWorkspace']" :max="10">
      <component :is="Component" :key="route.name === 'project-workspace' ? `project-${route.params.slug}` : 'project-hub'" />
    </KeepAlive>
  </RouterView>
</template>
