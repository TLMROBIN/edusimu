<template>
  <el-container class="admin-shell collection-manage">
    <el-header>
      <div class="page-header-bar">
        <div class="toolbox-heading">
          <ToolboxLink />
          <div class="page-header-copy">
            <h2>动画合集与首页 Banner</h2>
            <p>组合已发布课件，用封面和顺序组织首页推荐内容。</p>
          </div>
        </div>
        <div class="page-header-actions">
          <el-button @click="$router.push('/admin')">返回后台</el-button>
          <el-button type="danger" @click="handleLogout">退出</el-button>
        </div>
      </div>
    </el-header>

    <el-container class="content-layout">
      <el-aside width="168px" class="sidebar">
        <el-menu :default-active="$route.path" router>
          <el-menu-item index="/admin"><span>数据统计</span></el-menu-item>
          <el-menu-item index="/admin/animations"><span>动画管理</span></el-menu-item>
          <el-menu-item index="/admin/collections"><span>合集与 Banner</span></el-menu-item>
          <el-menu-item index="/admin/geogebra"><span>GeoGebra 制作</span></el-menu-item>
          <el-menu-item index="/admin/users"><span>用户管理</span></el-menu-item>
          <el-menu-item index="/admin/textbooks"><span>教材目录</span></el-menu-item>
        </el-menu>
      </el-aside>

      <el-main>
        <section class="collection-summary">
          <div>
            <h1>内容合集</h1>
            <p>首页按数字从小到大展示 Banner；合集内课件按选择顺序排列。</p>
          </div>
          <el-button type="primary" @click="openCreateDialog">新建合集</el-button>
        </section>

        <section class="collection-list" aria-labelledby="collection-list-title">
          <div class="list-heading">
            <h2 id="collection-list-title">合集列表</h2>
            <span>{{ collections.length }} 个合集 · {{ bannerCount }} 个首页 Banner</span>
          </div>

          <div v-if="status === 'loading'" class="collection-state" role="status">正在加载合集…</div>
          <div v-else-if="status === 'error'" class="collection-state error-state" role="alert">
            <strong>合集没有加载成功</strong>
            <p>{{ errorMessage }}</p>
            <el-button @click="loadCollections">重新加载</el-button>
          </div>
          <div v-else-if="!collections.length" class="collection-state">
            <strong>还没有动画合集</strong>
            <p>新建合集并添加课件，上传封面后即可设置为首页 Banner。</p>
            <el-button type="primary" @click="openCreateDialog">创建第一个合集</el-button>
          </div>

          <div v-else class="responsive-table">
            <el-table :data="collections" style="width: 100%; min-width: 980px">
              <el-table-column label="合集" min-width="280">
                <template #default="scope">
                  <div class="collection-cell">
                    <img
                      v-if="scope.row.cover_image"
                      :src="resolveAssetUrl(scope.row.cover_image)"
                      :alt="`${scope.row.title}合集封面`"
                    />
                    <span v-else class="cover-placeholder">暂无封面</span>
                    <div>
                      <strong>{{ scope.row.title }}</strong>
                      <p>{{ scope.row.description || '暂无合集说明' }}</p>
                    </div>
                  </div>
                </template>
              </el-table-column>
              <el-table-column prop="animation_count" label="已发布课件" width="110" align="center">
                <template #default="scope">{{ scope.row.animation_count }} 个</template>
              </el-table-column>
              <el-table-column label="首页 Banner" width="160">
                <template #default="scope">
                  <el-tag v-if="scope.row.is_banner" type="success">展示中 · 第 {{ scope.row.banner_order + 1 }} 位</el-tag>
                  <el-tag v-else type="info">未展示</el-tag>
                </template>
              </el-table-column>
              <el-table-column label="操作" width="280" fixed="right">
                <template #default="scope">
                  <div class="table-actions">
                    <el-button size="small" @click="previewCollection(scope.row)">预览</el-button>
                    <el-button size="small" type="primary" plain @click="openEditDialog(scope.row)">编辑</el-button>
                    <el-button size="small" type="danger" plain @click="deleteCollection(scope.row)">删除</el-button>
                  </div>
                </template>
              </el-table-column>
            </el-table>
          </div>
        </section>

        <el-dialog
          v-model="dialogVisible"
          :title="editingId ? '编辑合集' : '新建合集'"
          width="min(680px, calc(100% - 24px))"
          :close-on-click-modal="false"
          :close-on-press-escape="!saving"
          :show-close="!saving"
          @closed="resetForm"
        >
          <el-form label-position="top" v-loading="dialogLoading" :disabled="saving || dialogLoading">
            <el-form-item label="合集名称" required>
              <el-input v-model="form.title" maxlength="200" show-word-limit placeholder="例如：高中物理力学实验" />
            </el-form-item>
            <el-form-item label="合集说明">
              <el-input
                v-model="form.description"
                type="textarea"
                :rows="3"
                maxlength="500"
                show-word-limit
                placeholder="说明适合的章节、学习目标或课堂使用场景"
              />
            </el-form-item>
            <el-form-item label="收录课件" required>
              <el-select
                v-model="form.animation_ids"
                multiple
                filterable
                collapse-tags
                collapse-tags-tooltip
                :multiple-limit="100"
                placeholder="搜索并选择已发布课件，按点选顺序排列"
                style="width: 100%"
              >
                <el-option
                  v-for="animation in animations"
                  :key="animation.id"
                  :label="animation.title"
                  :value="animation.id"
                >
                  <span>{{ animation.title }}</span>
                  <span class="option-meta">{{ animation.subject_name || '未分类' }}</span>
                </el-option>
              </el-select>
              <span class="field-hint">仅显示已发布课件，最多选择 100 个；下架课件会自动从学生合集页隐藏。</span>
            </el-form-item>
            <el-form-item label="Banner 封面">
              <div class="cover-editor">
                <img v-if="coverPreview" :src="coverPreview" alt="合集封面预览" />
                <div v-else class="cover-preview-empty">建议上传 16:5 横幅图片</div>
                <div>
                  <input ref="coverInput" type="file" accept="image/jpeg,image/png,image/gif,image/webp" @change="handleCoverChange" />
                  <p class="field-hint">支持 JPG、PNG、GIF、WebP，不超过 5MB。开启首页 Banner 前必须上传。</p>
                </div>
              </div>
            </el-form-item>
            <div class="banner-settings">
              <el-form-item label="展示到首页 Banner">
                <el-switch v-model="form.is_banner" />
              </el-form-item>
              <el-form-item v-if="form.is_banner" label="Banner 顺序（从 0 开始）">
                <el-input-number v-model="form.banner_order" :min="0" :max="9999" />
              </el-form-item>
            </div>
          </el-form>
          <template #footer>
            <el-button :disabled="saving" @click="dialogVisible = false">取消</el-button>
            <el-button type="primary" :disabled="dialogLoading" :loading="saving" @click="saveCollection">保存合集</el-button>
          </template>
        </el-dialog>
      </el-main>
    </el-container>
  </el-container>
