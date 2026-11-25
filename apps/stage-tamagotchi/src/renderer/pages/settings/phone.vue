<script setup lang="ts">
import { useElectronEventaInvoke } from '@proj-airi/electron-vueuse'
import { renderSVG } from 'uqr'
import { computed, onMounted, shallowRef } from 'vue'
import { useI18n } from 'vue-i18n'

import { electronPhoneInfo } from '../../../shared/eventa'

// FAIRY: pair a phone with the PC Iru. The QR code opens the phone page with its pairing key.
const { t } = useI18n()
const getPhoneInfo = useElectronEventaInvoke(electronPhoneInfo)
const info = shallowRef<{ port: number, key: string, url?: string }>()

onMounted(async () => {
  info.value = await getPhoneInfo()
})

const pairingLink = computed(() => info.value?.url ? `${info.value.url}?key=${encodeURIComponent(info.value.key)}` : '')

// Dark on white, because some phone scanners cannot read an inverted QR code.
const qrSource = computed(() => pairingLink.value
  ? `data:image/svg+xml;utf8,${encodeURIComponent(renderSVG(pairingLink.value, { border: 2, ecc: 'M', pixelSize: 8, whiteColor: '#FFFFFF', blackColor: '#121212' }))}`
  : '')
</script>

<template>
  <div :class="['flex flex-col', 'gap-4']">
    <div v-if="info && !info.url" :class="['rounded-xl', 'bg-amber-100 dark:bg-amber-900/40', 'p-4', 'text-sm']">
      {{ t('tamagotchi.settings.pages.phone.no-tailscale') }}
    </div>

    <section v-if="info?.url" :class="['rounded-xl', 'bg-neutral-50 dark:bg-neutral-800/60', 'p-4', 'flex flex-col gap-4', 'md:flex-row md:items-start']">
      <img :src="qrSource" :alt="t('tamagotchi.settings.pages.phone.qr-alt')" :class="['h-56 w-56', 'shrink-0', 'rounded-lg', 'self-center']">
      <div :class="['flex flex-col gap-3', 'min-w-0']">
        <h2 :class="['m-0', 'text-sm font-medium']">
          {{ t('tamagotchi.settings.pages.phone.steps-title') }}
        </h2>
        <ol :class="['m-0', 'pl-5', 'flex flex-col gap-2', 'text-sm']">
          <li>{{ t('tamagotchi.settings.pages.phone.step-1') }}</li>
          <li>{{ t('tamagotchi.settings.pages.phone.step-2') }}</li>
          <li>{{ t('tamagotchi.settings.pages.phone.step-3') }}</li>
        </ol>
        <div :class="['text-xs', 'text-neutral-500 dark:text-neutral-400']">
          {{ t('tamagotchi.settings.pages.phone.address') }}: <span :class="['font-mono', 'break-all']">{{ info.url }}</span>
        </div>
        <p :class="['m-0', 'text-xs', 'text-neutral-500 dark:text-neutral-400']">
          {{ t('tamagotchi.settings.pages.phone.private') }}
        </p>
      </div>
    </section>
  </div>
</template>

<route lang="yaml">
meta:
  layout: settings
  titleKey: tamagotchi.settings.pages.phone.title
  subtitleKey: settings.title
  descriptionKey: tamagotchi.settings.pages.phone.description
  icon: i-solar:smartphone-bold-duotone
  settingsEntry: true
  order: 9
  stageTransition:
    name: slide
</route>
