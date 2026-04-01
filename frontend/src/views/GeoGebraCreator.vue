<template>
  <el-container class="admin-shell">
    <el-header>
      <div class="page-header-bar">
        <div class="page-header-copy">
          <h2 style="margin: 0">GeoGebra 课件制作</h2>
          <div style="margin-top: 6px; color: #dce9ff; font-size: 13px">
            左侧编写 GeoGebra 脚本与课件信息，右侧本地预览，通过后直接走现有课件上传流程。
          </div>
        </div>
        <div class="page-header-actions">
          <el-button @click="$router.push('/admin/animations')">返回动画管理</el-button>
          <el-button @click="handleLogout" type="danger">退出</el-button>
        </div>
      </div>
    </el-header>

    <el-container class="content-layout">
      <el-aside width="168px" class="sidebar">
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
          <el-menu-item v-if="isAdmin" index="/admin/users">
            <span>用户管理</span>
          </el-menu-item>
          <el-menu-item v-if="isAdmin" index="/admin/textbooks">
            <span>教材目录</span>
          </el-menu-item>
        </el-menu>
      </el-aside>

      <el-main class="creator-main">
        <section class="glass-panel creator-hero">
          <div>
            <div class="section-title">本地 GeoGebra 创作台</div>
            <div class="creator-hero-copy">
              课件会生成单个 HTML 文件，运行时统一引用站内 `/geogebra` 离线运行库，不加载任何外部资源。
            </div>
          </div>
          <div class="creator-hero-actions">
            <span class="summary-tag">{{ isEditing ? '编辑模式' : '新建模式' }}</span>
            <span class="summary-tag">{{ previewReady ? '预览已通过' : '待预览确认' }}</span>
            <span class="summary-tag">{{ runtimeChecking ? '检查中' : '可直接预览' }}</span>
          </div>
        </section>

        <div class="creator-grid">
          <section class="creator-column">
            <div class="glass-panel creator-panel">
              <div class="panel-section">
                <div class="section-title">课件信息</div>
                <el-form :model="form" label-width="90px" class="creator-form">
                  <el-form-item label="标题">
                    <el-input v-model="form.title" placeholder="如：三角形外接圆演示" />
                  </el-form-item>
                  <el-form-item label="学科">
                    <el-select v-model="form.subject_id" placeholder="选择学科" @change="handleSubjectChange">
                      <el-option
                        v-for="subject in subjects"
                        :key="subject.id"
                        :label="subject.display_name"
                        :value="subject.id"
                      />
                    </el-select>
                  </el-form-item>
                  <el-form-item label="教材目录">
                    <el-cascader
                      v-model="form.textbook_path_ids"
                      :options="textbookOptions"
                      :props="textbookProps"
                      filterable
                      placeholder="必须选择所属章节"
                    />
                  </el-form-item>
                  <el-form-item label="描述">
                    <el-input v-model="form.description" type="textarea" :rows="3" />
                  </el-form-item>
                  <el-form-item label="年级">
                    <el-input v-model="form.grade_level" placeholder="如：八年级 / 高一" />
                  </el-form-item>
                  <el-form-item label="关键词">
                    <el-input v-model="form.keywords" placeholder="用逗号分隔，如：几何,三角形,外接圆" />
                  </el-form-item>
                  <el-form-item v-if="isAdmin" label="直接发布">
                    <el-switch v-model="form.is_published" />
                  </el-form-item>
                </el-form>
              </div>

              <div class="panel-section">
                <div class="section-title">GeoGebra 配置</div>
                <el-form :model="form.settings" label-width="110px" class="creator-form compact-form">
                  <el-form-item label="应用模式">
                    <el-select v-model="form.settings.appName">
                      <el-option label="Classic" value="classic" />
                      <el-option label="Geometry" value="geometry" />
                      <el-option label="Graphing" value="graphing" />
                      <el-option label="3D" value="3d" />
                      <el-option label="Suite" value="suite" />
                    </el-select>
                  </el-form-item>
                  <el-form-item label="视图透镜">
                    <el-input v-model="form.settings.perspective" placeholder="可选，如 G / A，仅高级用法需要" />
                  </el-form-item>
                  <el-form-item label="显示工具栏">
                    <el-switch v-model="form.settings.showToolBar" />
                  </el-form-item>
                  <el-form-item label="代数输入栏">
                    <el-switch v-model="form.settings.showAlgebraInput" />
                  </el-form-item>
                  <el-form-item label="显示菜单栏">
                    <el-switch v-model="form.settings.showMenuBar" />
                  </el-form-item>
                  <el-form-item label="显示缩放按钮">
                    <el-switch v-model="form.settings.showZoomButtons" />
                  </el-form-item>
                  <el-form-item label="允许右键">
                    <el-switch v-model="form.settings.enableRightClick" />
                  </el-form-item>
                  <el-form-item label="允许拖拽标签">
                    <el-switch v-model="form.settings.enableLabelDrags" />
                  </el-form-item>
                  <el-form-item label="允许 Shift 缩放">
                    <el-switch v-model="form.settings.enableShiftDragZoom" />
                  </el-form-item>
                  <el-form-item label="显示网格">
                    <el-switch v-model="form.settings.showGrid" />
                  </el-form-item>
                  <el-form-item label="显示坐标轴">
                    <el-switch v-model="form.settings.showAxes" />
                  </el-form-item>
                  <el-form-item label="语言">
                    <el-input v-model="form.settings.language" maxlength="10" />
                  </el-form-item>
                  <el-form-item label="国家/地区">
                    <el-input v-model="form.settings.country" maxlength="10" />
                  </el-form-item>
                </el-form>

                <div class="coord-grid">
                  <label>
                    <span>X 最小</span>
                    <el-input v-model="form.settings.coordSystem.xmin" />
                  </label>
                  <label>
                    <span>X 最大</span>
                    <el-input v-model="form.settings.coordSystem.xmax" />
                  </label>
                  <label>
                    <span>Y 最小</span>
                    <el-input v-model="form.settings.coordSystem.ymin" />
                  </label>
                  <label>
                    <span>Y 最大</span>
                    <el-input v-model="form.settings.coordSystem.ymax" />
                  </label>
                </div>
              </div>

              <div class="panel-section">
                <div class="editor-header">
                  <div class="section-title">脚本编辑器</div>
                  <div class="editor-header-actions">
                  <el-button size="small" @click="resetScriptTemplate">恢复示例</el-button>
                    <el-button size="small" @click="copyScriptReference">复制 API 示例</el-button>
                  </div>
                </div>
                <div class="script-helper-text">
                  这里填写会在 `appletOnLoad` 后执行的 JavaScript，系统已注入 `api`（GeoGebra Apps API）和 `helpers` 辅助对象。
                </div>
                <el-input
                  v-model="form.script"
                  class="script-editor"
                  type="textarea"
                  :rows="22"
                  spellcheck="false"
                  resize="vertical"
                />
              </div>
            </div>
          </section>

          <section class="creator-column">
            <div class="glass-panel creator-panel preview-panel">
              <div class="preview-toolbar">
                <div>
                  <div class="section-title">实时预览</div>
                  <div class="preview-helper-text">
                    预览页与上传后的 HTML 使用同一套本地模板；确认右侧渲染无误后再上传。
                  </div>
                </div>
                <div class="preview-toolbar-actions">
                  <el-button :disabled="renderingPreview" @click="resetDraft">
                    {{ isEditing ? '还原当前课件' : '重置草稿' }}
                  </el-button>
                  <el-button :disabled="uploadingCourseware" @click="importGeoGebraLink">
                    导入线上链接
                  </el-button>
                  <el-button type="primary" :disabled="renderingPreview" @click="renderPreview">
                    {{ renderingPreview ? '生成中…' : '渲染预览' }}
                  </el-button>
                  <el-button
                    type="success"
                    :disabled="uploadingCourseware"
                    @click="saveCourseware"
                  >
                    {{ uploadingCourseware ? '提交中…' : isAdmin ? (isEditing ? '保存修改' : '保存到展示系统') : (isEditing ? '提交修改审核' : '提交审核') }}
                  </el-button>
                  <el-button
                    v-if="isAdmin"
                    type="warning"
                    :disabled="uploadingCourseware"
                    @click="publishCourseware"
                  >
                    {{ uploadingCourseware ? '发布中…' : '一键发布' }}
                  </el-button>
                </div>
              </div>

              <div class="preview-shell">
                <iframe
                  v-if="previewUrl"
                  ref="previewFrame"
                  :src="previewUrl"
                  class="preview-frame"
                  title="GeoGebra 课件预览"
                ></iframe>
                <div v-else class="preview-placeholder">
                  <div class="preview-placeholder-title">等待生成预览</div>
                  <div class="preview-placeholder-copy">点击“渲染预览”后，右侧会使用本地 GeoGebra 离线引擎直接呈现课件效果。</div>
                </div>
              </div>

              <div class="preview-log-shell">
                <div class="preview-log-header">
                  <div class="section-title">执行日志</div>
                  <el-button size="small" text @click="clearLogs">清空</el-button>
                </div>
                <div v-if="previewLogs.length" class="preview-log-list">
                  <div
                    v-for="log in previewLogs"
                    :key="log.id"
                    class="preview-log-item"
                    :data-level="log.level"
                  >
                    <span class="preview-log-time">{{ log.time }}</span>
                    <span class="preview-log-level">{{ formatLogLevel(log.level) }}</span>
                    <span class="preview-log-message">{{ log.message }}</span>
                  </div>
                </div>
                <div v-else class="preview-log-empty">
                  这里会显示 GeoGebra 加载、脚本执行和运行时错误信息。
                </div>
              </div>
            </div>
          </section>
        </div>
      </el-main>
    </el-container>
  </el-container>
