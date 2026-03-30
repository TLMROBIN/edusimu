<template>
  <el-container class="admin-shell">
    <el-header>
      <div class="page-header-bar">
        <div class="page-header-copy">
          <h2 style="margin: 0">用户管理</h2>
          <div class="page-subtitle">
            支持按年级、班级筛选，支持模板下载、Excel 导入与用户名修正。
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
          <el-menu-item v-if="userStore.user?.role === 'admin'" index="/admin/textbooks">
            <span>教材目录</span>
          </el-menu-item>
        </el-menu>
      </el-aside>
      
      <el-main>
        <el-row :gutter="18" style="margin-bottom: 20px">
          <el-col :xs="12" :sm="12" :md="6">
            <el-card class="stats-card">
              <div class="stats-number">{{ userMetrics.total }}</div>
              <div class="stats-label">用户总数</div>
            </el-card>
          </el-col>
          <el-col :xs="12" :sm="12" :md="6">
            <el-card class="stats-card">
              <div class="stats-number">{{ userMetrics.students }}</div>
              <div class="stats-label">学生账号</div>
            </el-card>
          </el-col>
          <el-col :xs="12" :sm="12" :md="6">
            <el-card class="stats-card">
              <div class="stats-number">{{ userMetrics.teachers }}</div>
              <div class="stats-label">教师账号</div>
            </el-card>
          </el-col>
          <el-col :xs="12" :sm="12" :md="6">
            <el-card class="stats-card">
              <div class="stats-number">{{ userMetrics.active }}</div>
              <div class="stats-label">启用账号</div>
            </el-card>
          </el-col>
        </el-row>

        <section class="glass-panel manage-panel">
          <div class="section-title" style="margin-bottom: 18px">筛选与操作</div>
        <el-row :gutter="20">
          <el-col :xs="24" :sm="12" :md="6">
            <el-select v-model="filterGrade" placeholder="筛选年级" clearable @change="filterUsers">
              <el-option v-for="grade in uniqueGrades" :key="grade" :label="grade" :value="grade" />
            </el-select>
          </el-col>
          <el-col :xs="24" :sm="12" :md="6">
            <el-select v-model="filterClass" placeholder="筛选班级" clearable @change="filterUsers">
              <el-option v-for="cls in uniqueClasses" :key="cls" :label="cls" :value="cls" />
            </el-select>
          </el-col>
          <el-col :xs="24" :sm="12" :md="6">
            <el-input v-model="searchName" placeholder="搜索学生姓名" clearable @input="filterUsers" />
          </el-col>
          <el-col :xs="24" :sm="24" :md="6" class="user-actions-col">
            <el-button type="primary" @click="showCreateDialog = true">
              创建用户
            </el-button>
            <el-button type="success" @click="showBatchDialog = true">
              批量创建
            </el-button>
            <el-button type="info" @click="showExcelDialog = true">
              Excel导入
            </el-button>
            <el-button type="danger" @click="batchDelete" :disabled="selectedUsers.length === 0">
              批量删除 ({{ selectedUsers.length }})
            </el-button>
          </el-col>
        </el-row>
        </section>
        
        <div class="responsive-table">
        <el-table :data="filteredUsers" style="width: 100%" @selection-change="handleSelectionChange">
          <el-table-column type="selection" width="55" />
          <el-table-column prop="id" label="ID" width="80" />
          <el-table-column prop="username" label="用户名" width="150" />
          <el-table-column prop="real_name" label="姓名" width="150" />
          <el-table-column prop="grade_level" label="年级" width="120" />
          <el-table-column prop="class_name" label="班级" width="120" />
          <el-table-column prop="role" label="角色" width="100">
            <template #default="scope">
              <el-tag v-if="scope.row.role === 'student'">学生</el-tag>
              <el-tag v-else-if="scope.row.role === 'teacher'" type="success">教师</el-tag>
              <el-tag v-else type="danger">管理员</el-tag>
            </template>
          </el-table-column>
          <el-table-column prop="is_active" label="状态" width="100">
            <template #default="scope">
              <el-tag v-if="scope.row.is_active" type="success">正常</el-tag>
              <el-tag v-else type="danger">禁用</el-tag>
            </template>
          </el-table-column>
          <el-table-column label="操作">
            <template #default="scope">
              <el-button size="small" type="primary" plain @click="openEditDialog(scope.row)">编辑</el-button>
              <el-button size="small" @click="toggleActive(scope.row)">
                {{ scope.row.is_active ? '禁用' : '启用' }}
              </el-button>
              <el-button size="small" type="danger" @click="deleteUser(scope.row.id)">删除</el-button>
            </template>
          </el-table-column>
        </el-table>
        </div>
        
        <el-dialog v-model="showCreateDialog" title="创建用户" width="500px">
          <el-form :model="createForm" label-width="80px">
            <el-form-item label="用户名">
              <el-input v-model="createForm.username" />
            </el-form-item>
            <el-form-item label="密码">
              <el-input v-model="createForm.password" type="password" />
            </el-form-item>
            <el-form-item label="姓名">
              <el-input v-model="createForm.real_name" />
            </el-form-item>
            <el-form-item label="年级">
              <el-input v-model="createForm.grade_level" placeholder="如：2024级" />
            </el-form-item>
            <el-form-item label="班级">
              <el-input v-model="createForm.class_name" />
            </el-form-item>
            <el-form-item label="角色">
              <el-select v-model="createForm.role">
                <el-option label="学生" value="student" />
                <el-option label="教师" value="teacher" />
              </el-select>
            </el-form-item>
          </el-form>
          <template #footer>
            <el-button @click="showCreateDialog = false">取消</el-button>
            <el-button type="primary" @click="createUser">创建</el-button>
          </template>
        </el-dialog>

        <el-dialog v-model="showEditDialog" title="编辑用户" width="500px">
          <el-form :model="editForm" label-width="80px">
            <el-form-item label="用户名">
              <el-input v-model="editForm.username" />
            </el-form-item>
            <el-form-item label="姓名">
              <el-input v-model="editForm.real_name" />
            </el-form-item>
            <el-form-item label="年级">
              <el-input v-model="editForm.grade_level" placeholder="如：2024级" />
            </el-form-item>
            <el-form-item label="班级">
              <el-input v-model="editForm.class_name" />
            </el-form-item>
            <el-form-item label="角色">
              <el-select v-model="editForm.role">
                <el-option label="学生" value="student" />
                <el-option label="教师" value="teacher" />
                <el-option v-if="userStore.user?.role === 'admin'" label="管理员" value="admin" />
              </el-select>
            </el-form-item>
          </el-form>
          <template #footer>
            <el-button @click="showEditDialog = false">取消</el-button>
            <el-button type="primary" @click="updateUser">保存</el-button>
          </template>
        </el-dialog>
        
        <el-dialog v-model="showBatchDialog" title="批量创建用户" width="600px">
          <el-alert
            title="CSV格式：每行一个用户，格式为：用户名,密码,姓名,班级,角色(student/teacher)"
            type="info"
            style="margin-bottom: 20px"
          />
          <el-input
            v-model="batchText"
            type="textarea"
            :rows="10"
            placeholder="user1,pass1,张三,高一1班,student&#10;user2,pass2,李四,高一1班,student"
          />
          <template #footer>
            <el-button @click="showBatchDialog = false">取消</el-button>
            <el-button type="primary" @click="batchCreateUsers">批量创建</el-button>
          </template>
        </el-dialog>
        
        <el-dialog v-model="showExcelDialog" title="Excel导入学生" width="600px">
          <el-alert
            title="Excel模板只需要三列：姓名、年级、班级。用户名按姓名拼音+班级数字生成，密码默认123456。"
            type="info"
            style="margin-bottom: 20px"
            :closable="false"
          />
          <el-form label-width="100px">
            <el-form-item label="选择文件">
              <input type="file" ref="excelInput" accept=".xlsx,.xls" @change="handleExcelFileChange" />
            </el-form-item>
            <el-form-item label="下载模板">
              <el-button @click="downloadExcelTemplate">下载模板</el-button>
            </el-form-item>
            <el-form-item label="导入身份">
              <el-select v-model="excelImportRole">
                <el-option label="学生" value="student" />
                <el-option label="教师" value="teacher" />
              </el-select>
            </el-form-item>
            <el-form-item label="默认密码">
              <el-input v-model="defaultPassword" disabled />
            </el-form-item>
            <el-form-item label="预览数据" v-if="excelPreview.length > 0">
              <el-table :data="excelPreview" max-height="300" style="width: 100%">
                <el-table-column prop="real_name" label="姓名" width="120" />
                <el-table-column prop="grade_level" label="年级" width="100" />
                <el-table-column prop="class_name" label="班级" width="120" />
                <el-table-column prop="username" label="用户名" width="150" />
                <el-table-column prop="role" label="身份" width="100">
                  <template #default="scope">
                    {{ scope.row.role === 'teacher' ? '教师' : '学生' }}
                  </template>
                </el-table-column>
              </el-table>
            </el-form-item>
          </el-form>
          <template #footer>
            <el-button @click="resetExcelDialog">取消</el-button>
            <el-button @click="parseExcel" :disabled="!hasExcelFile">解析文件</el-button>
            <el-button type="primary" @click="importFromExcel" :disabled="excelPreview.length === 0">确认导入</el-button>
          </template>
        </el-dialog>
      </el-main>
    </el-container>
  </el-container>
