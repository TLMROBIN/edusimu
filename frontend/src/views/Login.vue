<template>
  <div class="login-container">
    <div class="login-layout">
      <section class="login-brand glass-panel">
        <div class="brand-chip">EDUSIMU PLATFORM</div>
        <h1>教育动画展示系统</h1>
        <p>
          面向校内平板教学的互动课件平台，支持教材目录绑定、教师上传、平板触控校验与学习数据分析。
        </p>
        <div class="brand-metrics">
          <div>
            <strong>HTML</strong>
            <span>离线课件</span>
          </div>
          <div>
            <strong>Tablet</strong>
            <span>触控优先</span>
          </div>
          <div>
            <strong>Insight</strong>
            <span>课堂数据</span>
          </div>
        </div>
      </section>

      <el-card class="login-card">
        <template #header>
          <div class="login-card-header">
            <div class="brand-chip">SECURE ACCESS</div>
            <h2>账号登录</h2>
            <p>使用教师、学生或管理员账号进入系统</p>
          </div>
        </template>

        <el-alert
          title="内测中，尚未开放"
          type="warning"
          :closable="false"
          style="margin-bottom: 16px"
        />
        
        <el-form :model="loginForm" :rules="rules" ref="loginFormRef" label-width="80px">
          <el-form-item label="用户名" prop="username">
            <el-input v-model="loginForm.username" placeholder="请输入用户名" />
          </el-form-item>
          
          <el-form-item label="密码" prop="password">
            <el-input
              v-model="loginForm.password"
              type="password"
              placeholder="请输入密码"
              @keyup.enter="handleLogin"
            />
          </el-form-item>
          
          <el-form-item>
            <el-button type="primary" @click="handleLogin" :loading="loading" style="width: 100%">
              登录
            </el-button>
          </el-form-item>
        </el-form>
      </el-card>
    </div>
  </div>
</template>

<script setup>
import { ref } from 'vue'
import { useRouter } from 'vue-router'
import { useUserStore } from '../stores/user'
import { ElMessage } from 'element-plus'

const router = useRouter()
const userStore = useUserStore()
const loginFormRef = ref(null)
const loading = ref(false)

const loginForm = ref({
  username: '',
  password: ''
})

const rules = {
  username: [
    { required: true, message: '请输入用户名', trigger: 'blur' }
  ],
  password: [
    { required: true, message: '请输入密码', trigger: 'blur' }
  ]
}

const handleLogin = async () => {
  if (!loginFormRef.value) return
  
  await loginFormRef.value.validate(async (valid) => {
    if (valid) {
      loading.value = true
      const success = await userStore.login(loginForm.value.username, loginForm.value.password)
      loading.value = false
      
      if (success) {
        ElMessage.success('登录成功')
        router.push('/home')
      } else {
        ElMessage.error('用户名或密码错误')
      }
    }
  })
}
</script>

<style scoped>
.login-container {
  display: flex;
  align-items: center;
  min-height: 100vh;
  padding: 32px;
}

.login-layout {
  width: min(1120px, 100%);
  margin: 0 auto;
  display: grid;
  grid-template-columns: 1.15fr 0.85fr;
  gap: 24px;
  align-items: stretch;
}

.login-brand {
  padding: 42px;
  display: flex;
  flex-direction: column;
  justify-content: space-between;
  min-height: 520px;
}

.brand-chip {
  display: inline-flex;
  align-items: center;
  width: fit-content;
  padding: 8px 14px;
  border-radius: 999px;
  background: rgba(15, 44, 81, 0.08);
  border: 1px solid rgba(22, 97, 255, 0.18);
  color: #1661ff;
  font-size: 12px;
  font-weight: 700;
  letter-spacing: 0.12em;
}

.login-brand h1 {
  margin-top: 22px;
  font-size: clamp(32px, 4vw, 54px);
  line-height: 1.08;
  color: #0f2341;
}

.login-brand p {
  margin-top: 18px;
  max-width: 560px;
  font-size: 16px;
  line-height: 1.8;
  color: #5f7694;
}

.brand-metrics {
  margin-top: auto;
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 14px;
}

.brand-metrics > div {
  padding: 18px;
  border-radius: 18px;
  background: rgba(255, 255, 255, 0.56);
  border: 1px solid rgba(90, 129, 180, 0.14);
}

.brand-metrics strong {
  display: block;
  font-size: 22px;
  color: #0f2341;
}

.brand-metrics span {
  display: block;
  margin-top: 6px;
  color: #5f7694;
}

.login-card {
  width: 100%;
  align-self: center;
}

.login-card-header h2 {
  margin-top: 14px;
  color: #10233f;
  font-size: 30px;
}

.login-card-header p {
  margin-top: 8px;
  color: #5f7694;
}

@media (max-width: 900px) {
  .login-container {
    padding: 16px;
  }

  .login-layout {
    grid-template-columns: 1fr;
  }

  .login-brand {
    min-height: auto;
    padding: 28px;
  }

  .brand-metrics {
    grid-template-columns: 1fr;
  }
}
</style>