</template>

<script setup>
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { ElMessage, ElMessageBox } from 'element-plus'
import axios from 'axios'
import { useUserStore } from '../stores/user'
import {
  DEFAULT_GEOGEBRA_SCRIPT,
  DEFAULT_GEOGEBRA_SETTINGS,
  GEOGEBRA_RUNTIME_SCRIPT_URL,
  GEOGEBRA_SOURCE_TYPE,
  buildGeoGebraCoursewareFile
} from '../utils/geogebraCourseware'

const DRAFT_STORAGE_KEY = 'edusimu-geogebra-draft-v1'
const MANIFEST_PATTERN = /<script id="edusimu-geogebra-manifest" type="application\/json">([\s\S]*?)<\/script>/i

const route = useRoute()
const router = useRouter()
const userStore = useUserStore()

const subjects = ref([])
const textbookOptions = ref([])
const previewFrame = ref(null)
const previewUrl = ref('')
const previewLogs = ref([])
const previewReady = ref(false)
const runtimeReady = ref(false)
const runtimeChecking = ref(true)
const renderingPreview = ref(false)
const uploadingCourseware = ref(false)
const editingAnimationId = ref(null)
const loadedAnimation = ref(null)
const hydratingDraft = ref(false)
let pendingThumbnailRequest = null

