<script setup lang="ts">
import { useMemoryStore } from '@proj-airi/stage-ui/stores/memory'
import { FieldCheckbox } from '@proj-airi/ui'
import { storeToRefs } from 'pinia'
import { useI18n } from 'vue-i18n'

import MemoryList from '../modules/memory-long-term-memories.vue'

// FAIRY: this entry used to show only "Work in Progress". It now holds the real long-term memory: the switch, the
// memory folder button, and every memory with add, edit and delete.
const { t } = useI18n()
const { enabled } = storeToRefs(useMemoryStore())
</script>

<template>
  <div :class="['flex flex-col', 'gap-4']">
    <div :class="['rounded-xl', 'bg-neutral-100 dark:bg-neutral-900', 'p-4']">
      <FieldCheckbox v-model="enabled" :label="t('settings.pages.modules.memory-long-term.enable')" :description="t('settings.pages.modules.memory-long-term.enable-description')" />
    </div>
    <MemoryList />
  </div>
</template>

<route lang="yaml">
meta:
  layout: settings
  titleKey: settings.pages.memory.title
  subtitleKey: settings.title
  descriptionKey: settings.pages.memory.description
  icon: i-solar:leaf-bold-duotone
  settingsEntry: true
  order: 5
  stageTransition:
    name: slide
</route>
