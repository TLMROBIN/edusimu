<template>
  <el-container class="admin-shell">
    <el-header>
      <div class="page-header-bar">
        <div class="page-header-copy">
          <h2 style="margin: 0">{{ dashboardTitle }}</h2>
          <div style="margin-top: 6px; color: #666; font-size: 13px">
            {{ dashboardSubtitle }}
          </div>
        </div>
        <div class="page-header-actions">
          <el-button @click="$router.push('/home')">返回首页</el-button>
          <el-button @click="handleLogout" type="danger">退出</el-button>
        </div>
      </div>
    </el-header>
    
    <el-container class="content-layout">
      <el-aside width="200px" class="sidebar">
        <el-menu :default-active="$route.path" router>
          <el-menu-item index="/admin">
            <span>数据统计</span>
          </el-menu-item>
          <el-menu-item index="/admin/animations">
            <span>动画管理</span>
          </el-menu-item>
          <el-menu-item index="/admin/geogebra">
            <span>GeoGebra 制作</span>
          </el-menu-item>
          <el-menu-item v-if="!isTeacher" index="/admin/users">
            <span>用户管理</span>
          </el-menu-item>
          <el-menu-item v-if="!isTeacher" index="/admin/textbooks">
            <span>教材目录</span>
          </el-menu-item>
        </el-menu>
      </el-aside>
      
      <el-main>
        <section class="glass-panel dashboard-hero">
          <div>
            <div class="section-title">{{ isTeacher ? '我的数据视图' : '全站运行视图' }}</div>
            <div class="dashboard-hero-copy">
              {{ isTeacher ? '聚焦你上传课件的章节表现、学生触达和使用效果。' : '统一查看平台运行、章节表现和课件质量，快速定位高价值内容。' }}
            </div>
          </div>
          <div class="dashboard-pill-group">
            <span class="dashboard-pill">{{ selectedSubject ? '已筛选学科' : '全部学科' }}</span>
            <span class="dashboard-pill">{{ selectedRange === 'all' ? '累计数据' : selectedRange === '7d' ? '近7天' : '近30天' }}</span>
          </div>
        </section>

        <el-row :gutter="20" style="margin-bottom: 20px">
          <el-col :xs="12" :sm="12" :md="6">
            <el-card class="stats-card">
              <div class="stats-number">{{ stats.total_students }}</div>
              <div class="stats-label">{{ isTeacher ? '覆盖学生数' : '学生总数' }}</div>
            </el-card>
          </el-col>
          <el-col :xs="12" :sm="12" :md="6">
            <el-card class="stats-card">
              <div class="stats-number">{{ stats.total_animations }}</div>
              <div class="stats-label">{{ isTeacher ? '我的课件数' : '动画总数' }}</div>
            </el-card>
          </el-col>
          <el-col :xs="12" :sm="12" :md="6">
            <el-card class="stats-card">
              <div class="stats-number">{{ stats.total_views }}</div>
              <div class="stats-label">{{ isTeacher ? '我的课件观看数' : '总观看次数' }}</div>
            </el-card>
          </el-col>
          <el-col :xs="12" :sm="12" :md="6">
            <el-card class="stats-card">
              <div class="stats-number">{{ stats.total_favorites }}</div>
              <div class="stats-label">{{ isTeacher ? '我的课件收藏数' : '总收藏数' }}</div>
            </el-card>
          </el-col>
        </el-row>
        
        <section class="glass-panel dashboard-filter-panel">
        <el-row :gutter="20">
          <el-col :xs="24" :sm="12" :md="8">
            <el-select v-model="selectedSubject" placeholder="筛选学科" clearable @change="loadAllStats">
              <el-option
                v-for="subject in subjects"
                :key="subject.id"
                :label="subject.display_name"
                :value="subject.id"
              />
            </el-select>
          </el-col>
          <el-col :xs="24" :sm="12" :md="8">
            <el-select v-model="selectedRange" placeholder="时间范围" @change="loadAllStats">
              <el-option label="全部时间" value="all" />
              <el-option label="近7天" value="7d" />
              <el-option label="近30天" value="30d" />
            </el-select>
          </el-col>
        </el-row>
        </section>
        
        <el-row :gutter="20" style="margin-bottom: 20px">
          <el-col :xs="24" :sm="24" :md="12">
            <el-card>
              <template #header>
                <span>{{ isTeacher ? '我的课件学科热度' : '学科热度榜' }}</span>
              </template>
              <div v-for="(item, index) in subjectHeat" :key="item.subject_id" style="margin-bottom: 15px">
                <div style="display: flex; justify-content: space-between; align-items: center">
                  <span>{{ index + 1 }}. {{ item.subject_name }}</span>
                  <el-tag>{{ item.view_count }} 次</el-tag>
                </div>
                <el-progress 
                  :percentage="getHeatPercentage(item.view_count)" 
                  :color="getProgressColor(index)"
                  :stroke-width="10"
                  style="margin-top: 5px"
                />
              </div>
            </el-card>
          </el-col>
          
          <el-col :span="12">
            <el-card>
              <template #header>
                <span>{{ isTeacher ? '我的课件活跃学生榜' : '高频使用学生榜' }}</span>
              </template>
              <div class="responsive-table">
              <el-table :data="topActiveUsers" max-height="400">
                <el-table-column prop="real_name" label="姓名" width="100" />
                <el-table-column prop="class_name" label="班级" width="120" />
                <el-table-column prop="total_views" label="观看次数" width="100" />
                <el-table-column label="观看时长">
                  <template #default="scope">
                    {{ formatDuration(scope.row.total_duration) }}
                  </template>
                </el-table-column>
              </el-table>
              </div>
            </el-card>
          </el-col>
        </el-row>
        
        <el-row :gutter="20" style="margin-bottom: 20px">
          <el-col :xs="24" :sm="24" :md="12">
            <el-card>
              <template #header>
                <span>{{ isTeacher ? '我的课件收藏榜' : '动画收藏榜' }}</span>
              </template>
              <div class="responsive-table">
              <el-table :data="topFavorites" max-height="400">
                <el-table-column prop="title" label="动画标题" />
                <el-table-column prop="subject_name" label="学科" width="80" />
                <el-table-column prop="favorite_count" label="收藏数" width="80" />
              </el-table>
              </div>
            </el-card>
          </el-col>
          
          <el-col :xs="24" :sm="24" :md="12">
            <el-card>
              <template #header>
                <span>{{ isTeacher ? '我的课件点击榜' : '动画点击榜' }}</span>
              </template>
              <div class="responsive-table">
              <el-table :data="topViews" max-height="400">
                <el-table-column prop="title" label="动画标题" />
                <el-table-column prop="subject_name" label="学科" width="80" />
                <el-table-column prop="view_count" label="点击数" width="80" />
              </el-table>
              </div>
            </el-card>
          </el-col>
        </el-row>

        <el-row :gutter="20" style="margin-bottom: 20px">
          <el-col :xs="24" :sm="24" :md="12">
            <el-card>
              <template #header>
                <span>{{ isTeacher ? '我的章节表现榜' : '章节表现榜' }}</span>
              </template>
              <div class="responsive-table">
              <el-table :data="textbookPerformance" max-height="420" @row-click="showTextbookDetail">
                <el-table-column prop="textbook_path" label="章节" min-width="220" show-overflow-tooltip />
                <el-table-column prop="animation_count" label="课件数" width="80" />
                <el-table-column prop="unique_students" label="学生数" width="80" />
                <el-table-column prop="total_views" label="观看数" width="80" />
                <el-table-column label="平均时长" width="100">
                  <template #default="scope">
                    {{ formatDuration(scope.row.avg_duration) }}
                  </template>
                </el-table-column>
              </el-table>
              </div>
            </el-card>
          </el-col>

          <el-col :xs="24" :sm="24" :md="12">
            <el-card>
              <template #header>
                <span>{{ isTeacher ? '我的课件效果榜' : '课件效果榜' }}</span>
              </template>
              <div class="responsive-table">
              <el-table :data="coursewareEffect" max-height="420">
                <el-table-column prop="title" label="课件" min-width="160" show-overflow-tooltip />
                <el-table-column prop="textbook_path" label="章节" min-width="180" show-overflow-tooltip />
                <el-table-column prop="unique_students" label="学生数" width="80" />
                <el-table-column label="平均时长" width="100">
                  <template #default="scope">
                    {{ formatDuration(scope.row.avg_duration) }}
                  </template>
                </el-table-column>
                <el-table-column prop="favorite_rate" label="收藏率" width="90">
                  <template #default="scope">
                    {{ scope.row.favorite_rate }}%
                  </template>
                </el-table-column>
              </el-table>
              </div>
            </el-card>
          </el-col>
        </el-row>
        
        <el-card>
          <template #header>
            <span>{{ isTeacher ? '我的课件最近活动' : '最近活动' }}</span>
          </template>
          <div class="responsive-table">
          <el-table :data="recentLogs" style="width: 100%">
            <el-table-column prop="user.username" label="用户" width="150" />
            <el-table-column prop="animation.title" label="动画" width="200" />
            <el-table-column prop="view_duration" label="观看时长" width="100" />
            <el-table-column prop="interaction_count" label="交互次数" width="100" />
            <el-table-column prop="viewed_at" label="时间" />
          </el-table>
          </div>
        </el-card>

        <el-dialog v-model="showTextbookDetailDialog" title="章节课件效果详情" width="900px">
          <template v-if="activeTextbook">
            <div style="margin-bottom: 16px">
              <div style="font-size: 18px; font-weight: 600">{{ activeTextbook.textbook_path }}</div>
              <div style="margin-top: 6px; color: #666">
                课件数 {{ activeTextbook.animation_count }}，学生数 {{ activeTextbook.unique_students }}，观看数 {{ activeTextbook.total_views }}
              </div>
            </div>

            <div class="responsive-table">
            <el-table :data="textbookDetailRows" max-height="500">
              <el-table-column prop="title" label="课件标题" min-width="180" show-overflow-tooltip />
              <el-table-column prop="unique_students" label="学生数" width="90" />
              <el-table-column prop="total_views" label="观看数" width="90" />
              <el-table-column label="平均时长" width="100">
                <template #default="scope">
                  {{ formatDuration(scope.row.avg_duration) }}
                </template>
              </el-table-column>
              <el-table-column prop="avg_interactions" label="平均交互" width="100" />
              <el-table-column prop="favorite_rate" label="收藏率" width="90">
                <template #default="scope">
                  {{ scope.row.favorite_rate }}%
                </template>
              </el-table-column>
              <el-table-column prop="avg_rating" label="评分" width="80" />
            </el-table>
            </div>
          </template>
          <template #footer>
            <el-button @click="showTextbookDetailDialog = false">关闭</el-button>
          </template>
        </el-dialog>
      </el-main>
    </el-container>
  </el-container>