</template>

<script setup>
import { computed, onBeforeUnmount, onMounted, ref } from 'vue'
import { useRouter } from 'vue-router'
import axios from 'axios'
import { ElMessage, ElMessageBox } from 'element-plus'
import { useUserStore } from '../stores/user'
import { resolveAssetUrl } from '../utils/apiBase'

const router = useRouter()
const userStore = useUserStore()
const collections = ref([])
const animations = ref([])
const status = ref('loading')
const errorMessage = ref('')
const dialogVisible = ref(false)
const dialogLoading = ref(false)
const saving = ref(false)
const editingId = ref(null)
const existingCover = ref('')
const coverFile = ref(null)
const coverPreview = ref('')
const coverInput = ref(null)
let objectPreviewUrl = ''
let selectedAnimationIds = []

const emptyForm = () => ({
  title: '',
  description: '',
  animation_ids: [],
  is_banner: false,
  banner_order: 0
})
const form = ref(emptyForm())
const bannerCount = computed(() => collections.value.filter(item => item.is_banner).length)

const loadCollections = async () => {
  status.value = 'loading'
  errorMessage.value = ''
  try {
    const response = await axios.get('/api/collections/')
    collections.value = response.data
    status.value = 'success'
  } catch (error) {
    status.value = 'error'
    errorMessage.value = error.response?.data?.detail || '服务器暂时没有响应，请稍后重试。'
  }
}

const loadAnimations = async () => {
  try {
    const limit = 100
    for (let skip = 0; ; skip += limit) {
      const { data } = await axios.get('/api/animations/', {
        params: { is_published: true, skip, limit }
      })
      animations.value = [...new Map([...animations.value, ...data].map(item => [item.id, item])).values()]
      if (data.length < limit) break
    }
  } catch (error) {
    ElMessage.error('已发布课件加载失败，请刷新页面后重试')
  }
}

const clearObjectPreview = () => {
  if (objectPreviewUrl) URL.revokeObjectURL(objectPreviewUrl)
  objectPreviewUrl = ''
}

const resetForm = () => {
  clearObjectPreview()
  editingId.value = null
  existingCover.value = ''
  coverFile.value = null
  coverPreview.value = ''
  form.value = emptyForm()
  selectedAnimationIds = []
  if (coverInput.value) coverInput.value.value = ''
}