const textbookProps = {
  value: 'id',
  label: 'name',
  children: 'children',
  emitPath: true
}

const cloneSettings = () => JSON.parse(JSON.stringify(DEFAULT_GEOGEBRA_SETTINGS))

const createDefaultForm = () => ({
  title: 'GeoGebra 示例课件',
  subject_id: null,
  textbook_path_ids: [],
  description: '请在左侧修改标题、章节和脚本，然后点击“渲染预览”查看效果。',
  grade_level: '',
  keywords: 'GeoGebra,互动课件',
  is_published: false,
  settings: cloneSettings(),
  script: DEFAULT_GEOGEBRA_SCRIPT
})

const form = ref(createDefaultForm())

const isAdmin = computed(() => userStore.user?.role === 'admin')
const isEditing = computed(() => Number.isInteger(editingAnimationId.value) && editingAnimationId.value > 0)

const formatLogLevel = (level) => {
  const map = {
    info: '信息',
    success: '成功',
    warning: '处理中',
    error: '错误'
  }
  return map[level] || '日志'
}

const pushLog = (level, message) => {
  const now = new Date()
  previewLogs.value = [
    {
      id: `${Date.now()}_${Math.random().toString(16).slice(2)}`,
      level,
      message,
      time: now.toLocaleTimeString('zh-CN', { hour12: false })
    },
    ...previewLogs.value
  ].slice(0, 24)
}

const clearLogs = () => {
  previewLogs.value = []
}

const parsePositiveInt = (value) => {
  const parsed = Number.parseInt(value, 10)
  return Number.isFinite(parsed) && parsed > 0 ? parsed : null
}

const normalizeSettings = (settings = {}) => ({
  ...cloneSettings(),
  ...(settings || {}),
  coordSystem: {
    ...cloneSettings().coordSystem,
    ...(settings?.coordSystem || {})
  }
})

const buildNodePath = (nodes, targetId, path = []) => {
  for (const node of nodes) {
    const nextPath = [...path, node.id]
    if (node.id === targetId) {
      return nextPath
    }
    if (node.children?.length) {
      const childPath = buildNodePath(node.children, targetId, nextPath)
      if (childPath.length) {
        return childPath
      }
    }
  }
  return []
}

const parseManifestFromHtml = (htmlText = '') => {
  const matched = htmlText.match(MANIFEST_PATTERN)
  if (!matched?.[1]) {
    throw new Error('未找到 GeoGebra 课件清单，无法回填到编辑器。')
  }
  return JSON.parse(matched[1])
}

