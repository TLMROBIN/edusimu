<template>
  <div v-if="enabled" class="danmaku-overlay" aria-hidden="true">
    <div
      v-for="item in visibleItems"
      :key="item.id"
      class="danmaku-item"
      :class="`track-${item.track}`"
      @animationend="removeItem(item.id)"
    >
      <strong>{{ item.display_name }}：</strong>{{ item.content }}
    </div>
  </div>
</template>

<script setup>
import { ref, watch } from 'vue'

const props = defineProps({
  enabled: { type: Boolean, default: true },
  messages: { type: Array, default: () => [] }
})

const visibleItems = ref([])
const seenIds = new Set()

watch(
  () => [props.enabled, props.messages.map(message => message.id)],
  () => {
    if (!props.messages.length) {
      visibleItems.value = []
      seenIds.clear()
      return
    }
    if (!props.enabled) visibleItems.value = []
    for (const message of props.messages) {
      if (seenIds.has(message.id)) continue
      seenIds.add(message.id)
      if (props.enabled) visibleItems.value.push({ ...message, track: message.id % 3 })
    }
    if (visibleItems.value.length > 6) {
      visibleItems.value.splice(0, visibleItems.value.length - 6)
    }
  },
  { immediate: true }
)

const removeItem = id => {
  const index = visibleItems.value.findIndex(item => item.id === id)
  if (index >= 0) visibleItems.value.splice(index, 1)
}
</script>

<style scoped>
.danmaku-overlay {
  position: absolute;
  top: 64px;
  left: 0;
  right: 0;
  height: 112px;
  overflow: hidden;
  pointer-events: none;
  z-index: 30;
}

.danmaku-item {
  position: absolute;
  left: 100%;
  max-width: 72%;
  padding: 5px 12px;
  border-radius: 16px;
  color: #fff;
  background: rgba(20, 35, 55, 0.78);
  font-size: 16px;
  line-height: 24px;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  will-change: transform;
  animation: danmaku-scroll 10s linear forwards;
}

.danmaku-item strong {
  font-weight: 600;
}

.track-0 { top: 0; }
.track-1 { top: 38px; }
.track-2 { top: 76px; }

@keyframes danmaku-scroll {
  from { transform: translate3d(0, 0, 0); }
  to { transform: translate3d(-140vw, 0, 0); }
}

@media (max-width: 768px) {
  .danmaku-item {
    max-width: 82%;
    font-size: 14px;
  }
}
</style>
