<template>
  <el-container class="profile-shell">
    <el-header>
      <div class="page-header-bar">
        <div class="page-header-copy">
          <h2 style="margin: 0">个人中心</h2>
          <div class="profile-subtitle">管理密码、收藏和观看历史。</div>
        </div>
        <div class="page-header-actions">
          <el-button @click="$router.push('/home')">返回首页</el-button>
          <el-button @click="handleLogout" type="danger">退出</el-button>
        </div>
      </div>
    </el-header>
    
    <el-main>
      <section class="glass-panel profile-hero">
        <div>
          <div class="section-title">个人工作区</div>
          <div class="profile-hero-copy">统一查看个人账号信息、收藏课件和历史使用记录。</div>
        </div>
      </section>

      <el-tabs v-model="activeTab">
        <el-tab-pane label="修改密码" name="password">
          <el-card style="max-width: 520px">
            <el-form :model="passwordForm" label-width="100px">
              <el-form-item label="当前密码">
                <el-input v-model="passwordForm.current_password" type="password" show-password />
              </el-form-item>
              <el-form-item label="新密码">
                <el-input v-model="passwordForm.new_password" type="password" show-password />
              </el-form-item>
              <el-form-item label="确认新密码">
                <el-input v-model="passwordForm.confirm_password" type="password" show-password />
              </el-form-item>
              <el-form-item>
                <el-button type="primary" @click="changePassword">修改密码</el-button>
              </el-form-item>
            </el-form>
          </el-card>
        </el-tab-pane>

        <el-tab-pane label="我的收藏" name="favorites">
          <el-row :gutter="20">
            <el-col :xs="24" :sm="12" :md="8" :lg="6" v-for="favorite in favorites" :key="favorite.id">
              <el-card class="animation-card" @click="playAnimation(favorite.animation_id)" shadow="hover">
                <div class="thumbnail">
                  <img
                    v-if="favorite.animation?.thumbnail"
                    :src="favorite.animation.thumbnail"
                    style="width: 100%; height: 100%; object-fit: cover"
                  />
                  <div v-else class="profile-thumbnail-fallback">
                    <div class="profile-thumbnail-badge">收藏课件</div>
                    <div class="profile-thumbnail-title">{{ favorite.animation?.subject_name || 'HTML' }}</div>
                  </div>
                </div>
                <div style="padding: 10px">
                  <h3 style="margin: 0">{{ favorite.animation?.title || '动画' }}</h3>
                </div>
              </el-card>
            </el-col>
          </el-row>
        </el-tab-pane>
        
        <el-tab-pane label="观看历史" name="history">
          <div class="responsive-table">
          <el-table :data="viewHistory" style="width: 100%">
            <el-table-column prop="animation_id" label="动画ID" width="100" />
            <el-table-column prop="view_duration" label="观看时长(秒)" width="120" />
            <el-table-column prop="interaction_count" label="交互次数" width="120" />
            <el-table-column prop="viewed_at" label="观看时间" />
          </el-table>
          </div>
        </el-tab-pane>
      </el-tabs>
    </el-main>
  </el-container>
</template>

<script setup>
import { ref, onMounted } from 'vue'
import { useRouter } from 'vue-router'
import { useUserStore } from '../stores/user'
import axios from 'axios'
import { ElMessage } from 'element-plus'

const router = useRouter()
const userStore = useUserStore()
const activeTab = ref('favorites')
const favorites = ref([])
const viewHistory = ref([])
const passwordForm = ref({
  current_password: '',
  new_password: '',
  confirm_password: ''
})

const loadFavorites = async () => {
  try {
    const response = await axios.get('/api/favorites/')
    favorites.value = response.data
  } catch (error) {
    console.error('加载收藏失败:', error)
  }
}

const loadViewHistory = async () => {
  try {
    const response = await axios.get('/api/stats/users/' + userStore.user.id)
    viewHistory.value = response.data.view_histories || []
  } catch (error) {
    console.error('加载历史失败:', error)
  }
}

const playAnimation = (id) => {
  router.push(`/animations/${id}`)
}

const changePassword = async () => {
  if (!passwordForm.value.current_password || !passwordForm.value.new_password) {
    ElMessage.error('请填写完整密码信息')
    return
  }
  if (passwordForm.value.new_password !== passwordForm.value.confirm_password) {
    ElMessage.error('两次输入的新密码不一致')
    return
  }

  try {
    await axios.post('/api/auth/change-password', {
      current_password: passwordForm.value.current_password,
      new_password: passwordForm.value.new_password
    })
    passwordForm.value = {
      current_password: '',
      new_password: '',
      confirm_password: ''
    }
    ElMessage.success('密码修改成功')
  } catch (error) {
    console.error('修改密码失败:', error)
    ElMessage.error(error.response?.data?.detail || '修改密码失败')
  }
}

const handleLogout = async () => {
  await userStore.logout()
  ElMessage.success('已退出登录')
  router.push('/login')
}

onMounted(() => {
  loadFavorites()
  loadViewHistory()
})
</script>

<style scoped>
.profile-subtitle {
  margin-top: 6px;
  color: rgba(235, 246, 255, 0.78);
  font-size: 13px;
}

.profile-hero {
  margin-bottom: 18px;
  padding: 22px 24px;
}

.profile-hero-copy {
  margin-top: 10px;
  color: var(--app-text-muted);
  line-height: 1.8;
}

.profile-thumbnail-fallback {
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

.profile-thumbnail-badge {
  display: inline-flex;
  width: fit-content;
  padding: 6px 10px;
  border-radius: 999px;
  background: rgba(22, 97, 255, 0.1);
  color: #1661ff;
  font-size: 12px;
  font-weight: 700;
}

.profile-thumbnail-title {
  margin-top: 14px;
  color: #10233f;
  font-size: 20px;
  font-weight: 700;
}
</style>