const openCreateDialog = () => {
  resetForm()
  form.value.banner_order = collections.value.length
  dialogVisible.value = true
}

const openEditDialog = async (collection) => {
  resetForm()
  editingId.value = collection.id
  existingCover.value = collection.cover_image || ''
  coverPreview.value = resolveAssetUrl(collection.cover_image || '')
  form.value = {
    title: collection.title,
    description: collection.description || '',
    animation_ids: [],
    is_banner: collection.is_banner,
    banner_order: collection.banner_order
  }
  dialogVisible.value = true
  dialogLoading.value = true
  try {
    const response = await axios.get(`/api/collections/${collection.id}`)
    if (!dialogVisible.value || editingId.value !== collection.id) return
    selectedAnimationIds = response.data.animations.map(item => item.id)
    form.value.animation_ids = [...selectedAnimationIds]
  } catch (error) {
    ElMessage.error(error.response?.data?.detail || '合集详情加载失败')
    dialogVisible.value = false
  } finally {
    dialogLoading.value = false
  }
}

const handleCoverChange = (event) => {
  const file = event.target.files?.[0]
  if (!file) return
  if (!file.type.startsWith('image/')) {
    ElMessage.error('请选择图片文件')
    event.target.value = ''
    return
  }
  if (file.size > 5 * 1024 * 1024) {
    ElMessage.error('封面图片不能超过 5MB')
    event.target.value = ''
    return
  }
  clearObjectPreview()
  coverFile.value = file
  objectPreviewUrl = URL.createObjectURL(file)
  coverPreview.value = objectPreviewUrl
}

const saveCollection = async () => {
  if (dialogLoading.value || saving.value) return
  if (!form.value.title.trim()) {
    ElMessage.error('请填写合集名称')
    return
  }
  if (form.value.is_banner && !form.value.animation_ids.length) {
    ElMessage.error('首页 Banner 至少需要一个已发布课件')
    return
  }
  if (form.value.is_banner && !existingCover.value && !coverFile.value) {
    ElMessage.error('请先选择 Banner 封面图片')
    return
  }

  saving.value = true
  const wasEditing = Boolean(editingId.value)
  const payload = {
    title: form.value.title.trim(),
    description: form.value.description.trim() || null,
    is_banner: form.value.is_banner,
    banner_order: form.value.banner_order ?? 0
  }
  if (!wasEditing || selectedAnimationIds.length !== form.value.animation_ids.length ||
      selectedAnimationIds.some((id, index) => id !== form.value.animation_ids[index])) {
    payload.animation_ids = [...form.value.animation_ids]
  }
  const needsCoverBeforeBanner = payload.is_banner && !existingCover.value && coverFile.value

  try {
    const initialPayload = needsCoverBeforeBanner ? { ...payload, is_banner: false } : payload
    const saved = editingId.value
      ? (await axios.put(`/api/collections/${editingId.value}`, initialPayload)).data
      : (await axios.post('/api/collections/', initialPayload)).data
    editingId.value = saved.id
    selectedAnimationIds = saved.animations.map(item => item.id)

    if (coverFile.value) {
      const formData = new FormData()
      formData.append('cover', coverFile.value)
      const { data } = await axios.post(`/api/collections/${saved.id}/cover`, formData)
      existingCover.value = data.cover_image
      coverPreview.value = resolveAssetUrl(data.cover_image)
      coverFile.value = null
      clearObjectPreview()
      if (coverInput.value) coverInput.value.value = ''
    }
    if (needsCoverBeforeBanner) {
      await axios.put(`/api/collections/${saved.id}`, { is_banner: true })
    }

    ElMessage.success(wasEditing ? '合集已保存' : '合集已创建')
    dialogVisible.value = false
    await loadCollections()
  } catch (error) {
    ElMessage.error(error.response?.data?.detail || '合集保存失败，请重试')
    await loadCollections()
  } finally {
    saving.value = false
  }
}

const previewCollection = (collection) => {
  router.push(`/collections/${collection.id}`)
}

const deleteCollection = async (collection) => {
  try {
    await ElMessageBox.confirm(
      `确定删除“${collection.title}”吗？只会删除合集与封面，不会删除收录的课件。`,
      '删除合集',
      { type: 'warning', confirmButtonText: '删除合集', cancelButtonText: '取消' }
    )
    await axios.delete(`/api/collections/${collection.id}`)
    ElMessage.success('合集已删除')
    await loadCollections()
  } catch (error) {
    if (error !== 'cancel' && error !== 'close') {
      ElMessage.error(error.response?.data?.detail || '删除失败，请重试')
    }
  }
}