</template>

<script setup>
import { ref, onMounted, computed } from 'vue'
import { useRouter } from 'vue-router'
import { useUserStore } from '../stores/user'
import axios from 'axios'
import { ElMessage, ElMessageBox } from 'element-plus'
import * as XLSX from 'xlsx'
import { pinyin } from 'pinyin-pro'

const router = useRouter()
const userStore = useUserStore()
const users = ref([])
const filteredUsers = ref([])
const selectedUsers = ref([])
const filterGrade = ref('')
const filterClass = ref('')
const searchName = ref('')
const showCreateDialog = ref(false)
const showEditDialog = ref(false)
const showBatchDialog = ref(false)
const showExcelDialog = ref(false)
const excelInput = ref(null)
const excelPreview = ref([])
const excelImportRole = ref('student')
const hasExcelFile = ref(false)
const defaultPassword = ref('123456')
const editingUserId = ref(null)
const createForm = ref({
  username: '',
  password: '',
  real_name: '',
  grade_level: '',
  class_name: '',
  role: 'student'
})
const editForm = ref({
  username: '',
  real_name: '',
  grade_level: '',
  class_name: '',
  role: 'student'
})
const batchText = ref('')

const uniqueClasses = computed(() => {
  const classes = new Set()
  users.value.forEach(user => {
    if (user.class_name) {
      classes.add(user.class_name)
    }
  })
  return Array.from(classes).sort()
})

