<template>
  <el-container class="admin-shell">
    <el-header>
      <div class="page-header-bar">
        <div class="page-header-copy">
          <h2 style="margin: 0">教材目录管理</h2>
          <div style="margin-top: 6px; color: #666; font-size: 13px">
            管理各学科的册次、章节和小节。课件上传时只能绑定末级小节。
          </div>
        </div>
        <div class="page-header-actions">
          <el-button @click="$router.push('/admin')">返回后台</el-button>
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
          <el-menu-item index="/admin/users">
            <span>用户管理</span>
          </el-menu-item>
          <el-menu-item index="/admin/textbooks">
            <span>教材目录</span>
          </el-menu-item>
        </el-menu>
      </el-aside>

      <el-main>
        <section class="glass-panel textbook-summary">
          <div>
            <div class="section-title">教材目录中枢</div>
            <div class="textbook-summary-copy">
              管理册次、章节与小节结构，课件上传时只能绑定末级节点，保证章节统计口径稳定。
            </div>
          </div>
        </section>

        <section class="glass-panel textbook-filter-panel">
        <el-row :gutter="16">
          <el-col :xs="24" :sm="24" :md="8">
            <el-select v-model="selectedSubjectId" placeholder="选择学科" @change="loadTree" style="width: 100%">
              <el-option
                v-for="subject in subjects"
                :key="subject.id"
                :label="subject.display_name"
                :value="subject.id"
              />
            </el-select>
          </el-col>
          <el-col :xs="24" :sm="24" :md="16" class="textbook-actions-col">
            <el-button @click="openImportDialog">批量导入</el-button>
            <el-button type="primary" @click="openCreateDialog(null)">新增册次</el-button>
          </el-col>
        </el-row>
        </section>

        <el-card>
          <template #header>
            <span>目录树</span>
          </template>

          <el-tree
            v-if="treeData.length"
            :data="treeData"
            node-key="id"
            default-expand-all
            :expand-on-click-node="false"
          >
            <template #default="{ data }">
              <div class="tree-node-row">
                <div>
                  <span>{{ data.name }}</span>
                  <el-tag size="small" style="margin-left: 8px">{{ formatNodeType(data.node_type) }}</el-tag>
                </div>
                <div style="display: flex; gap: 8px; padding-right: 8px">
                  <el-button
                    v-if="data.node_type !== 'section'"
                    size="small"
                    type="primary"
                    plain
                    @click.stop="openCreateDialog(data)"
                  >
                    新增下级
                  </el-button>
                  <el-button size="small" @click.stop="openEditDialog(data)">重命名</el-button>
                  <el-button size="small" type="danger" @click.stop="deleteNode(data)">删除</el-button>
                </div>
              </div>
            </template>
          </el-tree>
          <el-empty v-else description="当前学科还没有目录，先新增册次" />
        </el-card>

        <el-dialog v-model="showCreateDialog" title="新增目录节点" width="460px">
          <el-form :model="createForm" label-width="90px">
            <el-form-item label="父节点">
              <el-input :model-value="createParentLabel" disabled />
            </el-form-item>
            <el-form-item label="节点类型">
              <el-input :model-value="createForm.node_type ? formatNodeType(createForm.node_type) : ''" disabled />
            </el-form-item>
            <el-form-item label="名称">
              <el-input v-model="createForm.name" />
            </el-form-item>
            <el-form-item label="排序">
              <el-input-number v-model="createForm.sort_order" :min="0" />
            </el-form-item>
          </el-form>
          <template #footer>
            <el-button @click="showCreateDialog = false">取消</el-button>
            <el-button type="primary" @click="createNode">保存</el-button>
          </template>
        </el-dialog>

        <el-dialog v-model="showEditDialog" title="编辑目录节点" width="460px">
          <el-form :model="editForm" label-width="90px">
            <el-form-item label="节点类型">
              <el-input :model-value="editForm.node_type ? formatNodeType(editForm.node_type) : ''" disabled />
            </el-form-item>
            <el-form-item label="名称">
              <el-input v-model="editForm.name" />
            </el-form-item>
            <el-form-item label="排序">
              <el-input-number v-model="editForm.sort_order" :min="0" />
            </el-form-item>
          </el-form>
          <template #footer>
            <el-button @click="showEditDialog = false">取消</el-button>
            <el-button type="primary" @click="updateNode">保存</el-button>
          </template>
        </el-dialog>

        <el-dialog v-model="showImportDialog" title="批量导入教材目录" width="760px">
          <el-form :model="importForm" label-width="110px">
            <el-form-item label="导入方式">
              <el-radio-group v-model="importForm.mode">
                <el-radio label="preset">导入系统预置目录</el-radio>
                <el-radio label="json">导入粘贴 JSON</el-radio>
              </el-radio-group>
            </el-form-item>
            <el-form-item label="覆盖现有目录">
              <el-switch v-model="importForm.replace_existing" />
              <div style="margin-left: 12px; color: #666; font-size: 12px">
                若当前学科已有课件绑定教材目录，系统会拒绝覆盖导入
              </div>
            </el-form-item>
            <el-form-item v-if="importForm.mode === 'json'" label="目录 JSON">
              <el-input
                v-model="importForm.jsonText"
                type="textarea"
                :rows="14"
                placeholder='示例：[{"name":"必修第一册","children":[{"name":"第一章","children":[{"name":"1.1 小节"}]}]}]'
              />
            </el-form-item>
            <el-alert
              v-if="importForm.mode === 'json'"
              type="info"
              :closable="false"
              title="JSON 结构要求：最外层是册次数组，每个册次包含 children 章节数组，每个章节可包含 children 小节数组。"
            />
          </el-form>
          <template #footer>
            <el-button @click="showImportDialog = false">取消</el-button>
            <el-button type="primary" @click="submitImport">开始导入</el-button>
          </template>
        </el-dialog>
      </el-main>
    </el-container>
  </el-container>