const handleLogout = async () => {
  if (!window.confirm('确定退出登录吗？')) return
  const redirectedToSso = await userStore.logout()
  if (redirectedToSso) return
  router.push('/login')
}

onMounted(() => {
  loadCollections()
  loadAnimations()
})
onBeforeUnmount(clearObjectPreview)
</script>

<style scoped>
.collection-manage {
  --collection-ink: #10233f;
  --collection-muted: #5f7694;
  --collection-border: rgba(84, 125, 173, 0.18);
  background: #f3f8fd;
}

.page-header-copy h2,
.page-header-copy p,
.collection-summary h1,
.collection-summary p,
.list-heading h2,
.list-heading span,
.collection-cell p,
.field-hint {
  margin: 0;
}

.page-header-copy h2 {
  color: #f5fbff;
  font-size: 20px;
}

.page-header-copy p {
  margin-top: 4px;
  color: rgba(245, 251, 255, 0.82);
  font-size: 13px;
}

.collection-summary,
.collection-list {
  border: 1px solid var(--collection-border);
  border-radius: 20px;
  background: rgba(255, 255, 255, 0.92);
}

.collection-summary {
  padding: 22px 24px;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 20px;
}

.collection-summary h1 {
  font-size: 22px;
  line-height: 1.4;
}

.collection-summary p {
  margin-top: 6px;
  color: var(--collection-muted);
  font-size: 14px;
  line-height: 1.6;
}

.collection-list {
  margin-top: 18px;
  padding: 20px;
}

.list-heading {
  margin-bottom: 18px;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
}

.list-heading h2 {
  font-size: 18px;
}

.list-heading span {
  color: var(--collection-muted);
  font-size: 13px;
}

.collection-cell {
  padding: 8px 0;
  display: flex;
  align-items: center;
  gap: 14px;
}

.collection-cell img,
.cover-placeholder {
  width: 128px;
  height: 72px;
  flex: 0 0 128px;
  border-radius: 12px;
}

.collection-cell img {
  object-fit: cover;
  background: #e6f0fb;
}

.cover-placeholder {
  display: grid;
  place-items: center;
  background: #e6f0fb;
  color: var(--collection-muted);
  font-size: 12px;
}

.collection-cell strong {
  color: var(--collection-ink);
  font-size: 15px;
}

.collection-cell p {
  max-width: 260px;
  margin-top: 5px;
  display: -webkit-box;
  overflow: hidden;
  color: var(--collection-muted);
  font-size: 12px;
  line-height: 1.5;
  -webkit-box-orient: vertical;
  -webkit-line-clamp: 2;
}

.table-actions {
  display: flex;
  gap: 6px;
}

.table-actions :deep(.el-button + .el-button) {
  margin-left: 0;
}

.collection-state {
  min-height: 220px;
  padding: 28px;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  color: var(--collection-ink);
  text-align: center;
}

.collection-state p {
  margin: 8px 0 16px;
  color: var(--collection-muted);
}

.error-state {
  color: #c7374b;
}

.option-meta {
  float: right;
  color: var(--collection-muted);
  font-size: 12px;
}

.field-hint {
  display: block;
  margin-top: 7px;
  color: var(--collection-muted);
  font-size: 12px;
  line-height: 1.6;
}

.cover-editor {
  width: 100%;
  display: grid;
  grid-template-columns: 220px minmax(0, 1fr);
  align-items: center;
  gap: 18px;
}

.cover-editor img,
.cover-preview-empty {
  width: 220px;
  aspect-ratio: 16 / 7;
  border-radius: 14px;
}

.cover-editor img {
  object-fit: cover;
  background: #e6f0fb;
}

.cover-preview-empty {
  display: grid;
  place-items: center;
  background: #e6f0fb;
  color: var(--collection-muted);
  font-size: 13px;
  text-align: center;
}

.banner-settings {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 16px;
}

.collection-manage :deep(.el-button) {
  min-height: 44px;
}

.collection-manage :deep(.el-button--small) {
  min-height: 36px;
}

.collection-manage :deep(.el-dialog) {
  max-width: calc(100vw - 32px);
}

@media (max-width: 720px) {
  .collection-summary,
  .list-heading {
    align-items: flex-start;
    flex-direction: column;
  }

  .collection-summary :deep(.el-button) {
    width: 100%;
  }

  .collection-summary,
  .collection-list {
    padding: 18px;
  }

  .cover-editor,
  .banner-settings {
    grid-template-columns: 1fr;
  }

  .cover-editor img,
  .cover-preview-empty {
    width: 100%;
  }
}
</style>
