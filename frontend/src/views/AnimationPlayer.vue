<template>
  <el-container :class="{ 'presentation-page': isPresentationMode }">
    <el-header v-if="!isPresentationMode">
      <div class="page-header-bar">
        <div class="toolbox-heading">
          <ToolboxLink />
          <div class="page-header-copy" style="display: flex; align-items: center; gap: 12px; flex-wrap: wrap">
            <el-button @click="$router.back()" icon="ArrowLeft" circle />
            <h2 style="margin: 0">{{ animation?.title }}</h2>
            <el-tag v-if="animation?.may_lag" type="warning" effect="light">可能卡顿</el-tag>
          </div>
        </div>
        <div class="page-header-actions">
          <template v-if="isTeacher">
            <el-select
              v-model="selectedClass"
              size="small"
              placeholder="选择互动班级"
              aria-label="互动班级"
              class="classroom-class-select"
              @change="restartDanmakuPolling"
            >
              <template #prefix>互动班级</template>
              <el-option v-for="name in availableClasses" :key="name" :label="getClassroomClassLabel(name, availableClasses)" :value="name" />
            </el-select>
            <el-button
              size="small"
              :type="realtimeOpen ? 'danger' : 'primary'"
              :loading="sessionActionLoading"
              :disabled="!selectedClass"
              @click="toggleDanmakuSession"
            >{{ realtimeOpen ? `弹幕开启中 ${remainingLabel} · 关闭` : '开启本班弹幕 (40min)' }}</el-button>
          </template>
          <el-button v-if="realtimeOpen" size="small" :aria-pressed="danmakuVisible" @click="danmakuVisible = !danmakuVisible">
            弹幕{{ danmakuVisible ? '：开' : '：关' }}
          </el-button>
          <el-button v-if="realtimeOpen" size="small" @click="questionDrawerVisible = true">
            课堂提问<template v-if="!isTeacher"> · {{ remainingLabel }}</template>
          </el-button>
          <el-button v-if="isTeacher && animation?.has_quiz" size="small" @click="quizStatsDrawerVisible = true">
            作答统计
          </el-button>
          <el-button @click="togglePresentationMode">
            {{ isPresentationMode ? '退出沉浸模式' : '沉浸播放' }}
          </el-button>
          <el-button v-if="!isFavorited" @click="addToFavorites" type="primary">收藏</el-button>
          <el-button v-else @click="removeFromFavorites" type="danger">取消收藏</el-button>
        </div>
      </div>
    </el-header>
    
    <el-main :class="{ 'presentation-main': isPresentationMode }">
      <div ref="playerContainer" class="player-shell" :class="{ presentation: isPresentationMode }" :style="presentationStyle">
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
      <div
        v-if="isPresentationMode && fullscreenControlsVisible"
        class="presentation-classroom-controls"
      >
        <template v-if="isTeacher">
          <el-select
            v-model="selectedClass"
            size="small"
            placeholder="选择互动班级"
            aria-label="互动班级"
            :teleported="false"
            class="classroom-class-select"
            @visible-change="handlePresentationClassMenu"
            @change="restartDanmakuPolling"
          >
            <template #prefix>互动班级</template>
            <el-option v-for="name in availableClasses" :key="name" :label="getClassroomClassLabel(name, availableClasses)" :value="name" />
          </el-select>
          <el-button
            size="small"
            :type="realtimeOpen ? 'danger' : 'primary'"
            :loading="sessionActionLoading"
            :disabled="!selectedClass"
            @click="toggleDanmakuSession"
          >{{ realtimeOpen ? `${remainingLabel} · 关闭弹幕` : '开启弹幕 (40min)' }}</el-button>
        </template>
        <el-button v-if="realtimeOpen" size="small" :aria-pressed="danmakuVisible" @click="danmakuVisible = !danmakuVisible">
          弹幕{{ danmakuVisible ? '：开' : '：关' }}
        </el-button>
        <el-button v-if="realtimeOpen" size="small" type="primary" @click="questionDrawerVisible = true">
          课堂提问
        </el-button>
        <el-button v-if="isTeacher && animation?.has_quiz" size="small" @click="quizStatsDrawerVisible = true">
          作答统计
        </el-button>
        <el-button size="small" @click="questionDrawerVisible = true">历史提问 ({{ historyTotal }})</el-button>
      </div>
      <ClassroomDanmakuOverlay
        v-if="realtimeOpen"
        :key="danmakuState.session_id"
        :enabled="danmakuVisible"
        :messages="danmakuMessages"
      />
      <el-drawer
        v-model="questionDrawerVisible"
        title="课堂提问与历史提问墙"
        size="420px"
        :append-to-body="false"
        class="classroom-drawer"
      >
        <ClassroomQuestionPanel
          :animation-id="animationId"
          :class-name="selectedClass"
          :classes="availableClasses"
          :is-teacher="isTeacher"
          :realtime-open="realtimeOpen"
          :realtime-messages="danmakuMessages"
          :remaining-seconds="remainingSeconds"
          :refresh-key="classroomRefreshKey"
          @sent="handleRealtimeSent"
          @upvote-changed="handleUpvoteChanged"
          @message-moderated="handleMessageModerated"
          @total-change="historyTotal = $event"
        />
      </el-drawer>
      <el-drawer
        v-model="quizStatsDrawerVisible"
        title="课堂数据 · 作答统计"
        size="760px"
        :append-to-body="false"
        class="quiz-stats-drawer"
      >
        <CoursewareQuizStatsPanel
          v-if="quizStatsDrawerVisible"
          :animation-id="animationId"
          :class-name="selectedClass"
          :class-label="getClassroomClassLabel(selectedClass, availableClasses)"
        />
      </el-drawer>
      <el-row :gutter="20">
        <el-col :xs="24" :sm="24" :lg="isPresentationMode ? 24 : 18">
          <el-card class="player-card" :body-style="{ padding: isPresentationMode ? '0' : '20px' }">
            <iframe
              ref="animationFrame"
              :src="animationUrl"
              class="player-frame"
              allow="fullscreen"
              allowfullscreen
              @load="onFrameLoad"
            ></iframe>
          </el-card>
        </el-col>
        
        <el-col v-if="!isPresentationMode" :xs="24" :sm="24" :lg="6">
          <el-card style="margin-bottom: 20px">
            <template #header>
              <span>动画信息</span>
            </template>
            <el-alert
              v-if="animation?.may_lag"
              type="warning"
              :closable="false"
              show-icon
              style="margin-bottom: 14px"
              title="平板可能卡顿"
              :description="animation.lag_reason || '该课件体积较大或交互复杂，在低配平板上可能出现卡顿。'"
            />
            <p><strong>描述：</strong>{{ animation?.description || '暂无描述' }}</p>
            <p v-if="animation?.author"><strong>作者：</strong>{{ animation.author }}</p>
            <p v-if="animation?.textbook_path"><strong>所属章节：</strong>{{ animation.textbook_path }}</p>
            <p><strong>观看次数：</strong>{{ animation?.view_count }}</p>
            <p><strong>评分：</strong>{{ animation?.avg_rating || '暂无评分' }}</p>
          </el-card>

          <el-card class="question-wall-card">
            <template #header>
              <span>课件历史弹幕区 / 提问墙</span>
            </template>
            <ClassroomQuestionPanel
              compact
              :animation-id="animationId"
              :class-name="selectedClass"
              :classes="availableClasses"
              :is-teacher="isTeacher"
              :realtime-open="false"
              :refresh-key="classroomRefreshKey"
              @upvote-changed="handleUpvoteChanged"
              @message-moderated="handleMessageModerated"
              @total-change="historyTotal = $event"
            />
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
import { resolveApiBase, resolveAssetUrl } from '../utils/apiBase'
import { useUserStore } from '../stores/user'
import { getClassroomClassLabel } from '../utils/classroomClassLabel'
import { hasIsolatedCoursewareMarker, readCoursewareMessage } from '../utils/coursewareBridge'
import ClassroomDanmakuOverlay from '../components/ClassroomDanmakuOverlay.vue'
import ClassroomQuestionPanel from '../components/ClassroomQuestionPanel.vue'
import CoursewareQuizStatsPanel from '../components/CoursewareQuizStatsPanel.vue'

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
const presentationClassMenuOpen = ref(false)
let recordViewTimer = null
let viewRecordPromise = null
let quizReportQueue = Promise.resolve()
let fullscreenControlsTimer = null

