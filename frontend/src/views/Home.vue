<template>
  <el-container class="home-shell">
    <el-header class="home-header">
      <div class="page-header-bar">
        <div class="page-header-copy">
          <h1>教育动画展示系统</h1>
          <p>按教材章节找到课件，打开即可开始互动学习。</p>
        </div>
        <nav class="page-header-actions" aria-label="账户与管理">
          <span v-if="userStore.user" class="user-summary">
            当前用户：{{ userStore.user.real_name || userStore.user.username }}
          </span>
          <el-button
            v-if="['teacher', 'admin'].includes(userStore.user?.role)"
            type="primary"
            @click="$router.push('/admin')"
          >
            管理后台
          </el-button>
          <el-button @click="$router.push('/profile')">个人中心</el-button>
          <el-button @click="handleLogout">退出登录</el-button>
        </nav>
      </div>
    </el-header>

    <el-main>
      <div class="home-content">
        <section class="start-section" aria-labelledby="start-title">
          <div class="section-heading">
            <div>
              <h2 id="start-title">从这里开始</h2>
              <p>继续最近使用的课件，或先定位今天要学习的教材章节。</p>
            </div>
          </div>

          <div class="start-layout">
            <article
              class="continue-panel"
              :class="{ 'is-empty': recentStatus === 'success' && !recentAnimations.length }"
              aria-labelledby="continue-title"
            >
              <div class="panel-heading">
                <div>
                  <span class="status-label">继续学习</span>
                  <h3 id="continue-title">{{ recentAnimations[0]?.title || '还没有最近使用的课件' }}</h3>
                </div>
                <span v-if="recentAnimations.length" class="status-note">最近打开</span>
              </div>

              <template v-if="recentStatus === 'loading'">
                <div class="inline-status" role="status" aria-live="polite">
                  <span class="status-dot" aria-hidden="true"></span>
                  正在读取最近学习记录…
                </div>
              </template>
              <template v-else-if="recentStatus === 'error'">
                <div class="inline-message error-message" role="alert">
                  <strong>最近记录暂时无法读取</strong>
                  <span>{{ recentError }}</span>
                  <el-button @click="loadRecentAnimations">重新加载</el-button>
                </div>
              </template>
              <template v-else-if="recentAnimations.length">
                <p class="continue-path">
                  {{ recentAnimations[0].textbook_path || '该课件尚未标注教材章节' }}
                </p>
                <el-button type="primary" class="continue-action" @click="openAnimation(recentAnimations[0])">
                  继续打开课件
                </el-button>

                <div v-if="recentAnimations.length > 1" class="recent-list" aria-label="其他最近课件">
                  <span class="recent-list-title">其他最近课件</span>
                  <button
                    v-for="animation in recentAnimations.slice(1)"
                    :key="animation.id"
                    type="button"
                    class="recent-link"
                    @click="openAnimation(animation)"
                  >
                    <span>{{ animation.title }}</span>
                    <span aria-hidden="true">打开</span>
                  </button>
                </div>
              </template>
              <template v-else>
                <p class="empty-copy">从资源目录打开一个课件后，这里会保留你的最近学习入口。</p>
                <el-button type="primary" class="continue-action" @click="scrollToDirectory">
                  浏览课件资源
                </el-button>
              </template>
            </article>

            <aside class="chapter-panel" aria-labelledby="chapter-title">
              <span class="status-label">
                {{ selectedTextbookLabel ? '已选章节' : '按章节找课件' }}
              </span>
              <h3 id="chapter-title">{{ selectedTextbookLabel || '尚未选择教材章节' }}</h3>
              <p v-if="selectedSubjectName">学科：{{ selectedSubjectName }}</p>
              <p v-else>先选择学科，再从教材目录定位本节课。</p>
              <el-button class="chapter-action" @click="focusLearningSelection">
                {{ selectedTextbookLabel ? '更换章节' : selectedSubjectId ? '选择章节' : '选择学科' }}
              </el-button>
            </aside>
          </div>
        </section>

        <section id="resource-directory" class="directory-section" aria-labelledby="directory-title">
          <div class="section-heading directory-heading">
            <div>
              <h2 id="directory-title" tabindex="-1">课件资源目录</h2>
              <p>按学科、教材章节或关键词缩小范围。</p>
            </div>
            <span v-if="resourceStatus === 'success'" class="result-count" aria-live="polite">
              找到 {{ totalAnimations }} 个课件
            </span>
          </div>

          <section class="subject-nav" aria-labelledby="subject-title">
            <div class="subsection-heading">
              <h3 id="subject-title" tabindex="-1">选择学科</h3>
              <button
                v-if="selectedSubjectId"
                type="button"
                class="text-action"
                @click="filterBySubject(selectedSubjectId)"
              >
                查看全部学科
              </button>
            </div>

            <div v-if="subjectStatus === 'loading'" class="subject-skeletons" role="status" aria-live="polite">
              <span class="sr-only">正在加载学科…</span>
              <span v-for="index in 6" :key="index" class="subject-skeleton" aria-hidden="true"></span>
            </div>
            <div v-else-if="subjectStatus === 'error'" class="state-panel error-state" role="alert">
              <strong>学科列表没有加载成功</strong>
              <p>{{ subjectError }}</p>
              <el-button @click="loadSubjects">重新加载学科</el-button>
            </div>
            <div v-else-if="subjects.length" class="subject-list" role="group" aria-label="学科列表">
              <button
                v-for="subject in subjects"
                :key="subject.id"
                type="button"
                class="subject-button"
                :class="{ active: selectedSubjectId === subject.id }"
                :aria-pressed="selectedSubjectId === subject.id"
                @click="filterBySubject(subject.id)"
              >
                <span>{{ subject.display_name }}</span>
                <span v-if="selectedSubjectId === subject.id" class="selected-mark">已选择</span>
              </button>
            </div>
            <div v-else class="state-panel">
              <strong>暂时没有可选学科</strong>
              <p>请联系教师或管理员先配置学科与教材目录。</p>
            </div>
          </section>

          <form
            class="filter-panel"
            :class="{ 'is-student': !canUseSourceFilter }"
            aria-label="筛选课件"
            @submit.prevent="searchAnimations"
          >
            <label class="filter-field filter-search">
              <span>搜索课件</span>
              <el-input
                v-model="searchText"
                aria-label="搜索课件标题、关键词或章节"
                placeholder="输入标题、关键词或章节"
                clearable
                @clear="searchAnimations"
              >
                <template #append>
                  <el-button native-type="submit">搜索</el-button>
                </template>
              </el-input>
            </label>

            <label v-if="canUseSourceFilter" class="filter-field">
              <span>课件来源</span>
              <el-select
                v-model="selectedSourceType"
                aria-label="按课件来源筛选"
                placeholder="全部来源"
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
            </label>

            <label ref="textbookField" class="filter-field">
              <span>教材章节</span>
              <el-cascader
                ref="textbookCascader"
                v-model="selectedTextbookPath"
                aria-label="按教材章节筛选"
                :options="textbookOptions"
                :props="textbookProps"
                :loading="textbookStatus === 'loading'"
                :disabled="!selectedSubjectId || textbookStatus === 'error'"
                clearable
                filterable
                :placeholder="textbookPlaceholder"
                @change="filterByTextbook"
              />
            </label>

            <div class="filter-actions">
              <el-button native-type="button" @click="resetFilters">清除全部筛选</el-button>
            </div>

            <div v-if="textbookStatus === 'error'" class="filter-error" role="alert">
              <span>{{ textbookError }}</span>
              <button type="button" class="text-action" @click="loadTextbookTree">重新加载章节</button>
            </div>
          </form>

          <div v-if="hasActiveFilters" class="active-filters" aria-label="当前筛选条件">
            <span class="active-filter-title">当前筛选</span>
            <button
              v-if="selectedSubjectName"
              type="button"
              class="filter-chip"
              :aria-label="`移除学科筛选：${selectedSubjectName}`"
              @click="clearFilter('subject')"
            >
              学科：{{ selectedSubjectName }} <span aria-hidden="true">×</span>
            </button>
            <button
              v-if="canUseSourceFilter && selectedSourceLabel"
              type="button"
              class="filter-chip"
              :aria-label="`移除来源筛选：${selectedSourceLabel}`"
              @click="clearFilter('source')"
            >
              来源：{{ selectedSourceLabel }} <span aria-hidden="true">×</span>
            </button>
            <button
              v-if="selectedTextbookLabel"
              type="button"
              class="filter-chip"
              :aria-label="`移除章节筛选：${selectedTextbookLabel}`"
              @click="clearFilter('textbook')"
            >
              章节：{{ selectedTextbookLabel }} <span aria-hidden="true">×</span>
            </button>
            <button
              v-if="searchText"
              type="button"
              class="filter-chip"
              :aria-label="`移除关键词筛选：${searchText}`"
              @click="clearFilter('search')"
            >
              关键词：{{ searchText }} <span aria-hidden="true">×</span>
            </button>
          </div>

          <div class="resource-toolbar">
            <h3>课件列表</h3>
            <el-radio-group v-model="viewMode" size="large" class="view-mode-toggle" aria-label="课件显示方式">
              <el-radio-button value="grid">卡片视图</el-radio-button>
              <el-radio-button value="list">列表视图</el-radio-button>
            </el-radio-group>
          </div>

          <div v-if="resourceStatus === 'loading'" class="resource-loading" role="status" aria-live="polite">
            <span class="sr-only">正在加载课件资源…</span>
            <div v-for="index in 8" :key="index" class="resource-skeleton" aria-hidden="true">
              <span></span><span></span><span></span>
            </div>
          </div>

          <div v-else-if="resourceStatus === 'error'" class="state-panel resource-state error-state" role="alert">
            <strong>课件资源没有加载成功</strong>
            <p>{{ resourceError }}</p>
            <el-button type="primary" @click="loadAnimations">重新加载课件</el-button>
          </div>

          <div v-else-if="!animations.length" class="state-panel resource-state">
            <strong>{{ hasActiveFilters ? '没有找到符合条件的课件' : '暂时没有已发布课件' }}</strong>
            <p>{{ hasActiveFilters ? '可以清除筛选，或换一个学科、章节和关键词。' : '课件发布后会显示在这里。' }}</p>
            <el-button v-if="hasActiveFilters" type="primary" @click="resetFilters">清除筛选并查看全部</el-button>
          </div>

          <div v-else-if="viewMode === 'grid'" class="resource-grid">
            <article v-for="animation in animations" :key="animation.id" class="resource-card">
              <RouterLink
                class="resource-card-button"
                :to="`/animations/${animation.id}`"
                :aria-label="`打开课件：${animation.title}`"
              >
                <span class="thumbnail">
                  <img
                    v-if="animation.thumbnail"
                    :src="resolveAssetUrl(animation.thumbnail)"
                    :alt="`${animation.title}课件缩略图`"
                    loading="lazy"
                  />
                  <span v-else class="thumbnail-fallback" aria-hidden="true">
                    <span v-if="canUseSourceFilter" class="thumbnail-format">
                      {{ formatSourceType(animation.source_type) }}
                    </span>
                    <span>{{ animation.subject_name || '互动课件' }}</span>
                  </span>
                </span>
                <span class="resource-body">
                  <strong>{{ animation.title }}</strong>
                  <span class="resource-path">{{ animation.textbook_path || '未标注教材章节' }}</span>
                  <span class="resource-meta">
                    <span v-if="canUseSourceFilter">{{ formatSourceType(animation.source_type) }}</span>
                    <span>{{ animation.view_count }} 次观看</span>
                    <span v-if="animation.avg_rating">评分 {{ animation.avg_rating }}</span>
                  </span>
                  <span class="resource-open" aria-hidden="true">打开课件</span>
                </span>
              </RouterLink>
            </article>
          </div>

          <div v-else class="resource-list">
            <article v-for="animation in animations" :key="animation.id" class="resource-row">
              <RouterLink
                class="resource-row-button"
                :to="`/animations/${animation.id}`"
                :aria-label="`打开课件：${animation.title}`"
              >
                <span class="resource-row-main">
                  <strong>{{ animation.title }}</strong>
                  <span>{{ animation.textbook_path || '未标注教材章节' }}</span>
                  <span class="resource-description">{{ animation.description || '该课件暂无补充说明' }}</span>
                </span>
                <span class="resource-row-meta">
                  <span>{{ animation.subject_name || '未分类' }}</span>
                  <span v-if="canUseSourceFilter">{{ formatSourceType(animation.source_type) }}</span>
                  <span>{{ animation.view_count }} 次观看</span>
                  <span aria-hidden="true">打开课件</span>
                </span>
              </RouterLink>
            </article>
          </div>

          <nav v-if="resourceStatus === 'success' && totalAnimations > pageSize" class="pagination-shell" aria-label="课件分页">
            <el-pagination
              v-model:current-page="currentPage"
              :page-size="pageSize"
              :total="totalAnimations"
              layout="prev, pager, next"
              background
              @current-change="handlePageChange"
            />
          </nav>
        </section>
      </div>
    </el-main>
  </el-container>