const uniqueGrades = computed(() => {
  const grades = new Set()
  users.value.forEach(user => {
    if (user.grade_level) {
      grades.add(user.grade_level)
    }
  })
  return Array.from(grades).sort()
})

const userMetrics = computed(() => ({
  total: users.value.length,
  students: users.value.filter(user => user.role === 'student').length,
  teachers: users.value.filter(user => user.role === 'teacher').length,
  active: users.value.filter(user => user.is_active).length
}))

const normalizeCellValue = (value) => String(value ?? '').trim()

const buildBaseUsername = (realName, className) => {
  const classNumber = className.replace(/[^0-9]/g, '') || '1'
  const namePinyin = pinyin(realName, { toneType: 'none', type: 'array' })
    .join('')
    .toLowerCase()
    .replace(/[^a-z0-9]/g, '')

  return (namePinyin || 'user') + classNumber
}

const generateUniqueUsername = (baseUsername, usedUsernames) => {
  const trimmedBase = baseUsername.slice(0, 50) || 'user'
  if (!usedUsernames.has(trimmedBase)) {
    usedUsernames.add(trimmedBase)
    return trimmedBase
  }

  let suffix = 2
  while (suffix < 10000) {
    const suffixText = String(suffix)
    const candidate = trimmedBase.slice(0, 50 - suffixText.length) + suffixText
    if (!usedUsernames.has(candidate)) {
      usedUsernames.add(candidate)
      return candidate
    }
    suffix += 1
  }

  throw new Error(`无法为用户名 ${trimmedBase} 生成唯一值`)
}

const showBatchCreateResult = async (result, successTitle) => {
  const errors = result.errors || []
  const summary = result.message || successTitle

  if (errors.length === 0) {
    ElMessage.success(summary)
    return
  }

  await ElMessageBox.alert(
    [summary, ...errors.slice(0, 20)].join('\n'),
    result.created_count > 0 ? '部分成功' : '导入失败',
    {
      confirmButtonText: '知道了',
      type: result.created_count > 0 ? 'warning' : 'error'
    }
  )
}