const isPresentationMode = computed(() => isFullscreen.value || immersiveMode.value)
const presentationHeight = ref(0)
const presentationStyle = computed(() => isPresentationMode.value && presentationHeight.value > 0
  ? { '--player-viewport-height': `${presentationHeight.value}px` }
  : undefined)
let viewportFrame = null

const updatePresentationHeight = () => {
  if (!isPresentationMode.value) return
  // WebView 83 does not support dvh. Measure the visible viewport on every resize.
  presentationHeight.value = Math.round(
    window.visualViewport?.height || window.innerHeight || document.documentElement.clientHeight
  )
}

const schedulePresentationResize = () => {
  if (viewportFrame !== null) cancelAnimationFrame(viewportFrame)
  viewportFrame = requestAnimationFrame(() => {
    viewportFrame = null
    updatePresentationHeight()
  })
}
const isIsolatedCourseware = computed(() =>
  hasIsolatedCoursewareMarker(animation.value?.keywords)
)

const loadAnimation = async () => {
  try {
    const response = await axios.get(`/api/animations/${route.params.id}`)
    animation.value = response.data
    animationUrl.value = resolveAssetUrl(animation.value.file_url || `/api/animations/${route.params.id}/file`)
    
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
  // 课件可能在 load 之前就发出了 HELLO，这里主动再推送一次身份上下文。
  sendCoursewareContext()
}

const userStore = useUserStore()
const currentUser = computed(() => userStore.user)
const isTeacher = computed(() => ['teacher', 'admin'].includes(currentUser.value?.role))
const animationId = computed(() => parseInt(route.params.id))
const availableClasses = ref([])
const selectedClass = ref('')
const danmakuState = ref({ is_open: false, session_id: null })
const danmakuMessages = ref([])
const danmakuVisible = ref(true)
const remainingSeconds = ref(0)
const historyTotal = ref(0)
const classroomRefreshKey = ref(0)
const questionDrawerVisible = ref(false)
const quizStatsDrawerVisible = ref(false)
const sessionActionLoading = ref(false)
const realtimeOpen = computed(() => danmakuState.value.is_open && remainingSeconds.value > 0)
const remainingLabel = computed(() => {
  const seconds = Math.max(0, remainingSeconds.value)
  return `${String(Math.floor(seconds / 60)).padStart(2, '0')}:${String(seconds % 60).padStart(2, '0')}`
})

let danmakuPollTimer = null
let danmakuCountdownTimer = null
let danmakuAfterId = 0
let danmakuRequestActive = false
let classroomRevision = 0
let initializedUserId = null

const clearDanmakuTimers = () => {
  if (danmakuPollTimer) {
    clearTimeout(danmakuPollTimer)
    danmakuPollTimer = null
  }
  if (danmakuCountdownTimer) {
    clearInterval(danmakuCountdownTimer)
    danmakuCountdownTimer = null
  }
}

const scheduleDanmakuPoll = delay => {
  if (danmakuPollTimer) clearTimeout(danmakuPollTimer)
  danmakuPollTimer = null
  if (!selectedClass.value || document.hidden) return
  danmakuPollTimer = window.setTimeout(fetchDanmakuState, delay)
}

const startDanmakuCountdown = () => {
  if (danmakuCountdownTimer) clearInterval(danmakuCountdownTimer)
  danmakuCountdownTimer = null
  if (!realtimeOpen.value || document.hidden) return
  danmakuCountdownTimer = window.setInterval(() => {
    remainingSeconds.value = Math.max(0, remainingSeconds.value - 1)
    if (remainingSeconds.value > 0) return
    danmakuState.value = { is_open: false, session_id: null }
    danmakuMessages.value = []
    danmakuAfterId = 0
    fetchDanmakuState()
  }, 1000)
}

const applyDanmakuState = data => {
  const sessionChanged = danmakuState.value.session_id !== data.session_id
  if (!data.is_open || sessionChanged) {
    danmakuMessages.value = []
    danmakuAfterId = 0
  }
  if (data.is_open) {
    const merged = new Map(danmakuMessages.value.map(message => [message.id, message]))
    for (const message of data.messages || []) {
      merged.set(message.id, message)
      danmakuAfterId = Math.max(danmakuAfterId, message.id)
    }
    const upvotedIds = new Set(data.upvoted_message_ids || [])
    danmakuMessages.value = Array.from(merged.values())
      .map(message => ({ ...message, upvoted_by_me: upvotedIds.has(message.id) }))
      .sort((a, b) => a.id - b.id)
  }
  danmakuState.value = {
    is_open: Boolean(data.is_open),
    session_id: data.is_open ? data.session_id : null
  }
  remainingSeconds.value = data.is_open ? data.remaining_seconds : 0
  startDanmakuCountdown()
}

const fetchDanmakuState = async () => {
  if (!selectedClass.value || document.hidden) return
  if (danmakuRequestActive) {
    scheduleDanmakuPoll(1000)
    return
  }
  if (danmakuPollTimer) {
    clearTimeout(danmakuPollTimer)
    danmakuPollTimer = null
  }
  const revision = classroomRevision
  danmakuRequestActive = true
  try {
    const response = await axios.get(`/api/classroom/animations/${animationId.value}/danmaku/state`, {
      params: { class_name: selectedClass.value, after_id: danmakuAfterId }
    })
    if (revision === classroomRevision) applyDanmakuState(response.data)
  } catch (error) {
    // Background polling stays silent; the next attempt recovers automatically.
  } finally {
    danmakuRequestActive = false
    if (revision === classroomRevision) {
      scheduleDanmakuPoll(realtimeOpen.value ? 3500 : 15000)
    }
  }
}

const restartDanmakuPolling = () => {
  classroomRevision++
  clearDanmakuTimers()
  danmakuState.value = { is_open: false, session_id: null }
  danmakuMessages.value = []
  remainingSeconds.value = 0
  danmakuAfterId = 0
  fetchDanmakuState()
}

const toggleDanmakuSession = async () => {
  if (!selectedClass.value || sessionActionLoading.value) return
  const revision = ++classroomRevision
  sessionActionLoading.value = true
  try {
    const response = await axios.post(`/api/classroom/animations/${animationId.value}/danmaku/session`, {
      class_name: selectedClass.value,
      action: realtimeOpen.value ? 'close' : 'open'
    })
    if (revision === classroomRevision) applyDanmakuState(response.data)
  } catch (error) {
    ElMessage.warning(error.response?.data?.detail || '弹幕会话操作失败')
  } finally {
    sessionActionLoading.value = false
    if (revision === classroomRevision) scheduleDanmakuPoll(realtimeOpen.value ? 3500 : 15000)
  }
}

const handleRealtimeSent = message => {
  // A local send can have a higher ID than unseen messages from classmates.
  if (message.session_id === danmakuState.value.session_id && !danmakuMessages.value.some(item => item.id === message.id)) {
    danmakuMessages.value = [...danmakuMessages.value, message].sort((a, b) => a.id - b.id)
  }
  classroomRefreshKey.value++
}

const handleUpvoteChanged = change => {
  danmakuMessages.value = danmakuMessages.value.map(message =>
    message.id === change.id ? { ...message, ...change } : message
  )
  classroomRefreshKey.value++
}

const handleMessageModerated = message => {
  if (message.is_deleted) {
    danmakuMessages.value = danmakuMessages.value.filter(item => item.id !== message.id)
    classroomRefreshKey.value++
    return
  }
  handleUpvoteChanged(message)
}

const handleClassroomVisibility = () => {
  if (document.hidden) {
    clearDanmakuTimers()
    return
  }
  fetchDanmakuState()
}

const initializeClassroom = async user => {
  if (!user || initializedUserId === user.id) return
  initializedUserId = user.id
  const ownClasses = String(user.class_name || '')
    .split(/[,，、;；\s]+/)
    .map(name => name.trim())
    .filter(Boolean)
  if (!isTeacher.value) {
    availableClasses.value = ownClasses
    selectedClass.value = ownClasses[0] || ''
    restartDanmakuPolling()
    return
  }
  availableClasses.value = ownClasses
  try {
    const response = await axios.get('/api/classroom/classes')
    availableClasses.value = response.data
  } catch (error) {
    ElMessage.warning('班级列表加载失败，已使用当前账号班级')
  }
  selectedClass.value = ownClasses.find(name => availableClasses.value.includes(name)) || availableClasses.value[0] || ''
  restartDanmakuPolling()
}

watch(currentUser, initializeClassroom, { immediate: true })

// 身份桥：同源课件发 EDUSIMU_HELLO，播放器回 EDUSIMU_CONTEXT（含 token，仅回给本页 iframe）。
const sendCoursewareContext = () => {
  // Isolated third-party lessons use a data-only bridge and never receive this context.
  if (isIsolatedCourseware.value) return
  const frameWindow = animationFrame.value?.contentWindow
  const token = localStorage.getItem('token')
  const user = userStore.user
  if (!frameWindow || !token || !user) return
  let frameOrigin = ''
  try {
    frameOrigin = new URL(animationUrl.value, window.location.href).origin
  } catch (error) {
    return
  }
  if (frameOrigin !== window.location.origin) return
  frameWindow.postMessage({
    type: 'EDUSIMU_CONTEXT',
    version: 1,
    animationId: parseInt(route.params.id),
    user: {
      id: user.id,
      name: user.real_name || user.username,
      role: user.role,
      class_name: user.class_name || null,
      grade_level: user.grade_level || null
    },
    token,
    apiBase: resolveApiBase()
  }, window.location.origin)
}

const queueQuizAttempt = message => {
  quizReportQueue = quizReportQueue.then(async () => {
    if (!animation.value?.has_quiz) return
    if (!currentUser.value) await userStore.fetchUser()
    if (currentUser.value?.role !== 'student') return
    if (!startTime.value) startTime.value = Date.now()
    await ensureViewRecorded()
    await axios.post(`/api/classroom/animations/${animationId.value}/quiz-attempts`, {
      version: 1,
      questionId: message.questionId,
      answer: message.answer,
      isCorrect: message.isCorrect,
      score: message.score,
      mistakeTag: message.mistakeTag
    })
  }).catch(error => {
    console.error('记录课件作答失败:', error)
  })
}

const handleInteraction = (event) => {
  const message = readCoursewareMessage(event, animationFrame.value?.contentWindow, window.location.origin, isIsolatedCourseware.value)
  if (!message) return
  if (message.type === 'hello') {
    sendCoursewareContext()
    return
  }
  if (message.type === 'quiz-submit') {
    queueQuizAttempt(message)
    return
  }
  if (message.type === 'interaction') {
    interactionCount.value++
    
    axios.post(`/api/animations/${route.params.id}/interactions`, {
      interaction_type: message.interactionType,
      interaction_data: message.serialized
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

const ensureViewRecorded = () => {
  if (viewRecorded.value || !startTime.value) return Promise.resolve()
  if (viewRecordPromise) return viewRecordPromise

  viewRecordPromise = (async () => {
    try {
      const response = await axios.post(`/api/animations/${route.params.id}/view`, getViewPayload())
      viewHistoryId.value = response.data.id
      viewRecorded.value = true
      if (animation.value) {
        animation.value.view_count += 1
      }
    } catch (error) {
      console.error('记录观看失败:', error)
    } finally {
      viewRecordPromise = null
    }
  })()
  return viewRecordPromise
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
  if (presentationClassMenuOpen.value) return
  fullscreenControlsTimer = window.setTimeout(() => {
    fullscreenControlsVisible.value = false
  }, 2500)
}

const handlePresentationClassMenu = open => {
  presentationClassMenuOpen.value = open
  showFullscreenControls()
}

watch(isPresentationMode, (active) => {
  if (!active) presentationClassMenuOpen.value = false
  document.body.style.overflow = active ? 'hidden' : ''
  document.documentElement.style.overflow = active ? 'hidden' : ''
  if (active) {
    updatePresentationHeight()
    window.scrollTo({ top: 0, behavior: 'auto' })
  }
})

onMounted(() => {
  loadAnimation()
  window.addEventListener('message', handleInteraction)
  window.addEventListener('pagehide', handlePageHide)
  window.addEventListener('beforeunload', handlePageHide)
  document.addEventListener('fullscreenchange', handleFullscreenChange)
  window.addEventListener('resize', schedulePresentationResize)
  window.addEventListener('orientationchange', schedulePresentationResize)
  window.visualViewport?.addEventListener('resize', schedulePresentationResize)
  window.addEventListener('touchstart', showFullscreenControls, { passive: true })
  window.addEventListener('mousemove', showFullscreenControls)
  document.addEventListener('visibilitychange', handleClassroomVisibility)
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
  window.removeEventListener('resize', schedulePresentationResize)
  window.removeEventListener('orientationchange', schedulePresentationResize)
  window.visualViewport?.removeEventListener('resize', schedulePresentationResize)
  if (viewportFrame !== null) cancelAnimationFrame(viewportFrame)
  window.removeEventListener('touchstart', showFullscreenControls)
  window.removeEventListener('mousemove', showFullscreenControls)
  document.removeEventListener('visibilitychange', handleClassroomVisibility)
  clearDanmakuTimers()
  classroomRevision++
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
  position: relative;
  width: 100%;
}

.page-header-actions {
  flex-wrap: wrap;
}

.classroom-class-select {
  width: 220px;
}

.question-wall-card {
  margin-bottom: 20px;
}

.presentation-classroom-controls {
  position: fixed;
  top: 12px;
  right: 24px;
  max-width: calc(100% - 48px);
  z-index: 2010;
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 8px;
  padding: 8px;
  border-radius: 8px;
  background: rgba(20, 35, 55, 0.82);
}

.presentation-classroom-controls .el-button {
  margin-left: 0;
}

:deep(.classroom-drawer),
:deep(.quiz-stats-drawer) {
  max-width: 94vw;
}

.presentation-main {
  padding: 0 !important;
}

.player-shell.presentation {
  position: fixed;
  top: 0;
  left: 0;
  z-index: 2001;
  width: 100%;
  height: 100vh;
  height: 100dvh;
  height: var(--player-viewport-height, 100vh);
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

.player-shell.presentation .player-card {
  border: 0 !important;
  border-radius: 0 !important;
  box-shadow: none !important;
}

.player-shell.presentation :deep(.el-card__body) {
  height: 100%;
  padding: 0;
  box-sizing: border-box;
}

.player-frame {
  width: 100%;
  height: 76vh;
  min-height: 360px;
  border: none;
  background: #fff;
}

.player-shell.presentation .player-frame {
  display: block;
  height: 100%;
  min-height: 0;
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