</template>

<script setup>
import { computed, onMounted, ref } from 'vue'
import { useRouter } from 'vue-router'
import { useUserStore } from '../stores/user'
import axios from 'axios'
import { ElMessage, ElMessageBox } from 'element-plus'

const router = useRouter()
const userStore = useUserStore()
const subjects = ref([])
const selectedSubjectId = ref(null)
const treeData = ref([])
const showCreateDialog = ref(false)
const showEditDialog = ref(false)
const showImportDialog = ref(false)
const parentNode = ref(null)
const editingNodeId = ref(null)
const createForm = ref({
  name: '',
  node_type: '',
  sort_order: 0
})
const editForm = ref({
  name: '',
  node_type: '',
  sort_order: 0
})
const importForm = ref({
  mode: 'preset',
  replace_existing: true,
  jsonText: ''
})

const createParentLabel = computed(() => {
  if (!parentNode.value) return '顶级'
  return parentNode.value.name
})

const formatNodeType = (type) => {
  const map = {
    book: '册次',
    chapter: '章节',
    section: '小节'
  }
  return map[type] || type
}

const nextNodeType = (parent) => {
  if (!parent) return 'book'
  if (parent.node_type === 'book') return 'chapter'
  if (parent.node_type === 'chapter') return 'section'
  return ''
}

const loadSubjects = async () => {
  try {
    const response = await axios.get('/api/animations/subjects')
    subjects.value = response.data
    if (!selectedSubjectId.value && response.data.length) {
      selectedSubjectId.value = response.data[0].id
    }
  } catch (error) {
    console.error('加载学科失败:', error)
  }
}

const loadTree = async () => {
  if (!selectedSubjectId.value) {
    treeData.value = []
    return
  }
  try {
    const response = await axios.get('/api/animations/textbook-tree', {
      params: { subject_id: selectedSubjectId.value }
    })
    treeData.value = response.data
  } catch (error) {
    console.error('加载教材目录失败:', error)
    ElMessage.error('加载教材目录失败')
  }
}

const openCreateDialog = (node) => {
  parentNode.value = node
  createForm.value = {
    name: '',
    node_type: nextNodeType(node),
    sort_order: 0
  }
  showCreateDialog.value = true
}

const openImportDialog = () => {
  if (!selectedSubjectId.value) {
    ElMessage.error('请先选择学科')
    return
  }
  importForm.value = {
    mode: 'preset',
    replace_existing: true,
    jsonText: ''
  }
  showImportDialog.value = true
}

