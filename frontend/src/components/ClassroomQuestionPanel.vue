<template>
  <div class="classroom-question-panel" :class="{ compact }">
    <section v-if="canPost" class="realtime-section">
      <div class="section-heading">
        <strong>提出问题</strong>
      </div>
      <div class="quick-questions">
        <el-button
          v-for="text in quickQuestions"
          :key="text"
          size="small"
          round
          :disabled="sending || cooldownRemaining > 0"
          @click="sendQuickQuestion(text)"
        >{{ text }}</el-button>
      </div>
      <div class="question-composer">
        <el-input
          ref="questionInput"
          v-model="draft"
          maxlength="40"
          show-word-limit
          placeholder="输入你的问题（40 字以内）"
          @keyup.enter="sendQuestion"
        />
        <el-button
          type="primary"
          :loading="sending"
          :disabled="!draft.trim() || cooldownRemaining > 0"
          @click="sendQuestion"
        >{{ cooldownRemaining > 0 ? `${cooldownRemaining}s` : '发送' }}</el-button>
      </div>
      <div v-if="realtimeMessages.length" class="realtime-list">
        <div v-for="item in realtimeMessages" :key="item.id" class="realtime-message">
          <div class="message-content"><strong>{{ item.display_name }}：</strong>{{ item.content }}</div>
          <el-button
            size="small"
            text
            type="primary"
            :loading="Boolean(upvoting[item.id])"
            @click="toggleUpvote(item)"
          >我也有这个疑问 ({{ item.upvote_count }})</el-button>
        </div>
      </div>
      <el-divider />
    </section>

    <section class="history-section">
      <div class="section-heading history-heading">
        <strong>提问墙</strong>
        <el-button text type="primary" size="small" :loading="loading" @click="reloadHistory">刷新</el-button>
      </div>
      <div class="history-filters">
        <el-radio-group v-model="sort" size="small" @change="resetPage">
          <el-radio-button label="hot">最热</el-radio-button>
          <el-radio-button label="latest">最新</el-radio-button>
        </el-radio-group>
        <el-radio-group v-model="scope" size="small" @change="resetPage">
          <el-radio-button label="class">本班提问</el-radio-button>
          <el-radio-button label="all">{{ isTeacher ? '全部班级' : '全校精选置顶' }}</el-radio-button>
        </el-radio-group>
      </div>
      <el-select
        v-if="isTeacher && scope === 'class' && classes.length > 1"
        v-model="historyClass"
        size="small"
        :teleported="false"
        class="history-class-select"
        @change="resetPage"
      >
        <el-option v-for="name in classes" :key="name" :label="getClassroomClassLabel(name, classes)" :value="name" />
      </el-select>

      <div v-loading="loading" class="history-list">
        <el-alert v-if="historyError" :title="historyError" type="info" :closable="false" />
        <el-empty v-else-if="!historyItems.length && !loading" description="暂无提问" :image-size="64" />
        <article v-for="item in historyItems" v-else :key="item.id" class="history-item">
          <div class="history-meta">
            <span>{{ item.display_name }} · {{ formatTime(item.created_at) }}</span>
            <el-tag v-if="scope === 'all'" size="small" effect="plain">{{ item.class_name }}</el-tag>
            <el-tag v-if="item.is_pinned" size="small" type="warning">常见疑问</el-tag>
          </div>
          <p class="history-content">{{ item.content }}</p>
          <div v-if="item.teacher_reply" class="teacher-reply">
            <strong>教师解答</strong>
            <span>{{ item.teacher_reply }}</span>
          </div>
          <div class="history-actions">
            <el-button
              size="small"
              :type="item.upvoted_by_me ? 'primary' : 'default'"
              :loading="Boolean(upvoting[item.id])"
              @click="toggleUpvote(item)"
            >{{ item.upvoted_by_me ? '已标记同问' : '我也有这个疑问' }} ({{ item.upvote_count }})</el-button>
            <template v-if="isTeacher">
              <el-button size="small" text :type="item.is_pinned ? 'warning' : 'primary'" @click="togglePinned(item)">
                {{ item.is_pinned ? '取消置顶' : '置顶' }}
              </el-button>
              <el-popconfirm title="确认删除这条提问？" width="200" :teleported="false" @confirm="removeMessage(item)">
                <template #reference>
                  <el-button size="small" text type="danger">删除</el-button>
                </template>
              </el-popconfirm>
            </template>
          </div>
          <div v-if="isTeacher" class="reply-editor">
            <el-input
              v-model="replyDrafts[item.id]"
              size="small"
              maxlength="500"
              placeholder="填写或修改简短解答"
              @keyup.enter="saveReply(item)"
            />
            <el-button size="small" :loading="Boolean(moderating[item.id])" @click="saveReply(item)">保存解答</el-button>
          </div>
        </article>
      </div>
      <el-pagination
        v-if="historyTotal > pageSize"
        v-model:current-page="page"
        :page-size="pageSize"
        :total="historyTotal"
        :pager-count="5"
        layout="prev, pager, next"
        small
        class="history-pagination"
        @current-change="loadHistory"
      />
    </section>
  </div>
