<template>
  <div class="quiz-stats-panel">
    <div class="stats-toolbar">
      <div>
        <strong>{{ stats?.class_name || className || '未选择班级' }}</strong>
        <span v-if="stats"> · {{ stats.student_count }} 名学生 · {{ stats.question_count }} 道题</span>
      </div>
      <div>
        <el-button size="small" :loading="loading" @click="loadStats">刷新</el-button>
        <el-button v-if="allowExport" size="small" type="primary" :disabled="!stats || loading" :loading="exporting" @click="exportStats">
          导出班级 CSV
        </el-button>
      </div>
    </div>
    <div class="privacy-setting">
      <el-switch v-model="privacyMode" />
      <span>投屏脱敏模式{{ privacyMode ? '已开启（隐藏答错学生姓名）' : '已关闭' }}</span>
    </div>
    <el-alert v-if="error" :title="error" type="error" :closable="false" />
    <div v-loading="loading" class="stats-content">
      <el-tabs v-model="activeTab">
        <el-tab-pane label="按题讲评" name="questions">
          <el-table v-if="stats" :data="stats.questions" row-key="question_id" size="small">
            <el-table-column type="expand">
              <template #default="{ row }">
                <div class="question-detail">
                  <div v-if="row.expected_answer"><strong>参考答案：</strong>{{ row.expected_answer }}</div>
                  <div>
                    <strong>作答分布</strong>
                    <div v-if="row.answer_distribution.length" class="answer-tags">
                      <el-tag v-for="item in row.answer_distribution" :key="item.answer" effect="plain">
                        {{ item.answer }} · {{ item.count }} 人
                      </el-tag>
                    </div>
                    <span v-else class="muted">暂无作答</span>
                  </div>
                  <div>
                    <strong>高频错误答案 Top 3</strong>
                    <div v-if="row.top_incorrect_answers.length" class="answer-tags">
                      <el-tag v-for="item in row.top_incorrect_answers" :key="item.answer" type="danger" effect="plain">
                        {{ item.answer }} · {{ item.count }} 人
                      </el-tag>
                    </div>
                    <span v-else class="muted">暂无错误答案</span>
                  </div>
                </div>
              </template>
            </el-table-column>
            <el-table-column prop="title" label="题目" min-width="210" show-overflow-tooltip />
            <el-table-column label="提交" width="76" align="center">
              <template #default="{ row }">{{ row.submitted_count }}/{{ stats.student_count }}</template>
            </el-table-column>
            <el-table-column label="首次正确率" width="96" align="center">
              <template #default="{ row }">{{ row.first_correct_rate }}%</template>
            </el-table-column>
            <el-table-column label="最终正确率" width="96" align="center">
              <template #default="{ row }">{{ row.final_correct_rate }}%</template>
            </el-table-column>
          </el-table>
        </el-tab-pane>
        <el-tab-pane label="按学生跟进" name="students">
          <el-table v-if="stats" :data="stats.students" row-key="user_id" size="small">
            <el-table-column type="expand">
              <template #default="{ row }">
                <div class="student-results">
                  <div v-if="!row.question_results.length" class="muted">暂无作答记录</div>
                  <div v-for="result in row.question_results" :key="result.question_id" class="student-result">
                    <strong>{{ result.question_id }}</strong>
                    <el-tag size="small" :type="result.first_is_correct ? 'success' : 'danger'">
                      首答{{ result.first_is_correct ? '正确' : '错误' }}
                    </el-tag>
                    <el-tag size="small" :type="result.is_correct ? 'success' : 'warning'" effect="plain">
                      最终{{ result.is_correct ? '正确' : '错误' }}
                    </el-tag>
                    <span>{{ result.score }}/{{ result.max_score }} 分 · {{ result.attempt_count }} 次提交</span>
                    <span v-if="result.mistake_tag">错因：{{ result.mistake_tag }}</span>
                  </div>
                </div>
              </template>
            </el-table-column>
            <el-table-column label="学生" min-width="110">
              <template #default="{ row }">{{ studentName(row) }}</template>
            </el-table-column>
            <el-table-column label="进度" width="90" align="center">
              <template #default="{ row }">{{ row.completed_count }}/{{ row.question_count }}</template>
            </el-table-column>
            <el-table-column label="状态" width="86" align="center">
              <template #default="{ row }">
                <el-tag size="small" :type="statusType(row.status)">{{ statusLabel(row.status) }}</el-tag>
              </template>
            </el-table-column>
            <el-table-column label="得分" width="82" align="center">
              <template #default="{ row }">{{ row.total_score }}/{{ row.total_max_score }}</template>
            </el-table-column>
            <el-table-column label="最终错题" min-width="110">
              <template #default="{ row }">
                <span v-if="row.wrong_question_ids.length">{{ row.wrong_question_ids.join('、') }}</span>
                <span v-else class="muted">无</span>
              </template>
            </el-table-column>
          </el-table>
        </el-tab-pane>
      </el-tabs>
    </div>
  </div>