const dataUrlToFile = (dataUrl, filename = 'geogebra-thumbnail.png') => {
  const [header, payload] = String(dataUrl || '').split(',')
  const mimeMatch = header?.match(/data:(.*?);base64/)
  if (!mimeMatch || !payload) {
    throw new Error('缩略图数据格式无效。')
  }

  const binary = window.atob(payload)
  const buffer = new Uint8Array(binary.length)
  for (let index = 0; index < binary.length; index += 1) {
    buffer[index] = binary.charCodeAt(index)
  }

  return new File([buffer], filename, { type: mimeMatch[1] || 'image/png' })
}

const buildPayload = () => ({
  title: form.value.title,
  description: form.value.description,
  gradeLevel: form.value.grade_level,
  keywords: form.value.keywords,
  settings: form.value.settings,
  script: form.value.script
})

const revokePreviewUrl = () => {
  if (previewUrl.value) {
    URL.revokeObjectURL(previewUrl.value)
    previewUrl.value = ''
  }
}

const requestThumbnailCapture = () => new Promise((resolve, reject) => {
  if (!previewFrame.value?.contentWindow) {
    reject(new Error('预览窗口尚未就绪。'))
    return
  }

  const requestId = `thumb_${Date.now()}_${Math.random().toString(16).slice(2)}`
  const timeoutId = window.setTimeout(() => {
    if (pendingThumbnailRequest?.requestId === requestId) {
      pendingThumbnailRequest = null
    }
    reject(new Error('GeoGebra 缩略图截取超时。'))
  }, 4000)

  pendingThumbnailRequest = {
    requestId,
    resolve,
    reject,
    timeoutId
  }

  previewFrame.value.contentWindow.postMessage({
    type: 'EDUSIMU_CAPTURE_THUMBNAIL',
    requestId
  }, '*')
})

const captureThumbnailFile = async () => {
  if (!previewUrl.value) {
    return null
  }

  try {
    pushLog('info', '正在从预览自动截取缩略图…')
    const dataUrl = await requestThumbnailCapture()
    pushLog('success', '已生成 GeoGebra 缩略图。')
    return dataUrlToFile(dataUrl)
  } catch (error) {
    console.warn('GeoGebra 缩略图截取失败:', error)
    pushLog('warning', error.message || '缩略图截取失败，将使用系统默认缩略图。')
    return null
  }
}

const loadSubjects = async () => {
  try {
    const response = await axios.get('/api/animations/subjects')
    subjects.value = response.data
  } catch (error) {
    console.error('加载学科失败:', error)
    ElMessage.error('加载学科失败')
  }
}

const loadTextbookTree = async (subjectId) => {
  if (!subjectId) {
    textbookOptions.value = []
    return
  }
  try {
    const response = await axios.get('/api/animations/textbook-tree', {
      params: { subject_id: subjectId }
    })
    textbookOptions.value = response.data
  } catch (error) {
    console.error('加载教材目录失败:', error)
    textbookOptions.value = []
    ElMessage.error('加载教材目录失败')
  }
}

const handleSubjectChange = async () => {
  form.value.textbook_path_ids = []
  await loadTextbookTree(form.value.subject_id)
}

const loadExistingAnimation = async (animationId) => {
  hydratingDraft.value = true
  try {
    const response = await axios.get(`/api/animations/${animationId}`)
    const animation = response.data
    if (animation.source_type !== GEOGEBRA_SOURCE_TYPE) {
      throw new Error('当前课件不是 GeoGebra 类型，无法在此编辑。')
    }

    const fileResponse = await axios.get(animation.file_url || `/api/animations/${animation.id}/file`, {
      responseType: 'text'
    })
    const manifest = parseManifestFromHtml(fileResponse.data)

    editingAnimationId.value = animation.id
    loadedAnimation.value = animation
    form.value = {
      ...createDefaultForm(),
      title: animation.title || manifest.title || 'GeoGebra 课件',
      subject_id: animation.subject_id || null,
      textbook_path_ids: [],
      description: animation.description || manifest.description || '',
      grade_level: animation.grade_level || manifest.gradeLevel || '',
      keywords: animation.keywords || manifest.keywords || '',
      is_published: isAdmin.value ? !!animation.is_published : false,
      settings: normalizeSettings(manifest.settings),
      script: manifest.script || DEFAULT_GEOGEBRA_SCRIPT
    }

    await loadTextbookTree(form.value.subject_id)
    form.value.textbook_path_ids = animation.textbook_node_id
      ? buildNodePath(textbookOptions.value, animation.textbook_node_id)
      : []
    clearLogs()
    pushLog('info', `已载入课件《${animation.title}》进行编辑。`)
    await renderPreview()
  } finally {
    hydratingDraft.value = false
  }
}