</template>

<script setup>
import { computed, nextTick, onBeforeUnmount, ref, watch } from 'vue'
import axios from 'axios'
import { ElMessage } from 'element-plus'
import { getClassroomClassLabel } from '../utils/classroomClassLabel'

const props = defineProps({
  animationId: { type: Number, required: true },
  className: { type: String, default: '' },
  classes: { type: Array, default: () => [] },
  isTeacher: { type: Boolean, default: false },
  compact: { type: Boolean, default: false },
  canPost: { type: Boolean, default: false },
  realtimeMessages: { type: Array, default: () => [] },
  refreshKey: { type: Number, default: 0 }
})

const emit = defineEmits(['sent', 'upvote-changed', 'message-moderated'])

const quickQuestions = ['这里没看懂', '实验现象不明显', '数据算不对', '求讲这道题']
const draft = ref('')
const questionInput = ref(null)
const sending = ref(false)
const cooldownRemaining = ref(0)
let cooldownTimer = null

const scope = ref('class')
const sort = ref(props.isTeacher ? 'hot' : 'latest')
const historyClass = ref(props.className)
const page = ref(1)
const pageSize = computed(() => props.compact ? 5 : 10)
const historyItems = ref([])
const historyTotal = ref(0)
const loading = ref(false)
const historyError = ref('')
const upvoting = ref({})
const moderating = ref({})
const replyDrafts = ref({})
let historyRequest = 0

const loadHistory = async () => {
  const requestId = ++historyRequest
  if (!props.animationId || (scope.value === 'class' && !historyClass.value)) {
    historyItems.value = []
    historyTotal.value = 0
    loading.value = false
    historyError.value = ''
    return
  }
  loading.value = true
  historyError.value = ''
  try {
    const response = await axios.get(`/api/classroom/animations/${props.animationId}/danmaku/history`, {
      params: {
        scope: scope.value,
        sort: sort.value,
        class_name: scope.value === 'class' ? (historyClass.value || undefined) : undefined,
        page: page.value,
        page_size: pageSize.value
      }
    })
    if (requestId !== historyRequest) return
    historyItems.value = response.data.items
    historyTotal.value = response.data.total
    const drafts = { ...replyDrafts.value }
    for (const item of response.data.items) drafts[item.id] = item.teacher_reply || ''
    replyDrafts.value = drafts
  } catch (error) {
    if (requestId !== historyRequest) return
    historyItems.value = []
    historyTotal.value = 0
    historyError.value = error.response?.data?.detail || '历史提问加载失败'
  } finally {
    if (requestId === historyRequest) loading.value = false
  }
}

const resetPage = () => {
  page.value = 1
  loadHistory()
}

const reloadHistory = () => loadHistory()

watch(
  () => [props.animationId, props.className, props.isTeacher],
  () => {
    historyClass.value = props.className
    page.value = 1
    loadHistory()
  },
  { immediate: true }
)
watch(() => props.refreshKey, loadHistory)

const startCooldown = () => {
  if (props.isTeacher) return
  cooldownRemaining.value = 15
  if (cooldownTimer) clearInterval(cooldownTimer)
  cooldownTimer = setInterval(() => {
    cooldownRemaining.value = Math.max(0, cooldownRemaining.value - 1)
    if (!cooldownRemaining.value && cooldownTimer) {
      clearInterval(cooldownTimer)
      cooldownTimer = null
    }
  }, 1000)
}

const sendQuestion = async () => {
  const content = draft.value.trim()
  if (!props.canPost || !content || sending.value || cooldownRemaining.value > 0) return
  sending.value = true
  try {
    const response = await axios.post(`/api/classroom/animations/${props.animationId}/danmaku/messages`, {
      class_name: props.className,
      content
    })
    draft.value = ''
    questionInput.value?.blur()
    nextTick(() => questionInput.value?.blur())
    startCooldown()
    scope.value = 'class'
    historyClass.value = props.className
    sort.value = 'latest'
    page.value = 1
    emit('sent', response.data)
  } catch (error) {
    ElMessage.warning(error.response?.data?.detail || '提问发送失败，请稍后重试')
  } finally {
    sending.value = false
  }
}