</template>

<script setup>
import { computed, nextTick, onMounted, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { useUserStore } from '../stores/user'
import axios from 'axios'
import { ElMessage } from 'element-plus'
import { resolveAssetUrl } from '../utils/apiBase'

const route = useRoute()
const router = useRouter()
const userStore = useUserStore()

const subjects = ref([])
const textbookOptions = ref([])
const animations = ref([])
const recentAnimations = ref([])
const textbookField = ref(null)
const textbookCascader = ref(null)
const totalAnimations = ref(0)
const searchText = ref('')
const selectedSubjectId = ref(null)
const selectedSourceType = ref('')
const selectedTextbookPath = ref([])
const viewMode = ref(localStorage.getItem('home_view_mode') || 'grid')
const currentPage = ref(1)

const subjectStatus = ref('loading')
const subjectError = ref('')
const textbookStatus = ref('idle')
const textbookError = ref('')
const resourceStatus = ref('loading')
const resourceError = ref('')
const recentStatus = ref('loading')
const recentError = ref('')

const pageSize = 20
let resourceRequestId = 0

const sourceOptions = [
  { label: 'PhET', value: 'phet' },
  { label: 'GeoGebra', value: 'geogebra' },
  { label: '原创课件', value: 'original' }
]
const validSourceTypes = sourceOptions.map(item => item.value)
const canUseSourceFilter = computed(() => ['teacher', 'admin'].includes(userStore.user?.role))
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
  if (!value) return []
  const items = Array.isArray(value) ? value : String(value).split(',')
  return items
    .map(item => Number.parseInt(item, 10))
    .filter(item => Number.isFinite(item) && item > 0)
}

