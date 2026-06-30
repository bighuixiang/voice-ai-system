<template>
  <RouterView v-slot="{ Component, route }">
    <component :is="Component" :key="route.name === 'project-workspace' ? `project-${route.params.slug}` : 'project-hub'" />
  </RouterView>
</template>