const checkRuntime = async () => {
  runtimeChecking.value = true
  try {
    const response = await fetch(GEOGEBRA_RUNTIME_SCRIPT_URL, { cache: 'no-store' })
    runtimeReady.value = true
    if (!response.ok) {
      pushLog('warning', '本地 GeoGebra 运行库预检查未通过，渲染时将继续尝试加载。')
    }
  } catch (error) {
    runtimeReady.value = true
    pushLog('warning', '无法完成本地 GeoGebra 运行库预检查，渲染时将继续尝试加载。')
  } finally {
    runtimeChecking.value = false
  }
}

const renderPreview = async () => {
  if (!runtimeReady.value) {
    pushLog('warning', '本地 GeoGebra 运行库预检查未通过，继续尝试渲染预览。')
  }

  renderingPreview.value = true
  previewReady.value = false
  clearLogs()
  pushLog('info', '正在生成本地预览页面…')

  try {
    const file = buildGeoGebraCoursewareFile(buildPayload())
    revokePreviewUrl()
    previewUrl.value = URL.createObjectURL(file)
    pushLog('warning', '预览已刷新，等待 GeoGebra 引擎加载。')
  } catch (error) {
    console.error('生成预览失败:', error)
    pushLog('error', `生成预览失败：${error.message || error}`)
    ElMessage.error('生成预览失败')
  } finally {
    renderingPreview.value = false
  }
}

const validateBeforeUpload = () => {
  if (!form.value.title || !form.value.subject_id) {
    ElMessage.error('请填写标题并选择学科')
    return false
  }
  if (!form.value.textbook_path_ids.length) {
    ElMessage.error('请先选择所属章节')
    return false
  }
  if (!form.value.script.trim()) {
    ElMessage.error('请先填写 GeoGebra 脚本')
    return false
  }
  if (!previewUrl.value) {
    ElMessage.error('请先渲染预览并确认效果')
    return false
  }
  return true
}

const submitCourseware = async ({ publishRequested = false } = {}) => {
  if (!validateBeforeUpload()) {
    return
  }

  try {
    await ElMessageBox.confirm(
      previewReady.value
        ? (publishRequested ? '确认将当前 GeoGebra 课件一键发布到线上环境吗？' : '确认将当前 GeoGebra 课件保存到展示系统吗？')
        : '预览尚未反馈“执行完成”，仍要继续提交吗？',
      publishRequested ? '发布确认' : '提交确认',
      { type: previewReady.value ? (publishRequested ? 'success' : 'info') : 'warning' }
    )
  } catch {
    return
  }

  uploadingCourseware.value = true
  try {
    const file = buildGeoGebraCoursewareFile(buildPayload())
    const thumbnailFile = await captureThumbnailFile()
    let response
    const desiredPublishedState = publishRequested ? true : (isAdmin.value ? form.value.is_published : false)

    if (isEditing.value) {
      const replaceData = new FormData()
      replaceData.append('file', file)
      replaceData.append('title', form.value.title)
      replaceData.append('subject_id', form.value.subject_id)
      replaceData.append('textbook_node_id', form.value.textbook_path_ids[form.value.textbook_path_ids.length - 1])
      replaceData.append('description', form.value.description)
      replaceData.append('grade_level', form.value.grade_level)
      replaceData.append('keywords', form.value.keywords)
      replaceData.append('source_type', GEOGEBRA_SOURCE_TYPE)
      replaceData.append('is_published', desiredPublishedState)
      if (thumbnailFile) {
        replaceData.append('thumbnail', thumbnailFile)
      }

      response = await axios.post(
        `/api/animations/${editingAnimationId.value}/replace-file`,
        replaceData,
        { headers: { 'Content-Type': 'multipart/form-data' } }
      )
    } else {
      const formData = new FormData()
      formData.append('title', form.value.title)
      formData.append('subject_id', form.value.subject_id)
      formData.append('textbook_node_id', form.value.textbook_path_ids[form.value.textbook_path_ids.length - 1])
      formData.append('description', form.value.description)
      formData.append('grade_level', form.value.grade_level)
      formData.append('keywords', form.value.keywords)
      formData.append('source_type', GEOGEBRA_SOURCE_TYPE)
      formData.append('is_published', desiredPublishedState)
      formData.append('file', file)
      if (thumbnailFile) {
        formData.append('thumbnail', thumbnailFile)
      }

      response = await axios.post('/api/animations/', formData, {
        headers: { 'Content-Type': 'multipart/form-data' }
      })
    }

    const animation = response.data
    if (animation.validation_status === 'failed') {
      ElMessage.warning(animation.validation_summary || '课件已上传，但校验未通过')
    } else if (animation.review_status === 'pending_review') {
      ElMessage.success(isEditing.value ? 'GeoGebra 课件已更新，等待审核' : 'GeoGebra 课件提交成功，已进入待审核状态')
    } else {
      ElMessage.success(
        publishRequested
          ? (isEditing.value ? 'GeoGebra 课件已更新并一键发布' : 'GeoGebra 课件已一键发布')
          : (isEditing.value ? 'GeoGebra 课件已保存到展示系统' : 'GeoGebra 课件已保存到展示系统')
      )
    }

    router.push('/admin/animations')
  } catch (error) {
    console.error('上传 GeoGebra 课件失败:', error)
    ElMessage.error(error.response?.data?.detail || '上传 GeoGebra 课件失败')
  } finally {
    uploadingCourseware.value = false
  }
}