</template>

<script setup>
import { computed, ref, onMounted } from 'vue'
import { useRouter } from 'vue-router'
import { useUserStore } from '../stores/user'
import axios from 'axios'
import { ElMessage } from 'element-plus'

const router = useRouter()
const userStore = useUserStore()
const isTeacher = computed(() => userStore.user?.role === 'teacher')
const dashboardTitle = computed(() => (isTeacher.value ? '教师效果分析' : '管理后台'))
const dashboardSubtitle = computed(() =>
  isTeacher.value
    ? '这里展示的是你上传课件的章节表现、课件效果和学生使用情况。'
    : '这里展示全站课件、章节和学生使用情况。'
)
const stats = ref({
  total_users: 0,
  total_students: 0,
  total_teachers: 0,
  total_animations: 0,
  total_views: 0,
  total_favorites: 0,
  total_ratings: 0
})
const recentLogs = ref([])
const subjects = ref([])
const selectedSubject = ref(null)
const selectedRange = ref('all')
const subjectHeat = ref([])
const topFavorites = ref([])
const topViews = ref([])
const topActiveUsers = ref([])
const textbookPerformance = ref([])
const coursewareEffect = ref([])
const showTextbookDetailDialog = ref(false)
const activeTextbook = ref(null)
const textbookDetailRows = ref([])