const describeRequestError = (error, fallback) => {
  if (typeof navigator !== 'undefined' && navigator.onLine === false) {
    return '当前网络不可用。恢复连接后请重新加载。'
  }
  if (error.response?.status === 401) {
    return '登录状态已失效，请重新登录后再试。'
  }
  if (error.response?.status === 403) {
    return '当前账户没有读取这些内容的权限。'
  }
  return fallback
}

const buildHomeQuery = () => {
  const query = {}
  if (currentPage.value > 1) query.page = String(currentPage.value)
  if (selectedSubjectId.value) query.subject = String(selectedSubjectId.value)
  if (canUseSourceFilter.value && selectedSourceType.value) query.source = selectedSourceType.value
  if (selectedTextbookPath.value.length) query.textbook = selectedTextbookPath.value.join(',')
  if (searchText.value.trim()) query.search = searchText.value.trim()
  if (viewMode.value !== 'grid') query.view = viewMode.value
  return query
}

const applyRouteState = () => {
  currentPage.value = parsePositiveInt(route.query.page, 1)
  selectedSubjectId.value = route.query.subject ? parsePositiveInt(route.query.subject, null) : null
  selectedSourceType.value = canUseSourceFilter.value && typeof route.query.source === 'string' && validSourceTypes.includes(route.query.source)
    ? route.query.source
    : ''
  selectedTextbookPath.value = normalizeTextbookPath(route.query.textbook)
  searchText.value = typeof route.query.search === 'string' ? route.query.search : ''
  const queryViewMode = typeof route.query.view === 'string' ? route.query.view : ''
  if (['grid', 'list'].includes(queryViewMode)) viewMode.value = queryViewMode
}