const saveCourseware = async () => {
  await submitCourseware({ publishRequested: false })
}

const publishCourseware = async () => {
  await submitCourseware({ publishRequested: true })
}

const importGeoGebraLink = async () => {
  if (!form.value.subject_id) {
    ElMessage.error('请先选择学科')
    return
  }
  if (!form.value.textbook_path_ids.length) {
    ElMessage.error('请先选择所属章节')
    return
  }

  let promptResult
  try {
    promptResult = await ElMessageBox.prompt(
      '请输入公开可访问的 GeoGebra 课件链接，系统会尝试下载并保存到本地课件系统。',
      '导入线上 GeoGebra 链接',
      {
        confirmButtonText: '开始导入',
        cancelButtonText: '取消',
        inputPlaceholder: 'https://www.geogebra.org/m/xxxxx',
        inputPattern: /^https?:\/\/.+/i,
        inputErrorMessage: '请输入有效的 http/https 链接'
      }
    )
  } catch {
    return
  }

  const link = String(promptResult.value || '').trim()
  if (!link) {
    return
  }

  uploadingCourseware.value = true
  try {
    const response = await axios.post('/api/animations/import-geogebra-link', {
      link,
      title: form.value.title?.trim() || undefined,
      subject_id: form.value.subject_id,
      textbook_node_id: form.value.textbook_path_ids[form.value.textbook_path_ids.length - 1],
      description: form.value.description?.trim() || undefined,
      grade_level: form.value.grade_level?.trim() || undefined,
      keywords: form.value.keywords?.trim() || undefined,
      is_published: isAdmin.value ? !!form.value.is_published : false
    })

    const animation = response.data
    if (animation.validation_status === 'failed') {
      ElMessage.warning(animation.validation_summary || 'GeoGebra 链接已导入，但校验未通过')
    } else if (animation.review_status === 'pending_review') {
      ElMessage.success('GeoGebra 链接已导入，等待审核')
    } else {
      ElMessage.success('GeoGebra 链接已导入到展示系统')
    }

    router.push('/admin/animations')
  } catch (error) {
    console.error('导入 GeoGebra 链接失败:', error)
    ElMessage.error(error.response?.data?.detail || '导入 GeoGebra 链接失败')
  } finally {
    uploadingCourseware.value = false
  }
}

const resetScriptTemplate = async () => {
  try {
    await ElMessageBox.confirm('确认用示例脚本覆盖当前脚本吗？', '恢复示例', {
      type: 'warning'
    })
    form.value.script = DEFAULT_GEOGEBRA_SCRIPT
    pushLog('info', '已恢复默认示例脚本。')
  } catch {
    // noop
  }
}

const copyScriptReference = async () => {
  const reference = `// 可直接使用的对象：
// api: GeoGebra Apps API 实例
// helpers.runCommands([...]): 顺序执行 GeoGebra 命令
// helpers.delay(ms): 异步等待
// helpers.setView({ xmin, xmax, ymin, ymax }): 调整坐标系

await helpers.runCommands([
  'A=(0,0)',
  'B=(4,0)',
  'C=(2,3)',
  'poly = Polygon(A, B, C)'
])

api.setColor('poly', 46, 134, 222)
helpers.setView({ xmin: -2, xmax: 8, ymin: -2, ymax: 6 })`

  try {
    await navigator.clipboard.writeText(reference)
    ElMessage.success('GeoGebra API 示例已复制')
  } catch (error) {
    console.error('复制失败:', error)
    ElMessage.error('复制失败')
  }
}