const buildDateParams = () => {
  if (selectedRange.value === 'all') {
    return {}
  }

  const now = new Date()
  const days = selectedRange.value === '7d' ? 7 : 30
  const start = new Date(now)
  start.setDate(now.getDate() - (days - 1))

  const formatDate = (value) => value.toISOString().slice(0, 10)
  return {
    date_from: formatDate(start),
    date_to: formatDate(now)
  }
}

const loadSubjects = async () => {
  try {
    const response = await axios.get('/api/animations/subjects')
    subjects.value = response.data
  } catch (error) {
    console.error('加载学科失败:', error)
  }
}

const loadStats = async () => {
  try {
    const response = await axios.get('/api/stats/overview', { params: buildDateParams() })
    stats.value = response.data
  } catch (error) {
    console.error('加载统计失败:', error)
  }
}

const loadRecentLogs = async () => {
  try {
    const response = await axios.get('/api/admin/logs', {
      params: { limit: 20 }
    })
    recentLogs.value = response.data
  } catch (error) {
    console.error('加载日志失败:', error)
  }
}

const loadSubjectHeat = async () => {
  try {
    const params = {
      ...buildDateParams(),
      ...(selectedSubject.value ? { subject_id: selectedSubject.value } : {})
    }
    const response = await axios.get('/api/stats/subject-heat', { params })
    subjectHeat.value = response.data
  } catch (error) {
    console.error('加载学科热度失败:', error)
  }
}