const filterUsers = () => {
  let result = [...users.value]

  if (filterGrade.value) {
    result = result.filter(user => user.grade_level === filterGrade.value)
  }
  
  if (filterClass.value) {
    result = result.filter(user => user.class_name === filterClass.value)
  }
  
  if (searchName.value) {
    result = result.filter(user => 
      user.real_name?.includes(searchName.value) || 
      user.username?.includes(searchName.value)
    )
  }
  
  filteredUsers.value = result
}

const handleSelectionChange = (selection) => {
  selectedUsers.value = selection
}

const batchDelete = async () => {
  if (selectedUsers.value.length === 0) return
  
  try {
    await ElMessageBox.confirm(
      `确定要删除选中的 ${selectedUsers.value.length} 个用户吗？`,
      '批量删除确认',
      {
        confirmButtonText: '确定',
        cancelButtonText: '取消',
        type: 'warning'
      }
    )
    
    let successCount = 0
    for (const user of selectedUsers.value) {
      try {
        await axios.delete(`/api/users/${user.id}`)
        successCount++
      } catch (error) {
        console.error(`删除用户 ${user.username} 失败:`, error)
      }
    }
    
    ElMessage.success(`成功删除 ${successCount} 个用户`)
    selectedUsers.value = []
    loadUsers()
  } catch (error) {
    if (error !== 'cancel') {
      console.error('批量删除失败:', error)
    }
  }
}

const parseExcel = () => {
  const file = excelInput.value.files[0]
  if (!file) {
    ElMessage.warning('请先选择Excel文件')
    return
  }
  
  const reader = new FileReader()
  reader.onload = (e) => {
    try {
      const data = new Uint8Array(e.target.result)
      const workbook = XLSX.read(data, { type: 'array' })
      const sheetName = workbook.SheetNames[0]
      const worksheet = workbook.Sheets[sheetName]
      const jsonData = XLSX.utils.sheet_to_json(worksheet)

      const usedUsernames = new Set(
        users.value.map(user => user.username).filter(Boolean)
      )

      excelPreview.value = jsonData.map(row => {
        const realName = normalizeCellValue(row['学生姓名'] || row['姓名'])
        const gradeLevel = normalizeCellValue(row['年级'])
        const className = normalizeCellValue(row['班级'])

        if (!realName || !gradeLevel || !className) {
          return null
        }

        const username = generateUniqueUsername(
          buildBaseUsername(realName, className),
          usedUsernames
        )
        
        return {
          real_name: realName,
          grade_level: gradeLevel,
          class_name: className,
          username: username,
          password: defaultPassword.value,
          role: excelImportRole.value
        }
      }).filter(Boolean)
      
      if (excelPreview.value.length === 0) {
        ElMessage.warning('Excel文件中没有找到有效数据')
      } else {
        ElMessage.success(`成功解析 ${excelPreview.value.length} 条学生数据，已自动避开重名用户名`)
      }
    } catch (error) {
      console.error('解析Excel失败:', error)
      ElMessage.error('解析Excel文件失败，请检查文件格式')
    }
  }
  reader.readAsArrayBuffer(file)
}

const handleExcelFileChange = () => {
  hasExcelFile.value = Boolean(excelInput.value?.files?.[0])
  excelPreview.value = []
}

const resetExcelDialog = () => {
  showExcelDialog.value = false
  excelPreview.value = []
  hasExcelFile.value = false
  excelImportRole.value = 'student'
  if (excelInput.value) {
    excelInput.value.value = ''
  }
}

const downloadExcelTemplate = () => {
  const data = [
    { 姓名: '张三', 年级: '2024级', 班级: '高一1班' },
    { 姓名: '李四', 年级: '2024级', 班级: '高一2班' }
  ]
  const worksheet = XLSX.utils.json_to_sheet(data)
  const workbook = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(workbook, worksheet, '学生模板')
  XLSX.writeFile(workbook, '学生导入模板.xlsx')
}

