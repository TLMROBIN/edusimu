<template>
  <el-container class="home-shell">
    <el-header>
      <div class="page-header-bar">
        <div class="page-header-copy home-header-copy">
          <div class="home-chip">SMART COURSEWARE HUB</div>
          <h2>教育动画展示系统</h2>
          <div class="home-header-subtitle">按学科与教材章节快速定位课件，适配校内平板课堂使用。</div>
        </div>
        <div class="page-header-actions">
          <span v-if="userStore.user" class="user-pill">欢迎, {{ userStore.user.real_name || userStore.user.username }}</span>
          <el-button v-if="['teacher', 'admin'].includes(userStore.user?.role)" @click="$router.push('/admin')" type="primary">
            管理后台
          </el-button>
          <el-button @click="$router.push('/profile')">个人中心</el-button>
          <el-button @click="handleLogout" type="danger">退出</el-button>
        </div>
      </div>
    </el-header>

    <el-main>
      <section class="home-hero glass-panel">
        <div class="hero-copy">
          <div class="section-title">智能课件中枢</div>
          <h3>统一管理课件、章节与课堂触控体验</h3>
          <p>已发布课件支持关键词检索、教材目录筛选和平板全屏播放，适合校内大规模平板使用。</p>
        </div>
        <div class="hero-stats">
          <div class="hero-stat-card">
            <span>学科</span>
            <strong>{{ subjects.length }}</strong>
          </div>
          <div class="hero-stat-card">
            <span>已发布课件</span>
            <strong>{{ totalAnimations }}</strong>
          </div>
          <div class="hero-stat-card">
            <span>当前筛选</span>
            <strong>{{ selectedSubjectName || '全部' }}</strong>
          </div>
        </div>
      </section>

      <section class="subject-section">
        <div class="section-title" style="margin-bottom: 16px">学科导航</div>
      <el-row :gutter="15" style="margin-bottom: 25px">
        <el-col :xs="12" :sm="8" :md="6" :lg="4" v-for="subject in subjects" :key="subject.id">
          <el-card
            class="subject-card"
            :class="{ active: selectedSubjectId === subject.id }"
            @click="filterBySubject(subject.id)"
            shadow="hover"
          >
            <div class="subject-icon">{{ subject.display_name }}</div>
          </el-card>
        </el-col>
      </el-row>
      </section>

      <section class="filter-shell glass-panel">
      <el-row :gutter="16">
        <el-col :xs="24" :sm="24" :md="8">
          <el-input
            v-model="searchText"
            placeholder="搜索课件标题、关键词、章节"
            clearable
            @clear="loadAnimations"
            @keyup.enter="searchAnimations"
          >
            <template #append>
              <el-button icon="Search" @click="searchAnimations" />
            </template>
          </el-input>
        </el-col>
        <el-col :xs="24" :sm="12" :md="6">
          <el-select
            v-model="selectedSourceType"
            placeholder="按来源筛选"
            clearable
            @change="filterBySource"
          >
            <el-option
              v-for="option in sourceOptions"
              :key="option.value"
              :label="option.label"
              :value="option.value"
            />
          </el-select>
        </el-col>
        <el-col :xs="24" :sm="12" :md="6">
          <el-cascader
            v-model="selectedTextbookPath"
            :options="textbookOptions"
            :props="textbookProps"
            clearable
            filterable
            placeholder="按教材章节筛选"
            @change="filterByTextbook"
          />
        </el-col>
        <el-col :xs="24" :sm="24" :md="4" class="filter-action-col">
          <el-button @click="resetFilters">重置筛选</el-button>
        </el-col>
      </el-row>
      </section>

      <div v-if="selectedSubjectName || selectedSourceLabel || selectedTextbookLabel" style="margin-bottom: 18px; display: flex; gap: 10px; flex-wrap: wrap">
        <el-tag v-if="selectedSubjectName" type="primary">学科: {{ selectedSubjectName }}</el-tag>
        <el-tag v-if="selectedSourceLabel" type="warning">来源: {{ selectedSourceLabel }}</el-tag>
        <el-tag v-if="selectedTextbookLabel" type="success">章节: {{ selectedTextbookLabel }}</el-tag>
      </div>

      <div class="resource-header">
        <div class="section-title">课件资源</div>
        <el-radio-group v-model="viewMode" size="small" class="view-mode-toggle">
          <el-radio-button label="grid">卡片视图</el-radio-button>
          <el-radio-button label="list">列表视图</el-radio-button>
        </el-radio-group>
      </div>

      <el-row v-if="viewMode === 'grid'" :gutter="20">
        <el-col :xs="24" :sm="12" :md="8" :lg="6" v-for="animation in animations" :key="animation.id">
          <el-card class="animation-card" @click="playAnimation(animation.id)" shadow="hover">
            <div class="thumbnail">
              <img
                v-if="animation.thumbnail"
                :src="animation.thumbnail"
                style="width: 100%; height: 100%; object-fit: cover"
              />
              <div v-else class="thumbnail-fallback">
                <div class="thumbnail-fallback-badge">HTML</div>
                <div class="thumbnail-fallback-title">{{ animation.subject_name || '课件' }}</div>
                <div class="thumbnail-fallback-line"></div>
              </div>
            </div>
            <div style="padding: 10px">
              <h3 style="margin: 0 0 10px 0; font-size: 14px">{{ animation.title }}</h3>
              <div style="font-size: 12px; color: #666; margin-bottom: 8px; min-height: 32px">
                {{ animation.textbook_path || '未标注章节' }}
              </div>
              <div style="display: flex; justify-content: space-between; font-size: 12px; color: #999">
                <span>{{ animation.view_count }} 次观看</span>
                <span>{{ formatSourceType(animation.source_type) }}</span>
                <span v-if="animation.avg_rating">⭐ {{ animation.avg_rating }}</span>
              </div>
            </div>
          </el-card>
        </el-col>
      </el-row>

      <div v-else class="list-view-shell">
        <el-card
          v-for="animation in animations"
          :key="animation.id"
          class="animation-card list-animation-card"
          shadow="hover"
          @click="playAnimation(animation.id)"
        >
          <div class="list-content">
            <div class="list-topline">
              <h3>{{ animation.title }}</h3>
              <el-tag size="small" effect="plain">{{ animation.subject_name || '未分类' }}</el-tag>
            </div>
            <div class="list-path">{{ animation.textbook_path || '未标注章节' }}</div>
            <div class="list-description">{{ animation.description || '暂无课件描述' }}</div>
            <div class="list-meta">
              <span>{{ animation.view_count }} 次观看</span>
              <span>{{ formatSourceType(animation.source_type) }}</span>
              <span v-if="animation.avg_rating">⭐ {{ animation.avg_rating }}</span>
              <span v-if="animation.author">{{ animation.author }}</span>
            </div>
          </div>
        </el-card>
      </div>

      <div class="pagination-shell">
        <el-pagination
          v-model:current-page="currentPage"
          :page-size="pageSize"
          :total="totalAnimations"
          layout="prev, pager, next"
          background
          @current-change="handlePageChange"
        />
      </div>
    </el-main>
  </el-container>
