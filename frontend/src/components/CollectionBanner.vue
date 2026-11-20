<template>
  <section v-if="status === 'loading'" class="banner-loading" aria-label="正在加载推荐合集" role="status">
    <span>正在加载推荐合集…</span>
  </section>

  <section v-else-if="status === 'error'" class="banner-error" role="alert">
    <span>推荐合集暂时无法显示</span>
    <button type="button" @click="loadCollections">重新加载</button>
  </section>

  <section
    v-else-if="collections.length"
    class="collection-banner"
    :class="{ 'single-slide': collections.length === 1 }"
    aria-label="推荐动画合集"
    aria-roledescription="轮播图"
    tabindex="0"
    @keydown="handleKeydown"
    @pointerenter="startAutoplay"
    @pointerleave="startAutoplay"
    @focusin="startAutoplay"
    @focusout="handleFocusOut"
  >
    <div ref="viewport" class="banner-viewport" @scroll="handleScroll">
      <RouterLink
        v-for="(collection, index) in collections"
        :key="collection.id"
        class="banner-slide"
        :class="{ active: activeIndex === index }"
        :to="`/collections/${collection.id}`"
        :aria-label="`打开合集：${collection.title}，共 ${collection.animation_count} 个课件`"
        :aria-hidden="activeIndex !== index"
        :tabindex="activeIndex === index ? 0 : -1"
      >
        <img :src="resolveAssetUrl(collection.cover_image)" :alt="`${collection.title}合集封面`" />
        <span class="banner-caption">
          <strong>{{ collection.title }}</strong>
          <span v-if="collection.description">{{ collection.description }}</span>
          <span class="banner-action">{{ collection.animation_count }} 个课件 · 进入合集</span>
        </span>
      </RouterLink>
    </div>

    <template v-if="collections.length > 1">
      <button type="button" class="banner-arrow previous" aria-label="上一个合集" @click="changeSlide(-1)">
        <svg viewBox="0 0 24 24" aria-hidden="true"><path d="m15 5-7 7 7 7" /></svg>
      </button>
      <button type="button" class="banner-arrow next" aria-label="下一个合集" @click="changeSlide(1)">
        <svg viewBox="0 0 24 24" aria-hidden="true"><path d="m9 5 7 7-7 7" /></svg>
      </button>
      <div class="banner-pagination" aria-label="选择合集轮播页">
        <button
          v-for="(collection, index) in collections"
          :key="collection.id"
          type="button"
          :class="{ active: activeIndex === index }"
          :aria-label="`显示第 ${index + 1} 个合集：${collection.title}`"
          :aria-current="activeIndex === index ? 'true' : undefined"
          @click="scrollToIndex(index)"
        ><span aria-hidden="true"></span></button>
      </div>
      <span class="banner-count" aria-live="polite">{{ activeIndex + 1 }} / {{ collections.length }}</span>
    </template>
  </section>
</template>

<script setup>
import { nextTick, onBeforeUnmount, onMounted, ref } from 'vue'
import axios from 'axios'
import { resolveAssetUrl } from '../utils/apiBase'

const collections = ref([])
const status = ref('loading')
const activeIndex = ref(0)
const viewport = ref(null)
let autoplayTimer = null
let scrollFrame = null
let mounted = false
const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)')

const loadCollections = async () => {
  status.value = 'loading'
  try {
    const response = await axios.get('/api/collections/', { params: { banner_only: true } })
    collections.value = Array.isArray(response.data) ? response.data : []
    activeIndex.value = 0
    status.value = 'success'
    await nextTick()
    startAutoplay()
  } catch (error) {
    collections.value = []
    status.value = 'error'
  }
}

const stopAutoplay = () => {
  if (autoplayTimer) window.clearInterval(autoplayTimer)
  autoplayTimer = null
}

const startAutoplay = () => {
  stopAutoplay()
  const banner = viewport.value?.parentElement
  if (!mounted || collections.value.length < 2 || reducedMotion.matches || document.hidden ||
      banner?.matches(':hover, :focus-within')) return
  autoplayTimer = window.setInterval(() => scrollToIndex(activeIndex.value + 1), 6000)
}

