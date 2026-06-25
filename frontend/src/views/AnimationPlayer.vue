<template>
  <el-container :class="{ 'presentation-page': isPresentationMode }">
    <el-header v-if="!isPresentationMode">
      <div class="page-header-bar">
        <div class="page-header-copy" style="display: flex; align-items: center">
          <el-button @click="$router.back()" icon="ArrowLeft" circle />
          <h2 style="margin-left: 20px">{{ animation?.title }}</h2>
        </div>
        <div class="page-header-actions">
          <el-button @click="togglePresentationMode">
            {{ isPresentationMode ? '退出沉浸模式' : '沉浸播放' }}
          </el-button>
          <el-button v-if="!isFavorited" @click="addToFavorites" type="primary">收藏</el-button>
          <el-button v-else @click="removeFromFavorites" type="danger">取消收藏</el-button>
        </div>
      </div>
    </el-header>
    
    <el-main :class="{ 'presentation-main': isPresentationMode }">
      <div ref="playerContainer" class="player-shell" :class="{ presentation: isPresentationMode }">
      <div
        v-if="isPresentationMode"
        class="fullscreen-hotzone"
        @click="showFullscreenControls"
      ></div>
      <el-button
        v-if="isPresentationMode"
        class="floating-exit-button"
        :class="{ collapsed: !fullscreenControlsVisible }"
        type="danger"
        @click="togglePresentationMode"
      >
        退出沉浸模式
      </el-button>
      <el-row :gutter="20">
        <el-col :xs="24" :sm="24" :lg="18">
          <el-card class="player-card" :body-style="{ padding: isPresentationMode ? '0' : '20px' }">
            <iframe
              ref="animationFrame"
              :src="animationUrl"
              class="player-frame"
              @load="onFrameLoad"
            ></iframe>
          </el-card>
        </el-col>
        
        <el-col v-if="!isPresentationMode" :xs="24" :sm="24" :lg="6">
          <el-card style="margin-bottom: 20px">
            <template #header>
              <span>动画信息</span>
            </template>
            <p><strong>描述：</strong>{{ animation?.description || '暂无描述' }}</p>
            <p v-if="animation?.author"><strong>作者：</strong>{{ animation.author }}</p>
            <p v-if="animation?.textbook_path"><strong>所属章节：</strong>{{ animation.textbook_path }}</p>
            <p><strong>观看次数：</strong>{{ animation?.view_count }}</p>
            <p><strong>评分：</strong>{{ animation?.avg_rating || '暂无评分' }}</p>
          </el-card>
          
          <el-card>
            <template #header>
              <span>评分与评论</span>
            </template>
            <el-rate v-model="ratingScore" :max="5" show-score />
            <el-input
              v-model="ratingComment"
              type="textarea"
              :rows="3"
              placeholder="写下你的评论..."
              style="margin-top: 10px"
            />
            <el-button type="primary" @click="submitRating" style="margin-top: 10px; width: 100%">
              提交评分
            </el-button>
          </el-card>
        </el-col>
      </el-row>
      </div>
    </el-main>
  </el-container>
</template>

<script setup>
import { computed, ref, onMounted, onBeforeUnmount, watch } from 'vue'
import { useRoute } from 'vue-router'
import axios from 'axios'
import { ElMessage } from 'element-plus'
import { resolveApiBase } from '../utils/apiBase'

const route = useRoute()
const animation = ref(null)
const animationUrl = ref('')
const isFavorited = ref(false)
const ratingScore = ref(5)
const ratingComment = ref('')
const animationFrame = ref(null)
const playerContainer = ref(null)
const startTime = ref(0)
const interactionCount = ref(0)
const viewHistoryId = ref(null)
const viewRecorded = ref(false)
const isFullscreen = ref(false)
const immersiveMode = ref(false)
const fullscreenControlsVisible = ref(true)
let recordViewTimer = null
let fullscreenControlsTimer = null

const isPresentationMode = computed(() => isFullscreen.value || immersiveMode.value)