const importFromExcel = async () => {
  if (excelPreview.value.length === 0) {
    ElMessage.warning('没有可导入的数据')
    return
  }
  
  try {
    await ElMessageBox.confirm(
      `确定要导入 ${excelPreview.value.length} 个学生账号吗？`,
      '导入确认',
      {
        confirmButtonText: '确定',
        cancelButtonText: '取消',
        type: 'info'
      }
    )
    
    const usersData = {
      users: excelPreview.value
    }
    
    const response = await axios.post('/api/users/batch-create', usersData)

    await showBatchCreateResult(response.data, '导入完成')
    resetExcelDialog()
    await loadUsers()
  } catch (error) {
    if (error !== 'cancel') {
      console.error('导入失败:', error)
      ElMessage.error(error.response?.data?.detail || '导入失败，请重试')
    }
  }
}

const loadUsers = async () => {
  try {
    const pageSize = 500
    let skip = 0
    const allUsers = []

    while (true) {
      const response = await axios.get('/api/users/', {
        params: { skip, limit: pageSize }
      })
      const pageUsers = response.data || []
      allUsers.push(...pageUsers)

      if (pageUsers.length < pageSize) {
        break
      }

      skip += pageSize
    }

    users.value = allUsers
    filterUsers()
  } catch (error) {
    console.error('加载用户失败:', error)
  }
}

const createUser = async () => {
  try {
    await axios.post('/api/users/', createForm.value)
    ElMessage.success('创建成功')
    showCreateDialog.value = false
    createForm.value = {
      username: '',
      password: '',
      real_name: '',
      grade_level: '',
      class_name: '',
      role: 'student'
    }
    loadUsers()
  } catch (error) {
    console.error('创建失败:', error)
    ElMessage.error('创建失败')
  }
}

const openEditDialog = (user) => {
  editingUserId.value = user.id
  editForm.value = {
    username: user.username || '',
    real_name: user.real_name || '',
    grade_level: user.grade_level || '',
    class_name: user.class_name || '',
    role: user.role || 'student'
  }
  showEditDialog.value = true
}

const updateUser = async () => {
  if (!editingUserId.value || !editForm.value.username) {
    ElMessage.error('请填写用户名')
    return
  }

  try {
    await axios.put(`/api/users/${editingUserId.value}`, editForm.value)
    ElMessage.success('用户信息已更新')
    showEditDialog.value = false
    loadUsers()
  } catch (error) {
    console.error('更新用户失败:', error)
    ElMessage.error(error.response?.data?.detail || '更新用户失败')
  }
}

const batchCreateUsers = async () => {
  const lines = batchText.value.trim().split('\n')
  const users_data = []
  
  for (const line of lines) {
    const [username, password, real_name, class_name, role] = line.split(',')
    if (username && password) {
      users_data.push({
        username: username.trim(),
        password: password.trim(),
        real_name: real_name?.trim() || '',
        class_name: class_name?.trim() || '',
        role: role?.trim() || 'student'
      })
    }
  }
  
  try {
    const response = await axios.post('/api/users/batch-create', {
      users: users_data
    })
    await showBatchCreateResult(response.data, '批量创建完成')
    showBatchDialog.value = false
    await loadUsers()
  } catch (error) {
    console.error('批量创建失败:', error)
    ElMessage.error(error.response?.data?.detail || '批量创建失败')
  }
}

const toggleActive = async (user) => {
  try {
    await axios.put(`/api/users/${user.id}`, {
      is_active: !user.is_active
    })
    ElMessage.success(user.is_active ? '已禁用' : '已启用')
    loadUsers()
  } catch (error) {
    console.error('操作失败:', error)
    ElMessage.error('操作失败')
  }
}

const deleteUser = async (id) => {
  try {
    await axios.delete(`/api/users/${id}`)
    ElMessage.success('删除成功')
    loadUsers()
  } catch (error) {
    console.error('删除失败:', error)
    ElMessage.error('删除失败')
  }
}

const handleLogout = async () => {
  await userStore.logout()
  ElMessage.success('已退出登录')
  router.push('/login')
}

onMounted(() => {
  loadUsers()
})
</script>

<style scoped>
.page-subtitle {
  margin-top: 6px;
  color: rgba(235, 246, 255, 0.78);
  font-size: 13px;
}

.manage-panel {
  padding: 18px;
  margin-bottom: 18px;
}

.user-actions-col {
  display: flex;
  justify-content: flex-end;
  gap: 8px;
  flex-wrap: wrap;
}

@media (max-width: 900px) {
  .user-actions-col {
    justify-content: stretch;
  }

  .user-actions-col .el-button {
    width: 100%;
    margin-left: 0;
  }
}
</style>