const loadTopFavorites = async () => {
  try {
    const params = { limit: 10, ...buildDateParams() }
    if (selectedSubject.value) {
      params.subject_id = selectedSubject.value
    }
    const response = await axios.get('/api/stats/top-favorites', { params })
    topFavorites.value = response.data
  } catch (error) {
    console.error('加载收藏榜失败:', error)
  }
}

const loadTopViews = async () => {
  try {
    const params = { limit: 10, ...buildDateParams() }
    if (selectedSubject.value) {
      params.subject_id = selectedSubject.value
    }
    const response = await axios.get('/api/stats/top-views', { params })
    topViews.value = response.data
  } catch (error) {
    console.error('加载点击榜失败:', error)
  }
}

const loadTopActiveUsers = async () => {
  try {
    const params = { limit: 10, ...buildDateParams() }
    if (selectedSubject.value) {
      params.subject_id = selectedSubject.value
    }
    const response = await axios.get('/api/stats/top-active-users', { params })
    topActiveUsers.value = response.data
  } catch (error) {
    console.error('加载活跃用户榜失败:', error)
  }
}

const loadTextbookPerformance = async () => {
  try {
    const params = { limit: 10, ...buildDateParams() }
    if (selectedSubject.value) {
      params.subject_id = selectedSubject.value
    }
    const response = await axios.get('/api/stats/textbook-performance', { params })
    textbookPerformance.value = response.data
  } catch (error) {
    console.error('加载章节表现失败:', error)
  }
}

const loadCoursewareEffect = async () => {
  try {
    const params = { limit: 10, ...buildDateParams() }
    if (selectedSubject.value) {
      params.subject_id = selectedSubject.value
    }
    const response = await axios.get('/api/stats/courseware-effect', { params })
    coursewareEffect.value = response.data
  } catch (error) {
    console.error('加载课件效果失败:', error)
  }
}

const loadTextbookDetail = async (textbookNodeId) => {
  try {
    const params = { limit: 50, textbook_node_id: textbookNodeId, ...buildDateParams() }
    if (selectedSubject.value) {
      params.subject_id = selectedSubject.value
    }
    const response = await axios.get('/api/stats/courseware-effect', { params })
    textbookDetailRows.value = response.data
  } catch (error) {
    console.error('加载章节详情失败:', error)
    textbookDetailRows.value = []
  }
}

const showTextbookDetail = async (row) => {
  activeTextbook.value = row
  showTextbookDetailDialog.value = true
  await loadTextbookDetail(row.textbook_node_id)
}

const loadAllStats = () => {
  loadStats()
  loadSubjectHeat()
  loadTopFavorites()
  loadTopViews()
  loadTopActiveUsers()
  loadTextbookPerformance()
  loadCoursewareEffect()
}

const getHeatPercentage = (viewCount) => {
  if (subjectHeat.value.length === 0) return 0
  const maxViews = Math.max(...subjectHeat.value.map(s => s.view_count))
  if (maxViews === 0) return 0
  return Math.round((viewCount / maxViews) * 100)
}

const getProgressColor = (index) => {
  const colors = ['#67C23A', '#409EFF', '#E6A23C', '#F56C6C', '#909399']
  return colors[index % colors.length]
}

const formatDuration = (seconds) => {
  if (!seconds) return '0分钟'
  const hours = Math.floor(seconds / 3600)
  const minutes = Math.floor((seconds % 3600) / 60)
  if (hours > 0) {
    return `${hours}小时${minutes}分钟`
  }
  return `${minutes}分钟`
}

const handleLogout = async () => {
  await userStore.logout()
  ElMessage.success('已退出登录')
  router.push('/login')
}

onMounted(() => {
  loadSubjects()
  loadRecentLogs()
  loadAllStats()
})
</script>

<style scoped>
.dashboard-hero {
  margin-bottom: 20px;
  padding: 22px 24px;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
  flex-wrap: wrap;
}

.dashboard-hero-copy {
  margin-top: 10px;
  max-width: 760px;
  color: var(--app-text-muted);
  line-height: 1.8;
}

.dashboard-pill-group {
  display: flex;
  gap: 10px;
  flex-wrap: wrap;
}

.dashboard-pill {
  display: inline-flex;
  align-items: center;
  padding: 10px 14px;
  border-radius: 999px;
  background: rgba(255, 255, 255, 0.72);
  border: 1px solid rgba(84, 125, 173, 0.18);
  color: var(--app-text);
  font-weight: 600;
}

.dashboard-filter-panel {
  margin-bottom: 20px;
  padding: 18px;
}
</style>