</template>

<script setup>
import { ref, watch } from 'vue'
import axios from 'axios'
import { ElMessage } from 'element-plus'

const props = defineProps({
  animationId: { type: Number, required: true },
  className: { type: String, default: '' },
  allowExport: { type: Boolean, default: false }
})

const activeTab = ref('questions')
const privacyMode = ref(true)
const stats = ref(null)
const loading = ref(false)
const exporting = ref(false)
const error = ref('')
let requestId = 0

const loadStats = async () => {
  const currentRequest = ++requestId
  stats.value = null
  if (!props.animationId || !props.className) {
    error.value = '请先选择班级'
    loading.value = false
    return
  }
  loading.value = true
  error.value = ''
  try {
    const response = await axios.get(`/api/classroom/animations/${props.animationId}/quiz-stats`, {
      params: { class_name: props.className }
    })
    if (currentRequest === requestId) stats.value = response.data
  } catch (requestError) {
    if (currentRequest === requestId) {
      stats.value = null
      error.value = requestError.response?.data?.detail || '作答统计加载失败'
    }
  } finally {
    if (currentRequest === requestId) loading.value = false
  }
}

const exportStats = async () => {
  if (exporting.value || stats.value?.class_name !== props.className) return
  const { animationId, className } = props
  exporting.value = true
  try {
    const response = await axios.get('/api/classroom/animations/' + animationId + '/quiz-stats.csv', {
      params: { class_name: className },
      responseType: 'blob'
    })
    if (props.animationId !== animationId || props.className !== className) return
    const url = URL.createObjectURL(response.data)
    const link = document.createElement('a')
    link.href = url
    link.download = '课件作答-' + animationId + '-' + className.replace(/[\\/:*?"<>|]/g, '_') + '.csv'
    document.body.appendChild(link)
    link.click()
    link.remove()
    setTimeout(() => URL.revokeObjectURL(url), 1000)
  } catch {
    ElMessage.error('导出失败，请刷新作答统计后重试')
  } finally {
    exporting.value = false
  }
}

const studentName = student => {
  const hasWrongAnswer = student.wrong_question_ids.length || student.first_wrong_question_ids.length
  return privacyMode.value && hasWrongAnswer ? '同学' : student.display_name
}

const statusLabel = status => ({
  not_started: '未开始',
  in_progress: '作答中',
  completed: '已完成'
}[status] || status)

const statusType = status => ({
  not_started: 'info',
  in_progress: 'warning',
  completed: 'success'
}[status] || 'info')

watch(() => [props.animationId, props.className], loadStats, { immediate: true })
</script>

<style scoped>
.quiz-stats-panel {
  min-height: 240px;
}

.stats-toolbar,
.privacy-setting {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  margin-bottom: 12px;
}

.stats-toolbar span,
.privacy-setting {
  color: #606266;
  font-size: 13px;
}

.privacy-setting {
  justify-content: flex-start;
  padding: 9px 12px;
  background: #f5f7fa;
  border-radius: 6px;
}

.stats-content {
  min-height: 180px;
}

.question-detail {
  display: grid;
  gap: 12px;
  padding: 8px 16px;
}

.answer-tags {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
  margin-top: 6px;
}

.student-results {
  display: grid;
  gap: 8px;
  padding: 8px 12px;
}

.student-result {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 8px;
  font-size: 13px;
}

.muted {
  color: #909399;
}
</style>
