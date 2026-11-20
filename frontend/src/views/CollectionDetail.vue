<template>
  <el-container class="collection-page">
    <el-header class="collection-header">
      <div class="page-header-bar">
        <div class="toolbox-heading">
          <ToolboxLink />
          <div class="page-header-copy">
            <h1>动画合集</h1>
            <p>按合集顺序选择课件，进入完整互动播放页。</p>
          </div>
        </div>
        <div class="page-header-actions">
          <el-button v-if="userStore.user?.role === 'admin'" @click="$router.push('/admin/collections')">
            管理合集
          </el-button>
          <el-button @click="$router.push('/home')">返回首页</el-button>
        </div>
      </div>
    </el-header>

    <el-main>
      <div class="collection-content">
        <nav class="breadcrumb" aria-label="当前位置">
          <RouterLink to="/home">首页</RouterLink>
          <svg viewBox="0 0 24 24" aria-hidden="true"><path d="m9 5 7 7-7 7" /></svg>
          <span>{{ collection?.title || '合集详情' }}</span>
        </nav>

        <div v-if="status === 'loading'" class="detail-state" role="status" aria-live="polite">
          正在加载合集与课件…
        </div>
        <div v-else-if="status === 'error'" class="detail-state error-state" role="alert">
          <strong>合集没有加载成功</strong>
          <p>{{ errorMessage }}</p>
          <el-button type="primary" @click="loadCollection">重新加载</el-button>
        </div>

        <template v-else-if="collection">
          <section class="collection-intro" aria-labelledby="collection-title">
            <img
              v-if="collection.cover_image"
              :src="resolveAssetUrl(collection.cover_image)"
              :alt="`${collection.title}合集封面`"
            />
            <div class="collection-intro-copy">
              <h2 id="collection-title">{{ collection.title }}</h2>
              <p>{{ collection.description || '从合集中选择一个课件，开始互动学习。' }}</p>
              <span>共 {{ collection.animations.length }} 个已发布课件</span>
            </div>
          </section>

          <section class="collection-resources" aria-labelledby="collection-resources-title">
            <div class="resources-heading">
              <h2 id="collection-resources-title">合集课件</h2>
              <span>点击课件卡片打开播放页</span>
            </div>

            <div v-if="!collection.animations.length" class="detail-state">
              <strong>这个合集暂时没有可用课件</strong>
              <p>课件下架后会自动隐藏，请返回首页浏览其他资源。</p>
              <el-button @click="$router.push('/home')">浏览全部课件</el-button>
            </div>

            <div v-else class="collection-grid">
              <article v-for="(animation, index) in collection.animations" :key="animation.id" class="collection-card">
                <RouterLink :to="`/animations/${animation.id}`" :aria-label="`打开课件：${animation.title}`">
                  <span class="resource-thumbnail">
                    <img
                      v-if="animation.thumbnail"
                      :src="resolveAssetUrl(animation.thumbnail)"
                      :alt="`${animation.title}课件缩略图`"
                      loading="lazy"
                    />
                    <span v-else class="thumbnail-fallback">{{ animation.subject_name || '互动课件' }}</span>
                    <span class="resource-sequence">{{ index + 1 }}</span>
                  </span>
                  <span class="resource-body">
                    <strong>{{ animation.title }}</strong>
                    <span class="resource-path">{{ animation.textbook_path || '未标注教材章节' }}</span>
                    <span v-if="animation.description" class="resource-description">{{ animation.description }}</span>
                    <span class="resource-meta">
                      <span>{{ animation.subject_name || '未分类' }}</span>
                      <span v-if="animation.has_quiz" class="quiz-badge">含随堂练</span>
                      <span v-if="animation.may_lag" class="lag-badge">平板可能卡顿</span>
                    </span>
                    <span class="resource-open">
                      打开课件
                      <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 12h14m-6-6 6 6-6 6" /></svg>
                    </span>
                  </span>
                </RouterLink>
              </article>
            </div>
          </section>
        </template>
      </div>
    </el-main>
  </el-container>
</template>

<script setup>
import { ref, watch } from 'vue'
import { useRoute } from 'vue-router'
import axios from 'axios'
import { useUserStore } from '../stores/user'
import { resolveAssetUrl } from '../utils/apiBase'