const resetDraft = async () => {
  try {
    await ElMessageBox.confirm(
      isEditing.value ? '确认丢弃当前改动并重新载入服务器上的 GeoGebra 课件吗？' : '确认清空当前草稿并恢复默认模板吗？',
      isEditing.value ? '还原课件' : '重置草稿',
      {
      type: 'warning'
      }
    )
    revokePreviewUrl()
    previewReady.value = false
    clearLogs()

    if (isEditing.value) {
      await loadExistingAnimation(editingAnimationId.value)
    } else {
      form.value = createDefaultForm()
      textbookOptions.value = []
      pushLog('info', '已重置 GeoGebra 草稿。')
    }
  } catch {
    // noop
  }
}

const persistDraft = () => {
  if (hydratingDraft.value || isEditing.value) {
    return
  }
  try {
    localStorage.setItem(DRAFT_STORAGE_KEY, JSON.stringify(form.value))
  } catch (error) {
    console.warn('保存 GeoGebra 草稿失败:', error)
  }
}

const restoreDraft = async () => {
  hydratingDraft.value = true
  try {
    const raw = localStorage.getItem(DRAFT_STORAGE_KEY)
    if (!raw) {
      return
    }
    const saved = JSON.parse(raw)
    form.value = {
      ...createDefaultForm(),
      ...saved,
      settings: {
        ...cloneSettings(),
        ...(saved.settings || {}),
        coordSystem: {
          ...cloneSettings().coordSystem,
          ...(saved.settings?.coordSystem || {})
        }
      }
    }

    if (form.value.subject_id) {
      await loadTextbookTree(form.value.subject_id)
    }
  } catch (error) {
    console.warn('恢复 GeoGebra 草稿失败:', error)
  } finally {
    hydratingDraft.value = false
  }
}

const handlePreviewMessage = (event) => {
  if (!previewFrame.value?.contentWindow || event.source !== previewFrame.value.contentWindow) {
    return
  }

  const { type, level, message } = event.data || {}
  if (type === 'GEOGEBRA_PREVIEW_LOG' && message) {
    pushLog(level || 'info', message)
  }
  if (type === 'GEOGEBRA_PREVIEW_READY') {
    previewReady.value = true
  }
  if (type === 'GEOGEBRA_THUMBNAIL_READY' && pendingThumbnailRequest) {
    if (event.data.requestId === pendingThumbnailRequest.requestId) {
      window.clearTimeout(pendingThumbnailRequest.timeoutId)
      pendingThumbnailRequest.resolve(event.data.dataUrl)
      pendingThumbnailRequest = null
    }
  }
  if (type === 'GEOGEBRA_THUMBNAIL_ERROR' && pendingThumbnailRequest) {
    if (event.data.requestId === pendingThumbnailRequest.requestId) {
      window.clearTimeout(pendingThumbnailRequest.timeoutId)
      pendingThumbnailRequest.reject(new Error(event.data.message || 'GeoGebra 缩略图生成失败'))
      pendingThumbnailRequest = null
    }
  }
}

const handleLogout = async () => {
  await userStore.logout()
  ElMessage.success('已退出登录')
  router.push('/login')
}

watch(form, persistDraft, { deep: true })

onMounted(async () => {
  window.addEventListener('message', handlePreviewMessage)
  await Promise.all([loadSubjects(), checkRuntime()])

  const animationId = parsePositiveInt(route.query.animationId)
  if (animationId) {
    try {
      await loadExistingAnimation(animationId)
    } catch (error) {
      console.error('载入 GeoGebra 课件失败:', error)
      ElMessage.error(error.message || '载入 GeoGebra 课件失败')
      router.replace('/admin/geogebra')
    }
    return
  }

  await restoreDraft()
})

onBeforeUnmount(() => {
  window.removeEventListener('message', handlePreviewMessage)
  if (pendingThumbnailRequest) {
    window.clearTimeout(pendingThumbnailRequest.timeoutId)
    pendingThumbnailRequest = null
  }
  revokePreviewUrl()
})
</script>

<style scoped>
.creator-main {
  min-width: 0;
}

.creator-hero {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
  padding: 22px 24px;
  margin-bottom: 16px;
  flex-wrap: wrap;
}