const loadAnimation = async () => {
  try {
    const response = await axios.get(`/api/animations/${route.params.id}`)
    animation.value = response.data
    animationUrl.value = animation.value.file_url || `/api/animations/${route.params.id}/file`
    
    const favResponse = await axios.get('/api/favorites/')
    isFavorited.value = favResponse.data.some(fav => fav.animation_id === parseInt(route.params.id))
  } catch (error) {
    console.error('加载动画失败:', error)
    ElMessage.error('加载动画失败')
  }
}

const addToFavorites = async () => {
  try {
    await axios.post(`/api/favorites/${route.params.id}`)
    isFavorited.value = true
    ElMessage.success('收藏成功')
  } catch (error) {
    console.error('收藏失败:', error)
    ElMessage.error('收藏失败')
  }
}

const removeFromFavorites = async () => {
  try {
    await axios.delete(`/api/favorites/${route.params.id}`)
    isFavorited.value = false
    ElMessage.success('已取消收藏')
  } catch (error) {
    console.error('取消收藏失败:', error)
    ElMessage.error('取消收藏失败')
  }
}

const submitRating = async () => {
  try {
    await axios.post(`/api/ratings/${route.params.id}`, {
      animation_id: parseInt(route.params.id),
      score: ratingScore.value,
      comment: ratingComment.value
    })
    ElMessage.success('评分成功')
    ratingComment.value = ''
  } catch (error) {
    console.error('评分失败:', error)
    ElMessage.error('评分失败')
  }
}

const onFrameLoad = () => {
  startTime.value = Date.now()
  if (recordViewTimer) {
    clearTimeout(recordViewTimer)
  }
  recordViewTimer = window.setTimeout(() => {
    ensureViewRecorded()
  }, 3000)

  window.addEventListener('message', handleInteraction)
}

const handleInteraction = (event) => {
  if (event.data.type === 'ANIMATION_INTERACTION') {
    interactionCount.value++
    
    axios.post(`/api/animations/${route.params.id}/interactions`, {
      interaction_type: event.data.interactionType,
      interaction_data: JSON.stringify(event.data.data)
    }).catch(error => {
      console.error('记录交互失败:', error)
    })
  }
}

const getViewPayload = () => {
  const duration = Math.floor((Date.now() - startTime.value) / 1000)
  return {
    animation_id: parseInt(route.params.id),
    view_duration: Math.max(duration, 0),
    interaction_count: interactionCount.value
  }
}

const ensureViewRecorded = async () => {
  if (viewRecorded.value || !startTime.value) return

  try {
    const response = await axios.post(`/api/animations/${route.params.id}/view`, getViewPayload())
    viewHistoryId.value = response.data.id
    viewRecorded.value = true
    if (animation.value) {
      animation.value.view_count += 1
    }
  } catch (error) {
    console.error('记录观看失败:', error)
  }
}

const flushViewRecord = async (useKeepalive = false) => {
  if (!viewRecorded.value || !viewHistoryId.value) return

  const payload = getViewPayload()
  const apiBase = resolveApiBase()
  const url = `${apiBase}/api/animations/${route.params.id}/view/${viewHistoryId.value}`

  try {
    if (useKeepalive) {
      const token = localStorage.getItem('token')
      await fetch(url, {
        method: 'PATCH',
        keepalive: true,
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { Authorization: `Bearer ${token}` } : {})
        },
        body: JSON.stringify(payload)
      })
      return
    }

    await axios.patch(url, payload)
  } catch (error) {
    console.error('更新观看记录失败:', error)
  }
}

const handlePageHide = () => {
  flushViewRecord(true)
}

const handleFullscreenChange = () => {
  isFullscreen.value = document.fullscreenElement === playerContainer.value
  if (isFullscreen.value) {
    immersiveMode.value = false
    showFullscreenControls()
  } else {
    fullscreenControlsVisible.value = false
    if (fullscreenControlsTimer) {
      clearTimeout(fullscreenControlsTimer)
      fullscreenControlsTimer = null
    }
  }
}

const supportsNativeFullscreen = () =>
  !!document.fullscreenEnabled && typeof playerContainer.value?.requestFullscreen === 'function'