const syncRouteState = async () => {
  const nextQuery = buildHomeQuery()
  const currentQuery = { ...route.query }
  if (JSON.stringify(currentQuery) === JSON.stringify(nextQuery)) return false
  await router.replace({ path: '/home', query: nextQuery })
  return true
}

const selectedSubjectName = computed(() => {
  return subjects.value.find(item => item.id === selectedSubjectId.value)?.display_name || ''
})

const selectedTextbookLabel = computed(() => {
  if (!selectedTextbookPath.value.length || !textbookOptions.value.length) return ''
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

const hasActiveFilters = computed(() => Boolean(
  selectedSubjectId.value ||
  selectedSourceType.value ||
  selectedTextbookPath.value.length ||
  searchText.value.trim()
))

const textbookPlaceholder = computed(() => {
  if (!selectedSubjectId.value) return '请先选择学科'
  if (textbookStatus.value === 'loading') return '正在加载教材目录'
  if (textbookStatus.value === 'error') return '教材目录加载失败'
  if (!textbookOptions.value.length) return '该学科暂未配置目录'
  return '选择教材章节'
})

const formatSourceType = (sourceType) => {
  if (sourceType === 'phet') return 'PhET'
  if (sourceType === 'geogebra') return 'GeoGebra'
  if (sourceType === 'original') return '原创课件'
  return '其他课件'
}

const loadSubjects = async () => {
  subjectStatus.value = 'loading'
  subjectError.value = ''
  try {
    const response = await axios.get('/api/animations/subjects')
    subjects.value = Array.isArray(response.data) ? response.data : []
    subjectStatus.value = 'success'
  } catch (error) {
    subjects.value = []
    subjectStatus.value = 'error'
    subjectError.value = describeRequestError(error, '服务器暂时没有响应，请稍后重新加载。')
  }
}

const loadRecentAnimations = async () => {
  recentStatus.value = 'loading'
  recentError.value = ''
  try {
    const response = await axios.get('/api/animations/recent', { params: { limit: 4 } })
    recentAnimations.value = Array.isArray(response.data) ? response.data : []
    recentStatus.value = 'success'
  } catch (error) {
    recentAnimations.value = []
    recentStatus.value = 'error'
    recentError.value = describeRequestError(error, '服务器暂时没有响应，请稍后重新加载。')
  }
}

const loadTextbookTree = async () => {
  textbookError.value = ''
  if (!selectedSubjectId.value) {
    textbookOptions.value = []
    textbookStatus.value = 'idle'
    return
  }

  textbookStatus.value = 'loading'
  try {
    const response = await axios.get('/api/animations/textbook-tree', {
      params: { subject_id: selectedSubjectId.value }
    })
    textbookOptions.value = Array.isArray(response.data) ? response.data : []
    textbookStatus.value = 'success'
  } catch (error) {
    textbookOptions.value = []
    textbookStatus.value = 'error'
    textbookError.value = describeRequestError(error, '教材目录暂时无法读取，请重新加载。')
  }
}

const buildAnimationParams = () => {
  const params = {
    limit: pageSize,
    skip: (currentPage.value - 1) * pageSize,
    is_published: true
  }
  if (selectedSubjectId.value) params.subject_id = selectedSubjectId.value
  if (selectedTextbookPath.value.length) {
    params.textbook_node_id = selectedTextbookPath.value[selectedTextbookPath.value.length - 1]
  }
  if (selectedSourceType.value) params.source_type = selectedSourceType.value
  if (searchText.value.trim()) params.search = searchText.value.trim()
  return params
}

const loadAnimations = async () => {
  const requestId = ++resourceRequestId
  resourceStatus.value = 'loading'
  resourceError.value = ''
  const params = buildAnimationParams()

  try {
    const [countResponse, listResponse] = await Promise.all([
      axios.get('/api/animations/count', { params }),
      axios.get('/api/animations/', { params })
    ])
    if (requestId !== resourceRequestId) return
    totalAnimations.value = countResponse.data.total || 0
    animations.value = Array.isArray(listResponse.data) ? listResponse.data : []
    resourceStatus.value = 'success'
  } catch (error) {
    if (requestId !== resourceRequestId) return
    totalAnimations.value = 0
    animations.value = []
    resourceStatus.value = 'error'
    resourceError.value = describeRequestError(error, '服务器暂时没有响应，请检查连接后重新加载。')
  }
}

const filterBySubject = async (subjectId) => {
  selectedSubjectId.value = selectedSubjectId.value === subjectId ? null : subjectId
  selectedTextbookPath.value = []
  textbookOptions.value = []
  currentPage.value = 1
  const routeChanged = await syncRouteState()
  if (!routeChanged) await Promise.all([loadTextbookTree(), loadAnimations()])
}

const filterByTextbook = async () => {
  currentPage.value = 1
  const routeChanged = await syncRouteState()
  if (!routeChanged) await loadAnimations()
}

const filterBySource = async () => {
  currentPage.value = 1
  const routeChanged = await syncRouteState()
  if (!routeChanged) await loadAnimations()
}

const searchAnimations = async () => {
  currentPage.value = 1
  const routeChanged = await syncRouteState()
  if (!routeChanged) await loadAnimations()
}

const resetFilters = async () => {
  selectedSubjectId.value = null
  selectedSourceType.value = ''
  selectedTextbookPath.value = []
  searchText.value = ''
  textbookOptions.value = []
  textbookStatus.value = 'idle'
  currentPage.value = 1
  const routeChanged = await syncRouteState()
  if (!routeChanged) await loadAnimations()
}

const clearFilter = async (filterName) => {
  if (filterName === 'subject') {
    selectedSubjectId.value = null
    selectedTextbookPath.value = []
    textbookOptions.value = []
    textbookStatus.value = 'idle'
  }
  if (filterName === 'source') selectedSourceType.value = ''
  if (filterName === 'textbook') selectedTextbookPath.value = []
  if (filterName === 'search') searchText.value = ''

  currentPage.value = 1
  const routeChanged = await syncRouteState()
  if (!routeChanged) await loadAnimations()
}

const handlePageChange = async (page) => {
  currentPage.value = page
  const routeChanged = await syncRouteState()
  if (!routeChanged) await loadAnimations()
  window.scrollTo({
    top: document.getElementById('resource-directory')?.offsetTop || 0,
    behavior: window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth'
  })
}

const openAnimation = (animation) => {
  router.push(`/animations/${animation.id}`)
}

const scrollToDirectory = () => {
  const heading = document.getElementById('directory-title')
  heading?.scrollIntoView({
    behavior: window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth',
    block: 'start'
  })
  heading?.focus({ preventScroll: true })
}

const focusLearningSelection = async () => {
  if (!selectedSubjectId.value) {
    const subjectHeading = document.getElementById('subject-title')
    subjectHeading?.scrollIntoView({
      behavior: window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth',
      block: 'center'
    })
    subjectHeading?.focus({ preventScroll: true })
    return
  }

  textbookField.value?.scrollIntoView({
    behavior: window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth',
    block: 'center'
  })
  await nextTick()
  textbookCascader.value?.focus()
  textbookCascader.value?.togglePopperVisible?.(true)
}

const handleLogout = async () => {
  await userStore.logout()
  ElMessage.success('已安全退出登录')
  router.push('/login')
}

onMounted(async () => {
  if (!['grid', 'list'].includes(viewMode.value)) viewMode.value = 'grid'
  applyRouteState()
  const routeChanged = await syncRouteState()
  await Promise.all([loadSubjects(), loadRecentAnimations()])
  if (!routeChanged) await Promise.all([loadTextbookTree(), loadAnimations()])
})

watch(viewMode, async (value) => {
  localStorage.setItem('home_view_mode', value)
  await syncRouteState()
})

watch(
  () => [
    route.query.subject,
    route.query.source,
    route.query.textbook,
    route.query.search,
    route.query.page
  ],
  async () => {
    applyRouteState()
    await Promise.all([loadTextbookTree(), loadAnimations()])
  }
)

watch(
  () => route.query.view,
  (value) => {
    const normalizedView = value === 'list' ? 'list' : 'grid'
    if (normalizedView !== viewMode.value) viewMode.value = normalizedView
  }
)
</script>

<style scoped>
.home-shell {
  --home-bg: var(--app-bg, #f3f8fd);
  --home-surface: var(--app-surface-strong, rgba(255, 255, 255, 0.92));
  --home-border: var(--app-border, rgba(84, 125, 173, 0.18));
  --home-border-strong: var(--app-border-strong, rgba(43, 168, 196, 0.35));
  --home-ink: var(--app-text, #10233f);
  --home-muted: #5b7290;
  --home-primary: var(--app-primary, #1661ff);
  min-height: 100vh;
  background: var(--home-bg);
  color: var(--home-ink);
}

.home-header {
  height: auto;
  min-height: 76px;
  padding: 12px 24px;
  background: #10233f;
  border-bottom: 1px solid rgba(245, 251, 255, 0.24);
  box-shadow: none;
  backdrop-filter: none;
}

.page-header-bar {
  width: min(1240px, 100%);
  margin: 0 auto;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 20px;
}

.page-header-copy h1 {
  margin: 0;
  color: #f5fbff;
  font-size: 20px;
  line-height: 1.4;
  letter-spacing: 0;
}

.page-header-copy p {
  margin: 4px 0 0;
  color: rgba(245, 251, 255, 0.82);
  font-size: 13px;
  line-height: 1.6;
}

.page-header-actions {
  display: flex;
  align-items: center;
  justify-content: flex-end;
  gap: 10px;
  flex-wrap: wrap;
}

.user-summary {
  color: #f5fbff;
  font-size: 13px;
  line-height: 1.6;
}

.home-shell :deep(.el-main) {
  padding: 0;
}

.home-content {
  width: min(1240px, 100%);
  margin: 0 auto;
  padding: 28px 24px 48px;
}

.section-heading,
.subsection-heading,
.panel-heading,
.resource-toolbar {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 16px;
}

.section-heading h2,
.resource-toolbar h3,
.subsection-heading h3,
.panel-heading h3,
.chapter-panel h3 {
  margin: 0;
  color: var(--home-ink);
  text-wrap: balance;
}

.section-heading h2 {
  font-size: 20px;
  line-height: 1.35;
}

.section-heading p {
  max-width: 70ch;
  margin: 6px 0 0;
  color: var(--home-muted);
  font-size: 16px;
  line-height: 1.65;
  text-wrap: pretty;
}

.start-layout {
  margin-top: 18px;
  display: grid;
  grid-template-columns: minmax(0, 1.55fr) minmax(280px, 0.75fr);
  gap: 16px;
}

.continue-panel,
.chapter-panel,
.filter-panel,
.state-panel {
  border: 1px solid var(--home-border);
  border-radius: 16px;
  background: var(--home-surface);
}

.continue-panel,
.chapter-panel {
  min-width: 0;
  padding: 22px;
}

.continue-panel {
  min-height: 236px;
}

.continue-panel.is-empty {
  min-height: 0;
}

.chapter-panel {
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  background: #e6f0fb;
}

.chapter-panel .status-label,
.chapter-panel p {
  color: var(--home-ink);
}

.status-label,
.status-note,
.result-count,
.recent-list-title,
.active-filter-title {
  color: var(--home-muted);
  font-size: 13px;
  font-weight: 600;
  line-height: 1.6;
}

.panel-heading h3,
.chapter-panel h3 {
  margin-top: 6px;
  font-size: 20px;
  line-height: 1.45;
  overflow-wrap: anywhere;
}

.status-note {
  flex: 0 0 auto;
  padding: 4px 10px;
  border-radius: 999px;
  background: #e6f0fb;
  color: var(--home-primary);
}

.continue-path,
.chapter-panel p,
.empty-copy {
  margin: 12px 0 0;
  color: var(--home-muted);
  font-size: 16px;
  line-height: 1.65;
  overflow-wrap: anywhere;
}

.continue-action,
.chapter-action {
  min-height: 44px;
  margin-top: 18px;
}

.chapter-action {
  margin-top: auto;
  padding-top: 20px;
}

.recent-list {
  margin-top: 20px;
  padding-top: 16px;
  border-top: 1px solid var(--home-border);
}

.recent-list-title {
  display: block;
  margin-bottom: 4px;
}

.recent-link {
  width: 100%;
  min-height: 44px;
  padding: 9px 0;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
  border: 0;
  border-bottom: 1px solid var(--home-border);
  background: transparent;
  color: var(--home-ink);
  font: inherit;
  text-align: left;
  cursor: pointer;
}

.recent-link:last-child {
  border-bottom: 0;
}

.recent-link span:first-child {
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.recent-link span:last-child {
  flex: 0 0 auto;
  color: var(--home-primary);
  font-size: 13px;
  font-weight: 600;
}

.directory-section {
  margin-top: 40px;
  scroll-margin-top: 16px;
}

.directory-heading {
  align-items: flex-end;
}

.result-count {
  flex: 0 0 auto;
  color: var(--home-ink);
}

.subject-nav {
  margin-top: 22px;
}

.subsection-heading {
  align-items: center;
}

.subsection-heading h3,
.resource-toolbar h3 {
  font-size: 20px;
  line-height: 1.5;
}

.subject-list,
.subject-skeletons {
  margin-top: 12px;
  display: flex;
  flex-wrap: wrap;
  gap: 10px;
}

.subject-button,
.subject-skeleton {
  min-width: 112px;
  min-height: 48px;
  border-radius: 14px;
}

.subject-button {
  padding: 9px 14px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
  border: 1px solid var(--home-border);
  background: var(--home-surface);
  color: var(--home-ink);
  font-family: inherit;
  font-size: 16px;
  font-weight: 600;
  line-height: 1.5;
  cursor: pointer;
  transition: background-color 150ms ease, border-color 150ms ease, color 150ms ease;
}

.subject-button:hover {
  border-color: var(--home-border-strong);
  background: #f3f8fd;
}

.subject-button.active {
  border-color: var(--home-primary);
  background: #e6f0fb;
  color: var(--home-primary);
}

.selected-mark {
  font-size: 12px;
}

.filter-panel {
  margin-top: 20px;
  padding: 18px;
  display: grid;
  grid-template-columns: minmax(260px, 1.35fr) minmax(180px, 0.7fr) minmax(240px, 1fr) auto;
  align-items: end;
  gap: 16px;
}

.filter-panel.is-student {
  grid-template-columns: minmax(260px, 1.35fr) minmax(240px, 1fr) auto;
}

.filter-field {
  min-width: 0;
  display: grid;
  gap: 7px;
  color: var(--home-ink);
  font-size: 13px;
  font-weight: 600;
  line-height: 1.6;
}

.filter-field :deep(.el-select),
.filter-field :deep(.el-cascader) {
  width: 100%;
}

.filter-actions {
  display: flex;
}

.filter-error {
  grid-column: 1 / -1;
  min-height: 44px;
  padding: 10px 12px;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  border-radius: 14px;
  background: rgba(199, 55, 75, 0.1);
  color: var(--home-ink);
  font-size: 13px;
}

.text-action {
  min-height: 44px;
  padding: 8px 2px;
  border: 0;
  background: transparent;
  color: var(--home-primary);
  font-family: inherit;
  font-size: 13px;
  font-weight: 600;
  line-height: 1.5;
  cursor: pointer;
}

.active-filters {
  margin-top: 14px;
  display: flex;
  align-items: center;
  gap: 8px;
  flex-wrap: wrap;
}

.filter-chip {
  max-width: 100%;
  min-height: 44px;
  padding: 6px 10px;
  border: 1px solid var(--home-border);
  border-radius: 999px;
  background: #e6f0fb;
  color: var(--home-ink);
  font-size: 13px;
  line-height: 1.5;
  overflow-wrap: anywhere;
  font-family: inherit;
  cursor: pointer;
}

.resource-toolbar {
  margin-top: 28px;
  align-items: center;
}

.view-mode-toggle :deep(.el-radio-button__inner) {
  min-width: 104px;
  min-height: 44px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
}

.resource-grid,
.resource-loading {
  margin-top: 16px;
  display: grid;
  gap: 16px;
}

.resource-grid {
  grid-template-columns: repeat(auto-fill, minmax(250px, 300px));
  justify-content: start;
}

.resource-loading {
  grid-template-columns: repeat(auto-fit, minmax(250px, 1fr));
}

.resource-card,
.resource-skeleton,
.resource-row {
  min-width: 0;
  overflow: hidden;
  border: 1px solid var(--home-border);
  border-radius: 16px;
  background: var(--home-surface);
}

.resource-card {
  transition: transform 180ms cubic-bezier(0.22, 1, 0.36, 1), border-color 180ms ease, box-shadow 180ms ease;
}

.resource-card:hover {
  transform: translateY(-2px);
  border-color: var(--home-border-strong);
}

.resource-card-button,
.resource-row-button {
  width: 100%;
  padding: 0;
  border: 0;
  background: transparent;
  color: var(--home-ink);
  font: inherit;
  text-align: left;
  text-decoration: none;
  cursor: pointer;
}

.resource-card-button:focus-visible,
.resource-row-button:focus-visible {
  outline: 3px solid #1661ff;
  outline-offset: -3px;
}

.thumbnail {
  width: 100%;
  height: 164px;
  display: block;
  overflow: hidden;
  background: #e6f0fb;
}

.thumbnail img {
  width: 100%;
  height: 100%;
  display: block;
  object-fit: cover;
}

.thumbnail-fallback {
  width: 100%;
  height: 100%;
  padding: 18px;
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  justify-content: flex-end;
  gap: 10px;
  color: var(--home-ink);
  font-size: 20px;
  font-weight: 700;
}

.thumbnail-format {
  padding: 5px 9px;
  border-radius: 999px;
  background: var(--home-surface);
  color: var(--home-primary);
  font-size: 12px;
}

.resource-body {
  padding: 16px 18px 18px;
  display: grid;
  gap: 8px;
}

.resource-body strong,
.resource-row-main strong {
  color: var(--home-ink);
  font-size: 20px;
  line-height: 1.45;
  overflow-wrap: anywhere;
}

.resource-path,
.resource-description {
  color: var(--home-muted);
  font-size: 13px;
  line-height: 1.55;
  overflow-wrap: anywhere;
}

.resource-meta,
.resource-row-meta {
  display: flex;
  flex-wrap: wrap;
  gap: 6px 12px;
  color: var(--home-muted);
  font-size: 12px;
  line-height: 1.5;
}

.resource-open {
  color: var(--home-primary);
  font-size: 13px;
  font-weight: 700;
  line-height: 1.5;
}

.resource-list {
  margin-top: 16px;
  display: grid;
  gap: 10px;
}

.resource-row-button {
  min-height: 92px;
  padding: 16px 18px;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 24px;
}

.resource-row-button:hover {
  background: #f3f8fd;
}

.resource-row-main {
  min-width: 0;
  display: grid;
  gap: 5px;
}

.resource-row-meta {
  flex: 0 0 230px;
  justify-content: flex-end;
  text-align: right;
}

.resource-description {
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
  overflow: hidden;
}

.state-panel {
  padding: 20px;
  color: var(--home-ink);
}

.state-panel strong {
  display: block;
  font-size: 16px;
  line-height: 1.5;
}

.state-panel p,
.inline-message span {
  margin: 6px 0 0;
  color: var(--home-muted);
  font-size: 13px;
  line-height: 1.6;
}

.state-panel .el-button,
.inline-message .el-button {
  margin-top: 14px;
}

.resource-state {
  margin-top: 16px;
  min-height: 180px;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  text-align: center;
}

.error-state,
.error-message {
  border-color: rgba(199, 55, 75, 0.35);
  background: rgba(199, 55, 75, 0.08);
}

.inline-status,
.inline-message {
  margin-top: 18px;
}

.inline-status {
  min-height: 44px;
  display: flex;
  align-items: center;
  gap: 10px;
  color: var(--home-muted);
  font-size: 13px;
}

.status-dot {
  width: 10px;
  height: 10px;
  border-radius: 50%;
  background: var(--home-primary);
  animation: status-pulse 1.2s ease-in-out infinite;
}

.inline-message {
  padding: 14px;
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  border: 1px solid rgba(199, 55, 75, 0.35);
  border-radius: 14px;
}

.subject-skeleton,
.resource-skeleton span {
  background: #e6f0fb;
  animation: skeleton-pulse 1.4s ease-in-out infinite;
}

.resource-skeleton {
  min-height: 292px;
  padding: 18px;
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.resource-skeleton span:first-child {
  height: 148px;
  margin: -18px -18px 8px;
}

.resource-skeleton span:nth-child(2) {
  width: 76%;
  height: 18px;
  border-radius: 999px;
}

.resource-skeleton span:last-child {
  width: 58%;
  height: 13px;
  border-radius: 999px;
}

.pagination-shell {
  margin-top: 24px;
  display: flex;
  justify-content: center;
}

.home-shell :deep(.el-button) {
  min-height: 44px;
  border-radius: 14px !important;
  box-shadow: none !important;
}

.home-shell :deep(.el-button--primary) {
  border-color: var(--home-primary) !important;
  background: var(--home-primary) !important;
}

.home-shell :deep(.el-button--danger) {
  border-color: #c7374b !important;
  background: #c7374b !important;
}

.home-shell :deep(.el-input__wrapper),
.home-shell :deep(.el-select__wrapper),
.home-shell :deep(.el-cascader .el-input__wrapper) {
  min-height: 44px;
  border-radius: 14px !important;
  background: var(--home-surface) !important;
  backdrop-filter: none !important;
}

.home-shell :deep(.el-input__inner::placeholder) {
  color: var(--home-muted);
  opacity: 1;
}

.home-shell :deep(.el-radio-button__inner) {
  border-radius: 0;
  box-shadow: none !important;
}

.home-shell :deep(.el-radio-button:first-child .el-radio-button__inner) {
  border-radius: 14px 0 0 14px;
}

.home-shell :deep(.el-radio-button:last-child .el-radio-button__inner) {
  border-radius: 0 14px 14px 0;
}

.home-shell :deep(.el-radio-button__original-radio:checked + .el-radio-button__inner) {
  background: var(--home-primary);
  border-color: var(--home-primary);
}

.home-shell :deep(.el-pagination button),
.home-shell :deep(.el-pagination .number) {
  min-width: 44px;
  min-height: 44px;
}

button:focus-visible,
.directory-heading h2:focus-visible,
.subsection-heading h3:focus-visible,
.home-shell :deep(.el-button:focus-visible),
.home-shell :deep(.el-input__wrapper:focus-within),
.home-shell :deep(.el-select__wrapper:focus-within) {
  outline: 3px solid #1661ff;
  outline-offset: 2px;
}

.sr-only {
  position: absolute;
  width: 1px;
  height: 1px;
  padding: 0;
  margin: -1px;
  overflow: hidden;
  clip: rect(0, 0, 0, 0);
  white-space: nowrap;
  border: 0;
}

@keyframes status-pulse {
  0%, 100% { opacity: 0.45; }
  50% { opacity: 1; }
}

@keyframes skeleton-pulse {
  0%, 100% { opacity: 0.55; }
  50% { opacity: 1; }
}

@media (max-width: 1000px) {
  .page-header-bar {
    align-items: flex-start;
  }

  .filter-panel {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }

  .filter-actions {
    align-items: end;
  }

  .resource-row-meta {
    flex-basis: 190px;
  }
}

@media (max-width: 900px) {
  .home-header {
    padding: 12px 18px;
  }

  .page-header-bar,
  .start-layout {
    display: grid;
    grid-template-columns: 1fr;
  }

  .page-header-actions {
    width: auto;
    justify-content: flex-start;
  }

  .page-header-actions :deep(.el-button),
  .page-header-actions :deep(.el-button + .el-button) {
    width: auto;
    margin-left: 0;
  }

  .home-content {
    padding: 24px 18px 40px;
  }

  .continue-panel {
    min-height: 0;
  }

  .chapter-action {
    margin-top: 18px;
    padding-top: 0;
  }

  .resource-loading {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }
}

@media (max-width: 720px) {
  .section-heading,
  .directory-heading,
  .resource-toolbar,
  .resource-row-button {
    flex-direction: column;
    align-items: stretch;
  }

  .filter-panel,
  .resource-grid,
  .resource-loading {
    grid-template-columns: 1fr;
  }

  .filter-actions .el-button,
  .continue-action,
  .chapter-action,
  .view-mode-toggle {
    width: 100%;
  }

  .view-mode-toggle :deep(.el-radio-button) {
    width: 50%;
  }

  .view-mode-toggle :deep(.el-radio-button__inner) {
    width: 100%;
  }

  .resource-row-meta {
    flex-basis: auto;
    justify-content: flex-start;
    text-align: left;
  }

  .result-count {
    align-self: flex-start;
  }
}

@media (max-width: 520px) {
  .home-header,
  .home-content {
    padding-inline: 14px;
  }

  .page-header-actions :deep(.el-button),
  .page-header-actions :deep(.el-button + .el-button) {
    width: 100%;
    margin-left: 0;
  }

  .subject-list {
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }

  .subject-button {
    min-width: 0;
  }
}

@media (prefers-reduced-motion: reduce) {
  .subject-button,
  .resource-card {
    transition: none;
  }

  .resource-card:hover {
    transform: none;
  }

  .status-dot,
  .subject-skeleton,
  .resource-skeleton span {
    animation: none;
  }
}
</style>