const route = useRoute()
const userStore = useUserStore()
const collection = ref(null)
const status = ref('loading')
const errorMessage = ref('')
let requestId = 0

const loadCollection = async () => {
  const currentRequest = ++requestId
  status.value = 'loading'
  errorMessage.value = ''
  collection.value = null
  try {
    const response = await axios.get(`/api/collections/${route.params.id}`)
    if (currentRequest !== requestId) return
    collection.value = response.data
    status.value = 'success'
  } catch (error) {
    if (currentRequest !== requestId) return
    status.value = 'error'
    if (error.response?.status === 404) errorMessage.value = '这个合集不存在或已被删除，请返回首页查看其他内容。'
    else if (error.response?.status === 401) errorMessage.value = '登录状态已失效，请重新登录后再试。'
    else errorMessage.value = error.response?.data?.detail || '服务器暂时没有响应，请检查连接后重试。'
  }
}

watch(() => route.params.id, loadCollection, { immediate: true })
</script>

<style scoped>
.collection-page {
  --collection-ink: #10233f;
  --collection-muted: #5f7694;
  --collection-border: rgba(84, 125, 173, 0.18);
  min-height: 100vh;
  background: #f3f8fd;
  color: var(--collection-ink);
}

.collection-header {
  height: auto;
  min-height: 64px;
  padding: 10px 24px;
  background: #10233f;
  border-bottom: 1px solid rgba(245, 251, 255, 0.24);
  box-shadow: none;
  backdrop-filter: none;
}

.collection-header .page-header-bar,
.collection-content {
  width: min(1240px, 100%);
  margin: 0 auto;
}

.page-header-copy h1,
.page-header-copy p {
  margin: 0;
}

.page-header-copy h1 {
  color: #f5fbff;
  font-size: 20px;
  line-height: 1.4;
}

.page-header-copy p {
  margin-top: 2px;
  color: rgba(245, 251, 255, 0.82);
  font-size: 13px;
  line-height: 1.6;
}

.collection-page :deep(.el-main) {
  padding: 0;
  overflow: visible;
}

.collection-content {
  padding: 24px 24px 48px;
}

.breadcrumb {
  min-height: 44px;
  margin-bottom: 16px;
  display: flex;
  align-items: center;
  gap: 8px;
  color: var(--collection-muted);
  font-size: 13px;
}

.breadcrumb a {
  min-height: 44px;
  display: inline-flex;
  align-items: center;
  color: #1661ff;
  font-weight: 600;
}

.breadcrumb a:focus-visible {
  outline: 3px solid #1661ff;
  outline-offset: 2px;
}

.breadcrumb svg,
.resource-open svg {
  width: 18px;
  height: 18px;
  fill: none;
  stroke: currentColor;
  stroke-width: 2;
  stroke-linecap: round;
  stroke-linejoin: round;
}

.collection-intro {
  overflow: hidden;
  display: grid;
  grid-template-columns: minmax(280px, 42%) minmax(0, 1fr);
  align-items: stretch;
  border: 1px solid var(--collection-border);
  border-radius: 22px;
  background: rgba(255, 255, 255, 0.92);
}

.collection-intro > img {
  width: 100%;
  height: 100%;
  min-height: 220px;
  max-height: 300px;
  object-fit: cover;
  background: #e6f0fb;
}

.collection-intro-copy {
  padding: 32px;
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  justify-content: center;
}

.collection-intro-copy h2 {
  margin: 0;
  font-size: clamp(26px, 3vw, 38px);
  line-height: 1.2;
  text-wrap: balance;
}

.collection-intro-copy p {
  max-width: 65ch;
  margin: 14px 0 0;
  color: var(--collection-muted);
  font-size: 16px;
  line-height: 1.75;
  text-wrap: pretty;
}

.collection-intro-copy > span {
  margin-top: 20px;
  padding: 5px 10px;
  border-radius: 999px;
  background: #e6f0fb;
  color: #1661ff;
  font-size: 13px;
  font-weight: 700;
}

.collection-resources {
  margin-top: 28px;
}

.resources-heading {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  gap: 16px;
}

.resources-heading h2 {
  margin: 0;
  font-size: 20px;
}

.resources-heading > span {
  color: var(--collection-muted);
  font-size: 13px;
}

.collection-grid {
  margin-top: 16px;
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(250px, 1fr));
  gap: 18px;
}