const shouldUseImmersiveMode = () => {
  if (typeof window === 'undefined') return false
  const coarsePointer = window.matchMedia?.('(pointer: coarse)')?.matches
  return coarsePointer || window.innerWidth <= 1180
}

const togglePresentationMode = async () => {
  try {
    if (isFullscreen.value) {
      await document.exitFullscreen()
      return
    }

    if (immersiveMode.value) {
      immersiveMode.value = false
      return
    }

    if (supportsNativeFullscreen() && !shouldUseImmersiveMode()) {
      await playerContainer.value?.requestFullscreen()
    } else {
      immersiveMode.value = true
      showFullscreenControls()
    }
  } catch (error) {
    console.error('切换沉浸模式失败:', error)
    immersiveMode.value = true
    showFullscreenControls()
  }
}

const showFullscreenControls = () => {
  fullscreenControlsVisible.value = true
  if (fullscreenControlsTimer) {
    clearTimeout(fullscreenControlsTimer)
  }
  fullscreenControlsTimer = window.setTimeout(() => {
    fullscreenControlsVisible.value = false
  }, 2500)
}

watch(isPresentationMode, (active) => {
  document.body.style.overflow = active ? 'hidden' : ''
  document.documentElement.style.overflow = active ? 'hidden' : ''
  if (active) {
    window.scrollTo({ top: 0, behavior: 'auto' })
  }
})

onMounted(() => {
  loadAnimation()
  window.addEventListener('pagehide', handlePageHide)
  window.addEventListener('beforeunload', handlePageHide)
  document.addEventListener('fullscreenchange', handleFullscreenChange)
  window.addEventListener('touchstart', showFullscreenControls, { passive: true })
  window.addEventListener('mousemove', showFullscreenControls)
})

onBeforeUnmount(() => {
  if (recordViewTimer) {
    clearTimeout(recordViewTimer)
    recordViewTimer = null
  }
  window.removeEventListener('message', handleInteraction)
  window.removeEventListener('pagehide', handlePageHide)
  window.removeEventListener('beforeunload', handlePageHide)
  document.removeEventListener('fullscreenchange', handleFullscreenChange)
  window.removeEventListener('touchstart', showFullscreenControls)
  window.removeEventListener('mousemove', showFullscreenControls)
  if (fullscreenControlsTimer) {
    clearTimeout(fullscreenControlsTimer)
  }
  document.body.style.overflow = ''
  document.documentElement.style.overflow = ''
  flushViewRecord()
})
</script>

<style scoped>
.player-shell {
  width: 100%;
}

.presentation-main {
  padding: 0 !important;
}

.player-shell.presentation {
  position: relative;
  width: 100vw;
  height: 100dvh;
  background: #000;
  padding: 0;
}

.player-shell.presentation :deep(.el-row) {
  margin-left: 0 !important;
  margin-right: 0 !important;
  height: 100%;
}

.player-shell.presentation :deep(.el-col) {
  padding-left: 0 !important;
  padding-right: 0 !important;
  height: 100%;
}

.player-card {
  height: 100%;
}

.player-frame {
  width: 100%;
  height: 76vh;
  min-height: 360px;
  border: none;
  background: #fff;
}

.player-shell.presentation .player-frame {
  height: 100dvh;
  min-height: 100dvh;
}

.fullscreen-hotzone {
  position: fixed;
  top: 0;
  right: 0;
  width: 24px;
  height: 100vh;
  z-index: 1999;
}

.floating-exit-button {
  position: fixed;
  top: 50%;
  right: 0;
  transform: translate(18px, -50%);
  z-index: 2000;
  opacity: 0.78;
  transition: transform 0.2s ease, opacity 0.2s ease;
}

.floating-exit-button.collapsed {
  transform: translate(62px, -50%);
  opacity: 0.28;
}

@media (max-width: 1180px) {
  .player-frame {
    height: 82vh;
    min-height: 480px;
  }
}

@media (max-width: 768px) {
  .player-frame {
    height: 72vh;
    min-height: 360px;
  }
}
</style>