const scrollToIndex = (index) => {
  if (!viewport.value || !collections.value.length) return
  const normalizedIndex = (index + collections.value.length) % collections.value.length
  activeIndex.value = normalizedIndex
  viewport.value.scrollTo({
    left: normalizedIndex * viewport.value.clientWidth,
    behavior: reducedMotion.matches ? 'auto' : 'smooth'
  })
  startAutoplay()
}

const changeSlide = (direction) => {
  scrollToIndex(activeIndex.value + direction)
}

const handleScroll = () => {
  if (scrollFrame) cancelAnimationFrame(scrollFrame)
  scrollFrame = requestAnimationFrame(() => {
    if (!viewport.value?.clientWidth) return
    activeIndex.value = Math.max(0, Math.min(
      collections.value.length - 1,
      Math.round(viewport.value.scrollLeft / viewport.value.clientWidth)
    ))
  })
}

const handleKeydown = (event) => {
  if (event.key !== 'ArrowLeft' && event.key !== 'ArrowRight') return
  event.preventDefault()
  changeSlide(event.key === 'ArrowLeft' ? -1 : 1)
}

const handleFocusOut = (event) => {
  if (!event.currentTarget.contains(event.relatedTarget)) nextTick(startAutoplay)
}

const handleVisibility = () => {
  if (document.hidden) stopAutoplay()
  else startAutoplay()
}

onMounted(() => {
  mounted = true
  loadCollections()
  document.addEventListener('visibilitychange', handleVisibility)
  reducedMotion.addEventListener?.('change', startAutoplay)
})

onBeforeUnmount(() => {
  mounted = false
  stopAutoplay()
  if (scrollFrame) cancelAnimationFrame(scrollFrame)
  document.removeEventListener('visibilitychange', handleVisibility)
  reducedMotion.removeEventListener?.('change', startAutoplay)
})
</script>

<style scoped>
.collection-banner,
.banner-loading {
  position: relative;
  width: 100%;
  margin-bottom: 24px;
  aspect-ratio: 16 / 5;
  min-height: 230px;
  max-height: 340px;
  overflow: hidden;
  border-radius: 22px;
  background: #e6f0fb;
}

.collection-banner {
  border: 1px solid rgba(84, 125, 173, 0.18);
}

.collection-banner:focus-visible {
  outline: 3px solid #1661ff;
  outline-offset: 3px;
}

.banner-viewport {
  width: 100%;
  height: 100%;
  display: flex;
  overflow-x: auto;
  overflow-y: hidden;
  scroll-snap-type: x mandatory;
  overscroll-behavior-x: contain;
  scrollbar-width: none;
  -webkit-overflow-scrolling: touch;
}

.banner-viewport::-webkit-scrollbar {
  display: none;
}

.banner-slide {
  position: relative;
  width: 100%;
  height: 100%;
  flex: 0 0 100%;
  overflow: hidden;
  scroll-snap-align: start;
  scroll-snap-stop: always;
  color: #f5fbff;
}

.banner-slide:focus-visible {
  outline: 3px solid #f5fbff;
  outline-offset: -5px;
}

.banner-slide img {
  width: 100%;
  height: 100%;
  display: block;
  object-fit: cover;
  user-select: none;
  -webkit-user-drag: none;
}

.banner-caption {
  position: absolute;
  right: 24px;
  bottom: 58px;
  left: 24px;
  max-width: min(620px, 46%);
  padding: 18px 20px;
  display: grid;
  gap: 5px;
  border-radius: 16px;
  background: rgba(16, 35, 63, 0.9);
  color: #f5fbff;
}

.banner-caption strong {
  font-size: clamp(20px, 2.4vw, 30px);
  line-height: 1.3;
  text-wrap: balance;
  overflow-wrap: anywhere;
}