const sendQuickQuestion = text => {
  draft.value = text
  sendQuestion()
}

const toggleUpvote = async item => {
  if (upvoting.value[item.id]) return
  upvoting.value = { ...upvoting.value, [item.id]: true }
  try {
    const response = await axios.post(
      `/api/classroom/animations/${props.animationId}/danmaku/messages/${item.id}/upvote`
    )
    const change = {
      id: item.id,
      upvoted_by_me: response.data.upvoted,
      upvote_count: response.data.upvote_count
    }
    Object.assign(item, change)
    emit('upvote-changed', change)
  } catch (error) {
    ElMessage.warning(error.response?.data?.detail || '操作失败，请稍后重试')
  } finally {
    const next = { ...upvoting.value }
    delete next[item.id]
    upvoting.value = next
  }
}

const patchMessage = async (item, payload) => {
  moderating.value = { ...moderating.value, [item.id]: true }
  try {
    const response = await axios.patch(
      `/api/classroom/animations/${props.animationId}/danmaku/messages/${item.id}`,
      payload
    )
    Object.assign(item, response.data)
    emit('message-moderated', response.data)
    return response.data
  } catch (error) {
    ElMessage.warning(error.response?.data?.detail || '保存失败')
    return null
  } finally {
    const next = { ...moderating.value }
    delete next[item.id]
    moderating.value = next
  }
}

const togglePinned = async item => {
  const updated = await patchMessage(item, { is_pinned: !item.is_pinned })
  if (updated) loadHistory()
}

const removeMessage = async item => {
  const updated = await patchMessage(item, { is_deleted: true })
  if (!updated) return
  historyItems.value = historyItems.value.filter(message => message.id !== item.id)
  historyTotal.value = Math.max(0, historyTotal.value - 1)
}

const saveReply = async item => {
  const updated = await patchMessage(item, { teacher_reply: replyDrafts.value[item.id] || '' })
  if (updated) ElMessage.success('教师解答已保存')
}

const formatTime = value => {
  if (!value) return ''
  const date = new Date(value)
  return Number.isNaN(date.getTime()) ? '' : date.toLocaleString('zh-CN', { hour12: false })
}

onBeforeUnmount(() => {
  historyRequest++
  if (cooldownTimer) clearInterval(cooldownTimer)
})
</script>

<style scoped>
.classroom-question-panel {
  color: #303133;
}

.section-heading {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  margin-bottom: 12px;
}

.quick-questions {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
  margin-bottom: 10px;
}

.quick-questions .el-button {
  margin: 0;
}

.question-composer,
.reply-editor {
  display: flex;
  align-items: flex-start;
  gap: 8px;
}

.question-composer .el-button,
.reply-editor .el-button {
  flex-shrink: 0;
}

.realtime-list {
  max-height: 210px;
  margin-top: 12px;
  overflow-y: auto;
}

.realtime-message {
  padding: 8px 0;
  border-bottom: 1px solid #ebeef5;
}

.message-content {
  font-size: 14px;
  line-height: 1.55;
  overflow-wrap: anywhere;
}

.history-filters {
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  gap: 8px;
  margin-bottom: 10px;
}

.history-class-select {
  width: 100%;
  margin-bottom: 10px;
}

.history-list {
  min-height: 90px;
}

.history-item {
  padding: 12px 0;
  border-bottom: 1px solid #ebeef5;
}

.history-meta {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 6px;
  color: #909399;
  font-size: 12px;
}

.history-content {
  margin: 8px 0;
  font-size: 14px;
  line-height: 1.55;
  overflow-wrap: anywhere;
}

.teacher-reply {
  display: flex;
  flex-direction: column;
  gap: 3px;
  margin: 8px 0;
  padding: 8px 10px;
  border-left: 3px solid #67c23a;
  background: #f0f9eb;
  color: #52664a;
  font-size: 13px;
  line-height: 1.5;
}

.history-actions {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 4px;
}

.history-actions .el-button {
  margin-left: 0;
}

.reply-editor {
  margin-top: 8px;
}

.history-pagination {
  justify-content: center;
  margin-top: 12px;
}

.compact .history-actions .el-button {
  padding-left: 8px;
  padding-right: 8px;
}

:deep(.el-divider) {
  margin: 16px 0;
}

:deep(.el-empty) {
  padding: 12px 0;
}
</style>
