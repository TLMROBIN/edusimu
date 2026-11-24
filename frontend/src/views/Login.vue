<template>
  <div class="login-container">
    <div class="login-layout">
      <section class="login-brand" aria-labelledby="product-title">
        <div class="brand-navigation">
          <ToolboxLink />
        </div>

        <div class="brand-copy">
          <h1 id="product-title">教育动画展示系统</h1>
          <p>按教材章节，打开 HTML、PhET 和 GeoGebra 互动课件</p>
        </div>

        <ul class="brand-capabilities" aria-label="平台能力">
          <li>
            <strong>教材定位</strong>
            <span>按学科与章节找到课件</span>
          </li>
          <li>
            <strong>课堂互动</strong>
            <span>适配平板触控与全屏播放</span>
          </li>
          <li>
            <strong>课后延续</strong>
            <span>收藏、评价与学习记录</span>
          </li>
        </ul>
      </section>

      <section class="login-card" aria-labelledby="login-title">
        <div class="login-card-header">
          <h2 id="login-title">统一认证登录</h2>
          <p>本系统已接入学校统一身份认证平台</p>
        </div>

        <el-button type="primary" size="large" @click="handleSsoLogin">
          使用统一平台登录
        </el-button>
      </section>
    </div>
  </div>
</template>

<script setup>
import { resolveApiBase } from '../utils/apiBase'

const handleSsoLogin = () => {
  const apiBase = resolveApiBase()
  window.location.href = `${apiBase}/api/auth/oidc/login`
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
  min-height: calc(100vh - 64px);
  margin: 0 auto;
  display: grid;
  grid-template-columns: minmax(0, 1.25fr) minmax(320px, 0.75fr);
  gap: 80px;
  align-items: center;
}

.login-brand {
  min-width: 0;
  display: flex;
  flex-direction: column;
  align-items: flex-start;
}

.brand-navigation {
  margin-bottom: 64px;
}

.brand-copy h1 {
  max-width: 640px;
  color: var(--app-text);
  font-size: clamp(36px, 4vw, 56px);
  font-weight: 500;
  line-height: 1.12;
  letter-spacing: 0;
  text-wrap: balance;
}

.brand-copy p {
  max-width: 560px;
  margin-top: 20px;
  color: var(--app-text-secondary);
  font-size: 18px;
  line-height: 1.7;
}

.brand-capabilities {
  width: 100%;
  margin-top: 48px;
  padding-top: 24px;
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 24px;
  border-top: 1px solid var(--app-border);
  list-style: none;
}

.brand-capabilities li {
  min-width: 0;
}

.brand-capabilities strong {
  display: block;
  color: var(--app-text);
  font-size: 14px;
  font-weight: 500;
  line-height: 1.5;
}

.brand-capabilities span {
  display: block;
  margin-top: 4px;
  color: var(--app-text-muted);
  font-size: 13px;
  line-height: 1.6;
}

.login-card {
  width: 100%;
  padding: 32px;
  border: 1px solid var(--app-border);
  border-radius: 20px;
  background: var(--app-surface);
}

.login-card-header h2 {
  color: var(--app-text);
  font-size: 24px;
  font-weight: 500;
  line-height: 1.3;
}

.login-card-header p {
  margin-top: 8px;
  color: var(--app-text-muted);
  font-size: 14px;
  line-height: 1.6;
}

.login-card .el-button {
  width: 100%;
  min-height: 44px;
  margin-top: 24px;
}

@media (max-width: 900px) {
  .login-container {
    padding: 48px 24px;
  }

  .login-layout {
    width: min(640px, 100%);
    min-height: auto;
    grid-template-columns: 1fr;
    gap: 48px;
  }

  .brand-navigation {
    margin-bottom: 48px;
  }
}

@media (max-width: 520px) {
  .login-container {
    padding: 32px 16px;
  }

  .login-layout {
    gap: 32px;
  }

  .brand-navigation {
    margin-bottom: 40px;
  }

  .brand-copy h1 {
    font-size: 36px;
  }

  .brand-copy p {
    font-size: 16px;
  }

  .brand-capabilities {
    margin-top: 32px;
    grid-template-columns: 1fr;
    gap: 16px;
  }

  .brand-capabilities li {
    display: grid;
    grid-template-columns: 88px minmax(0, 1fr);
    gap: 12px;
  }

  .brand-capabilities span {
    margin-top: 0;
  }

  .login-card {
    padding: 24px;
    border-radius: 16px;
  }
}
</style>