.collection-card {
  min-width: 0;
  overflow: hidden;
  border: 1px solid var(--collection-border);
  border-radius: 18px;
  background: rgba(255, 255, 255, 0.92);
  transition: transform 180ms ease, border-color 180ms ease, box-shadow 180ms ease;
}

.collection-card:hover {
  transform: translateY(-2px);
  border-color: rgba(43, 168, 196, 0.35);
  box-shadow: 0 14px 32px rgba(23, 41, 70, 0.1);
}

.collection-card > a {
  height: 100%;
  display: flex;
  flex-direction: column;
  color: inherit;
}

.collection-card > a:focus-visible {
  outline: 3px solid #1661ff;
  outline-offset: -3px;
}

.resource-thumbnail {
  position: relative;
  width: 100%;
  height: 170px;
  display: block;
  overflow: hidden;
  background: #e6f0fb;
}

.resource-thumbnail > img {
  width: 100%;
  height: 100%;
  display: block;
  object-fit: cover;
}

.thumbnail-fallback {
  width: 100%;
  height: 100%;
  padding: 20px;
  display: flex;
  align-items: flex-end;
  color: var(--collection-ink);
  font-size: 22px;
  font-weight: 700;
}

.resource-sequence {
  position: absolute;
  top: 12px;
  left: 12px;
  min-width: 32px;
  height: 32px;
  padding: 0 9px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  border-radius: 999px;
  background: rgba(16, 35, 63, 0.86);
  color: #f5fbff;
  font-size: 13px;
  font-weight: 700;
  font-variant-numeric: tabular-nums;
}

.resource-body {
  padding: 18px;
  display: flex;
  flex: 1;
  flex-direction: column;
  align-items: flex-start;
  gap: 9px;
}

.resource-body > strong {
  font-size: 19px;
  line-height: 1.45;
  overflow-wrap: anywhere;
}

.resource-path,
.resource-description {
  color: var(--collection-muted);
  font-size: 13px;
  line-height: 1.6;
  overflow-wrap: anywhere;
}

.resource-description {
  display: -webkit-box;
  overflow: hidden;
  -webkit-box-orient: vertical;
  -webkit-line-clamp: 2;
}

.resource-meta {
  display: flex;
  flex-wrap: wrap;
  gap: 6px 10px;
  color: var(--collection-muted);
  font-size: 12px;
}

.quiz-badge,
.lag-badge {
  padding: 1px 7px;
  border-radius: 999px;
  font-weight: 700;
}

.quiz-badge {
  border: 1px solid #86efac;
  background: #ecfdf5;
  color: #15803d;
}

.lag-badge {
  border: 1px solid #fdba74;
  background: #fff7ed;
  color: #c2410c;
}

.resource-open {
  margin-top: auto;
  padding-top: 6px;
  display: inline-flex;
  align-items: center;
  gap: 6px;
  color: #1661ff;
  font-size: 13px;
  font-weight: 700;
}

.detail-state {
  min-height: 260px;
  padding: 32px;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  border: 1px solid var(--collection-border);
  border-radius: 20px;
  background: rgba(255, 255, 255, 0.92);
  color: var(--collection-ink);
  text-align: center;
}

.detail-state p {
  margin: 8px 0 18px;
  color: var(--collection-muted);
  line-height: 1.7;
}

.error-state {
  border-color: rgba(199, 55, 75, 0.35);
}

.collection-page :deep(.el-button) {
  min-height: 44px;
}

@media (max-width: 900px) {
  .collection-header {
    padding: 12px 18px;
  }

  .collection-content {
    padding: 20px 18px 40px;
  }

  .collection-intro {
    grid-template-columns: 1fr;
  }

  .collection-intro > img {
    min-height: 0;
    aspect-ratio: 16 / 7;
  }

  .collection-intro-copy {
    padding: 24px;
  }
}

@media (max-width: 600px) {
  .collection-header,
  .collection-content {
    padding-inline: 14px;
  }

  .resources-heading {
    align-items: flex-start;
    flex-direction: column;
    gap: 6px;
  }

  .collection-grid {
    grid-template-columns: 1fr;
  }

  .resource-thumbnail {
    height: 158px;
  }
}

@media (prefers-reduced-motion: reduce) {
  .collection-card {
    transition: none;
  }

  .collection-card:hover {
    transform: none;
  }
}
</style>