.creator-hero-copy {
  margin-top: 8px;
  font-size: 14px;
  color: var(--app-text-muted);
  line-height: 1.7;
}

.creator-hero-actions {
  display: flex;
  flex-wrap: wrap;
  gap: 10px;
}

.summary-tag {
  display: inline-flex;
  align-items: center;
  border-radius: 999px;
  padding: 8px 12px;
  background: rgba(22, 97, 255, 0.08);
  color: var(--app-primary);
  font-size: 13px;
  font-weight: 700;
}

.creator-grid {
  display: grid;
  grid-template-columns: minmax(0, 1.04fr) minmax(0, 1fr);
  gap: 16px;
}

.creator-column {
  min-width: 0;
}

.creator-panel {
  padding: 18px;
}

.panel-section + .panel-section {
  margin-top: 24px;
}

.creator-form :deep(.el-form-item) {
  margin-bottom: 16px;
}

.compact-form {
  margin-top: 14px;
}

.coord-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 12px;
  margin-top: 4px;
}

.coord-grid label {
  display: flex;
  flex-direction: column;
  gap: 6px;
  font-size: 13px;
  color: var(--app-text-muted);
}

.editor-header,
.preview-log-header,
.preview-toolbar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 14px;
  flex-wrap: wrap;
}

.editor-header-actions,
.preview-toolbar-actions {
  display: flex;
  align-items: center;
  gap: 10px;
  flex-wrap: wrap;
}

.script-helper-text,
.preview-helper-text {
  margin-top: 10px;
  font-size: 13px;
  line-height: 1.7;
  color: var(--app-text-muted);
}

.script-editor {
  margin-top: 12px;
}

.script-editor :deep(.el-textarea__inner) {
  min-height: 420px !important;
  font-family: "SFMono-Regular", "Consolas", "Monaco", monospace;
  font-size: 13px;
  line-height: 1.7;
}

.preview-panel {
  display: flex;
  flex-direction: column;
  gap: 16px;
  min-height: 0;
}

.preview-shell {
  min-height: 0;
  border-radius: 22px;
  overflow: hidden;
  border: 1px solid rgba(107, 141, 181, 0.18);
  background: linear-gradient(180deg, rgba(250, 252, 255, 0.9), rgba(239, 246, 255, 0.82));
  min-height: 600px;
}

.preview-frame {
  width: 100%;
  min-height: 600px;
  border: none;
  background: transparent;
}

.preview-placeholder {
  min-height: 600px;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  padding: 28px;
  text-align: center;
}

.preview-placeholder-title {
  font-size: 20px;
  font-weight: 700;
  color: var(--app-text);
}

.preview-placeholder-copy {
  max-width: 440px;
  margin-top: 10px;
  font-size: 14px;
  line-height: 1.7;
  color: var(--app-text-muted);
}

.preview-log-shell {
  border-radius: 20px;
  padding: 16px;
  background: rgba(248, 251, 255, 0.76);
  border: 1px solid rgba(107, 141, 181, 0.14);
}

.preview-log-list {
  margin-top: 12px;
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.preview-log-item {
  display: grid;
  grid-template-columns: 76px 56px 1fr;
  gap: 10px;
  align-items: start;
  padding: 10px 12px;
  border-radius: 14px;
  background: rgba(255, 255, 255, 0.8);
  border: 1px solid rgba(107, 141, 181, 0.14);
  font-size: 13px;
}

.preview-log-item[data-level='success'] {
  border-color: rgba(37, 168, 112, 0.22);
}

.preview-log-item[data-level='error'] {
  border-color: rgba(241, 91, 108, 0.22);
}

.preview-log-item[data-level='warning'] {
  border-color: rgba(230, 155, 45, 0.22);
}

.preview-log-time {
  color: var(--app-text-muted);
  font-variant-numeric: tabular-nums;
}

.preview-log-level {
  font-weight: 700;
  color: var(--app-primary);
}

.preview-log-message {
  color: var(--app-text);
  line-height: 1.6;
  word-break: break-word;
}

.preview-log-empty {
  margin-top: 14px;
  font-size: 13px;
  color: var(--app-text-muted);
  line-height: 1.7;
}

@media (max-width: 1280px) {
  .creator-grid {
    grid-template-columns: 1fr;
  }
}

@media (max-width: 768px) {
  .coord-grid {
    grid-template-columns: 1fr;
  }

  .preview-shell,
  .preview-frame,
  .preview-placeholder {
    min-height: 460px;
  }

  .preview-log-item {
    grid-template-columns: 1fr;
  }
}
</style>