</template>

<script setup>
import { computed, onMounted, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { useUserStore } from '../stores/user'
import axios from 'axios'
import { ElMessage } from 'element-plus'

const route = useRoute()
const router = useRouter()
const userStore = useUserStore()
const subjects = ref([])
const textbookOptions = ref([])
const animations = ref([])
const totalAnimations = ref(0)
const searchText = ref('')
const selectedSubjectId = ref(null)
const selectedSourceType = ref('')
const selectedTextbookPath = ref([])
const viewMode = ref(localStorage.getItem('home_view_mode') || 'grid')
const currentPage = ref(1)
const pageSize = 20
const sourceOptions = [
  { label: 'PhET', value: 'phet' },
  { label: 'GeoGebra', value: 'geogebra' },
  { label: '原创', value: 'original' }
]
const validSourceTypes = sourceOptions.map(item => item.value)
const textbookProps = {
  value: 'id',
  label: 'name',
  children: 'children',
  emitPath: true
}

const parsePositiveInt = (value, fallback = 1) => {
  const parsed = Number.parseInt(value, 10)
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback
}

const normalizeTextbookPath = (value) => {
  if (!value) {
    return []
  }
  const items = Array.isArray(value) ? value : String(value).split(',')
  return items
    .map(item => Number.parseInt(item, 10))
    .filter(item => Number.isFinite(item) && item > 0)
}

const buildHomeQuery = () => {
  const query = {}
  if (currentPage.value > 1) {
    query.page = String(currentPage.value)
  }
  if (selectedSubjectId.value) {
    query.subject = String(selectedSubjectId.value)
  }
  if (selectedSourceType.value) {
    query.source = selectedSourceType.value
  }
  if (selectedTextbookPath.value.length) {
    query.textbook = selectedTextbookPath.value.join(',')
  }
  if (searchText.value) {
    query.search = searchText.value
  }
  if (viewMode.value !== 'grid') {
    query.view = viewMode.value
  }
  return query
}

const applyRouteState = () => {
  currentPage.value = parsePositiveInt(route.query.page, 1)
  selectedSubjectId.value = route.query.subject ? parsePositiveInt(route.query.subject, null) : null
  selectedSourceType.value = typeof route.query.source === 'string' && validSourceTypes.includes(route.query.source)
    ? route.query.source
    : ''
  selectedTextbookPath.value = normalizeTextbookPath(route.query.textbook)
  searchText.value = typeof route.query.search === 'string' ? route.query.search : ''
  const queryViewMode = typeof route.query.view === 'string' ? route.query.view : ''
  if (['grid', 'list'].includes(queryViewMode)) {
    viewMode.value = queryViewMode
  }
}

const syncRouteState = async () => {
  const nextQuery = buildHomeQuery()
  const currentQuery = { ...route.query }
  if (JSON.stringify(currentQuery) === JSON.stringify(nextQuery)) {
    return
  }
  await router.replace({ path: '/home', query: nextQuery })
}

const selectedSubjectName = computed(() => {
  const subject = subjects.value.find(item => item.id === selectedSubjectId.value)
  return subject?.display_name || ''
})

const selectedTextbookLabel = computed(() => {
  if (!selectedTextbookPath.value?.length || !textbookOptions.value.length) {
    return ''
  }

  const labels = []
  let currentOptions = textbookOptions.value
  for (const id of selectedTextbookPath.value) {
    const current = currentOptions.find(item => item.id === id)
    if (!current) break
    labels.push(current.name)
    currentOptions = current.children || []
  }
  return labels.join(' / ')
})

const selectedSourceLabel = computed(() => {
  return sourceOptions.find(item => item.value === selectedSourceType.value)?.label || ''
})

const formatSourceType = (sourceType) => {
  if (sourceType === 'phet') {
    return 'PhET'
  }
  if (sourceType === 'geogebra') {
    return 'GeoGebra'
  }
  return '原创'
}

const loadSubjects = async () => {
  try {
    const response = await axios.get('/api/animations/subjects')
    subjects.value = response.data
  } catch (error) {
    console.error('加载学科失败:', error)
  }
}

const loadTextbookTree = async () => {
  if (!selectedSubjectId.value) {
    textbookOptions.value = []
    return
  }

  try {
    const response = await axios.get('/api/animations/textbook-tree', {
      params: { subject_id: selectedSubjectId.value }
    })
    textbookOptions.value = response.data
  } catch (error) {
    console.error('加载教材目录失败:', error)
    textbookOptions.value = []
  }
}

const fetchAnimations = async () => {
  try {
    const params = {
      limit: pageSize,
      skip: (currentPage.value - 1) * pageSize,
      is_published: true
    }
    if (selectedSubjectId.value) {
      params.subject_id = selectedSubjectId.value
    }
    if (selectedTextbookPath.value?.length) {
      params.textbook_node_id = selectedTextbookPath.value[selectedTextbookPath.value.length - 1]
    }
    if (selectedSourceType.value) {
      params.source_type = selectedSourceType.value
    }
    if (searchText.value) {
      params.search = searchText.value
    }

    const response = await axios.get('/api/animations/', { params })
    animations.value = response.data
  } catch (error) {
    console.error('加载动画失败:', error)
  }
}

const fetchAnimationCount = async () => {
  try {
    const params = { is_published: true }
    if (selectedSubjectId.value) {
      params.subject_id = selectedSubjectId.value
    }
    if (selectedTextbookPath.value?.length) {
      params.textbook_node_id = selectedTextbookPath.value[selectedTextbookPath.value.length - 1]
    }
    if (selectedSourceType.value) {
      params.source_type = selectedSourceType.value
    }
    if (searchText.value) {
      params.search = searchText.value
    }

    const response = await axios.get('/api/animations/count', { params })
    totalAnimations.value = response.data.total || 0
  } catch (error) {
    console.error('加载课件总数失败:', error)
    totalAnimations.value = 0
  }
}

const loadAnimations = async () => {
  await fetchAnimationCount()
  await fetchAnimations()
}

const filterBySubject = async (subjectId) => {
  selectedSubjectId.value = selectedSubjectId.value === subjectId ? null : subjectId
  selectedTextbookPath.value = []
  currentPage.value = 1
  await syncRouteState()
}

const filterByTextbook = async () => {
  currentPage.value = 1
  await syncRouteState()
}

const filterBySource = async () => {
  currentPage.value = 1
  await syncRouteState()
}

const searchAnimations = async () => {
  currentPage.value = 1
  await syncRouteState()
}

const resetFilters = async () => {
  selectedSubjectId.value = null
  selectedSourceType.value = ''
  selectedTextbookPath.value = []
  searchText.value = ''
  textbookOptions.value = []
  currentPage.value = 1
  await syncRouteState()
}

const handlePageChange = async (page) => {
  currentPage.value = page
  await syncRouteState()
}

const playAnimation = (id) => {
  router.push(`/animations/${id}`)
}

const handleLogout = async () => {
  await userStore.logout()
  ElMessage.success('已退出登录')
  router.push('/login')
}

onMounted(async () => {
  if (!['grid', 'list'].includes(viewMode.value)) {
    viewMode.value = 'grid'
  }
  await loadSubjects()
  applyRouteState()
  await loadTextbookTree()
  await loadAnimations()
})

watch(viewMode, async (value) => {
  localStorage.setItem('home_view_mode', value)
  await syncRouteState()
})

watch(
  () => route.query,
  async () => {
    applyRouteState()
    await loadTextbookTree()
    await loadAnimations()
  }
)
</script>

<style scoped>
.home-header-copy {
  display: flex;
  flex-direction: column;
  align-items: flex-start;
}

.home-chip {
  display: inline-flex;
  align-items: center;
  padding: 6px 12px;
  border-radius: 999px;
  background: rgba(255, 255, 255, 0.12);
  border: 1px solid rgba(160, 226, 255, 0.26);
  font-size: 12px;
  letter-spacing: 0.12em;
  margin-bottom: 10px;
}

.home-header-subtitle {
  margin-top: 6px;
  color: rgba(235, 246, 255, 0.78);
  font-size: 13px;
}

.user-pill {
  display: inline-flex;
  align-items: center;
  padding: 8px 12px;
  border-radius: 999px;
  background: rgba(255, 255, 255, 0.12);
  border: 1px solid rgba(255, 255, 255, 0.16);
}

.home-hero {
  margin-bottom: 26px;
  padding: 28px;
  display: grid;
  grid-template-columns: 1.4fr 1fr;
  gap: 20px;
}

.hero-copy h3 {
  margin-top: 14px;
  font-size: clamp(24px, 4vw, 40px);
  line-height: 1.15;
  color: #10233f;
}

.hero-copy p {
  margin-top: 12px;
  max-width: 680px;
  color: #5f7694;
  line-height: 1.8;
}

.hero-stats {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 14px;
}

.hero-stat-card {
  min-height: 132px;
  padding: 20px;
  border-radius: 22px;
  background: linear-gradient(180deg, rgba(12, 32, 60, 0.92), rgba(24, 73, 125, 0.84));
  color: #f3fbff;
  display: flex;
  flex-direction: column;
  justify-content: space-between;
  box-shadow: 0 18px 40px rgba(14, 30, 58, 0.16);
}

.hero-stat-card span {
  color: rgba(223, 243, 255, 0.72);
  font-size: 13px;
}

.hero-stat-card strong {
  font-size: clamp(20px, 3vw, 32px);
  line-height: 1.1;
}

.subject-section {
  margin-bottom: 10px;
}

.subject-card {
  cursor: pointer;
  text-align: center;
  padding: 24px 20px;
  transition: transform 0.28s ease, border-color 0.28s ease, box-shadow 0.28s ease;
  border: 1px solid rgba(84, 125, 173, 0.18);
}

.subject-card:hover,
.subject-card.active {
  transform: translateY(-6px);
  border-color: rgba(18, 169, 196, 0.38);
  box-shadow: 0 18px 36px rgba(28, 55, 90, 0.14);
}

.subject-icon {
  font-size: 26px;
  font-weight: bold;
  color: #1661ff;
  letter-spacing: 0.04em;
}

.filter-shell {
  margin-bottom: 20px;
  padding: 18px;
}

.resource-header {
  margin-bottom: 16px;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
  flex-wrap: wrap;
}

.view-mode-toggle :deep(.el-radio-button__inner) {
  min-width: 92px;
}

.thumbnail-fallback {
  width: 100%;
  height: 100%;
  padding: 18px;
  display: flex;
  flex-direction: column;
  justify-content: flex-end;
  background:
    linear-gradient(160deg, rgba(255, 255, 255, 0.72), rgba(236, 245, 255, 0.96)),
    radial-gradient(circle at top right, rgba(18, 169, 196, 0.18), transparent 40%);
}

.thumbnail-fallback-badge {
  display: inline-flex;
  align-items: center;
  width: fit-content;
  padding: 6px 10px;
  border-radius: 999px;
  background: rgba(22, 97, 255, 0.1);
  color: #1661ff;
  font-size: 12px;
  font-weight: 700;
  letter-spacing: 0.08em;
}

.thumbnail-fallback-title {
  margin-top: 14px;
  color: #10233f;
  font-size: 20px;
  font-weight: 700;
}

.thumbnail-fallback-line {
  margin-top: 10px;
  width: 72px;
  height: 4px;
  border-radius: 999px;
  background: linear-gradient(90deg, #1661ff, #12a9c4);
}

.filter-action-col {
  display: flex;
  justify-content: flex-end;
}

.list-view-shell {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 16px;
}

.list-animation-card :deep(.el-card__body) {
  padding: 0;
}

.list-animation-card {
  height: 100%;
  overflow: hidden;
  border: 1px solid rgba(84, 125, 173, 0.14);
}

.list-content {
  padding: 16px 18px;
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.list-topline {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 12px;
}

.list-topline h3 {
  margin: 0;
  font-size: 17px;
  color: #10233f;
  line-height: 1.45;
}

.list-path {
  color: #5f7694;
  font-size: 13px;
  line-height: 1.55;
}

.list-description {
  color: #4f6786;
  font-size: 13px;
  line-height: 1.6;
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
  overflow: hidden;
}

.list-meta {
  margin-top: 2px;
  display: flex;
  gap: 12px;
  flex-wrap: wrap;
  color: #7288a3;
  font-size: 12px;
}

.pagination-shell {
  margin-top: 22px;
  display: flex;
  justify-content: center;
}

@media (max-width: 900px) {
  .home-hero {
    grid-template-columns: 1fr;
    padding: 22px;
  }

  .hero-stats {
    grid-template-columns: 1fr;
  }

  .filter-action-col {
    justify-content: stretch;
  }

  .filter-action-col .el-button {
    width: 100%;
  }

  .resource-header {
    align-items: stretch;
  }

  .view-mode-toggle {
    width: 100%;
  }

  .view-mode-toggle :deep(.el-radio-button) {
    width: 50%;
  }

  .view-mode-toggle :deep(.el-radio-button__inner) {
    width: 100%;
  }

  .list-view-shell {
    grid-template-columns: 1fr;
  }

  .list-content {
    padding: 14px 16px;
  }

  .list-topline {
    flex-direction: column;
  }
}
</style>