.banner-caption > span:not(.banner-action) {
  display: -webkit-box;
  overflow: hidden;
  color: rgba(245, 251, 255, 0.88);
  font-size: 14px;
  line-height: 1.55;
  -webkit-box-orient: vertical;
  -webkit-line-clamp: 2;
}

.banner-action {
  margin-top: 4px;
  color: #f5fbff;
  font-size: 13px;
  font-weight: 700;
}

.banner-arrow {
  position: absolute;
  top: 18px;
  width: 48px;
  height: 48px;
  padding: 0;
  display: grid;
  place-items: center;
  border: 1px solid rgba(245, 251, 255, 0.55);
  border-radius: 14px;
  background: rgba(16, 35, 63, 0.86);
  color: #f5fbff;
  cursor: pointer;
}

.banner-arrow.previous {
  left: 16px;
}

.banner-arrow.next {
  right: 16px;
}

.banner-arrow svg {
  width: 24px;
  height: 24px;
  fill: none;
  stroke: currentColor;
  stroke-width: 2;
  stroke-linecap: round;
  stroke-linejoin: round;
}

.banner-arrow:hover {
  background: #1661ff;
}

.banner-arrow:focus-visible,
.banner-pagination button:focus-visible,
.banner-error button:focus-visible {
  outline: 3px solid #1661ff;
  outline-offset: 2px;
}

.banner-pagination {
  position: absolute;
  bottom: 8px;
  left: 50%;
  display: flex;
  align-items: center;
  transform: translateX(-50%);
}

.banner-pagination button {
  width: 44px;
  height: 44px;
  padding: 0;
  display: grid;
  place-items: center;
  border: 0;
  background: transparent;
  cursor: pointer;
}

.banner-pagination button span {
  width: 24px;
  height: 8px;
  transform: scaleX(0.333);
  border-radius: 999px;
  background: rgba(245, 251, 255, 0.68);
  box-shadow: 0 1px 4px rgba(16, 35, 63, 0.5);
  transition: transform 180ms ease, background-color 180ms ease;
}

.banner-pagination button.active span {
  transform: scaleX(1);
  background: #f5fbff;
}

.banner-count {
  position: absolute;
  right: 18px;
  bottom: 18px;
  padding: 4px 9px;
  border-radius: 999px;
  background: rgba(16, 35, 63, 0.82);
  color: #f5fbff;
  font-size: 12px;
  font-variant-numeric: tabular-nums;
}

.banner-loading {
  display: grid;
  place-items: center;
  color: #5f7694;
  font-size: 14px;
}

.banner-error {
  min-height: 56px;
  margin-bottom: 20px;
  padding: 12px 16px;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
  border: 1px solid rgba(199, 55, 75, 0.35);
  border-radius: 14px;
  background: rgba(199, 55, 75, 0.08);
  color: #10233f;
  font-size: 13px;
}

.banner-error button {
  min-height: 44px;
  border: 0;
  background: transparent;
  color: #1661ff;
  font: inherit;
  font-weight: 700;
  cursor: pointer;
}

@media (max-width: 720px) {
  .collection-banner,
  .banner-loading {
    aspect-ratio: 4 / 3;
    min-height: 260px;
    max-height: 360px;
    border-radius: 18px;
  }

  .banner-caption {
    right: 14px;
    bottom: 42px;
    left: 14px;
    max-width: none;
    padding: 14px 16px;
  }

  .banner-slide {
    background: #10233f;
  }

  .banner-slide img {
    height: 72%;
    object-position: right center;
  }

  .single-slide .banner-caption {
    bottom: 12px;
  }

  .banner-caption strong {
    font-size: 21px;
  }

  .banner-arrow {
    top: 12px;
    width: 44px;
    height: 44px;
  }

  .banner-arrow.previous {
    left: 10px;
  }

  .banner-arrow.next {
    right: 10px;
  }

  .banner-count {
    right: 12px;
    bottom: 12px;
  }
}

@media (prefers-reduced-motion: reduce) {
  .banner-viewport {
    scroll-behavior: auto;
  }

  .banner-pagination button span {
    transition: none;
  }
}
</style>