const createNode = async () => {
  if (!selectedSubjectId.value || !createForm.value.name || !createForm.value.node_type) {
    ElMessage.error('请填写完整信息')
    return
  }
  try {
    await axios.post('/api/animations/textbook-nodes', {
      subject_id: selectedSubjectId.value,
      parent_id: parentNode.value?.id ?? null,
      name: createForm.value.name,
      node_type: createForm.value.node_type,
      sort_order: createForm.value.sort_order
    })
    ElMessage.success('目录节点已创建')
    showCreateDialog.value = false
    loadTree()
  } catch (error) {
    console.error('创建目录失败:', error)
    ElMessage.error(error.response?.data?.detail || '创建目录失败')
  }
}

const openEditDialog = (node) => {
  editingNodeId.value = node.id
  editForm.value = {
    name: node.name,
    node_type: node.node_type,
    sort_order: node.sort_order ?? 0
  }
  showEditDialog.value = true
}

const updateNode = async () => {
  if (!editingNodeId.value || !editForm.value.name) {
    ElMessage.error('请填写节点名称')
    return
  }
  try {
    await axios.put(`/api/animations/textbook-nodes/${editingNodeId.value}`, {
      name: editForm.value.name,
      sort_order: editForm.value.sort_order
    })
    ElMessage.success('目录节点已更新')
    showEditDialog.value = false
    loadTree()
  } catch (error) {
    console.error('更新目录失败:', error)
    ElMessage.error(error.response?.data?.detail || '更新目录失败')
  }
}

const deleteNode = async (node) => {
  try {
    await ElMessageBox.confirm(`确定删除“${node.name}”吗？`, '删除确认', {
      confirmButtonText: '确定',
      cancelButtonText: '取消',
      type: 'warning'
    })
    await axios.delete(`/api/animations/textbook-nodes/${node.id}`)
    ElMessage.success('目录节点已删除')
    loadTree()
  } catch (error) {
    if (error !== 'cancel') {
      console.error('删除目录失败:', error)
      ElMessage.error(error.response?.data?.detail || '删除目录失败')
    }
  }
}

const submitImport = async () => {
  if (!selectedSubjectId.value) {
    ElMessage.error('请先选择学科')
    return
  }

  let books = []
  if (importForm.value.mode === 'json') {
    if (!importForm.value.jsonText.trim()) {
      ElMessage.error('请粘贴目录 JSON')
      return
    }
    try {
      books = JSON.parse(importForm.value.jsonText)
      if (!Array.isArray(books)) {
        throw new Error('invalid')
      }
    } catch (error) {
      ElMessage.error('目录 JSON 格式不正确')
      return
    }
  }

  try {
    const response = await axios.post('/api/animations/textbook-import', {
      subject_id: selectedSubjectId.value,
      replace_existing: importForm.value.replace_existing,
      use_preset: importForm.value.mode === 'preset',
      books
    })
    ElMessage.success(response.data.message || '教材目录已导入')
    showImportDialog.value = false
    loadTree()
  } catch (error) {
    console.error('导入教材目录失败:', error)
    ElMessage.error(error.response?.data?.detail || '导入教材目录失败')
  }
}

const handleLogout = async () => {
  await userStore.logout()
  ElMessage.success('已退出登录')
  router.push('/login')
}

onMounted(async () => {
  await loadSubjects()
  await loadTree()
})
</script>

<style scoped>
.textbook-summary {
  margin-bottom: 18px;
  padding: 22px 24px;
}

.textbook-summary-copy {
  margin-top: 10px;
  color: var(--app-text-muted);
  line-height: 1.8;
}

.textbook-filter-panel {
  margin-bottom: 18px;
  padding: 18px;
}

.textbook-actions-col {
  display: flex;
  justify-content: flex-end;
  gap: 8px;
  flex-wrap: wrap;
}

.tree-node-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  width: 100%;
  gap: 12px;
  flex-wrap: wrap;
}

@media (max-width: 900px) {
  .textbook-actions-col {
    justify-content: stretch;
  }

  .textbook-actions-col .el-button {
    width: 100%;
    margin-left: 0;
  }

  .tree-node-row {
    align-items: flex-start;
  }
}
</style>
