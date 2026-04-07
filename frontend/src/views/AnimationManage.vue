<template>
  <el-container class="admin-shell">
    <el-header>
      <div class="page-header-bar">
        <div class="page-header-copy">
          <h2 style="margin: 0">{{ pageTitle }}</h2>
          <div style="font-size: 13px; color: #666; margin-top: 6px">
            教师使用自己的账号上传课件，作者自动署名，未通过平板触控校验的课件不能发布。
          </div>
        </div>
        <div class="page-header-actions">
          <el-button @click="$router.push('/admin')">返回后台</el-button>
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

      <el-main>
        <section class="glass-panel manage-summary">
          <div>
            <div class="section-title">{{ isAdmin ? '课件审核中枢' : '教师课件工作台' }}</div>
            <div class="manage-summary-copy">
              {{ isAdmin ? '查看校验结果、审核状态与发布状态，统一管理平台课件。' : '上传、修订并跟踪自己的课件，系统会自动完成平板适配校验。' }}
            </div>
          </div>
          <div class="summary-tag-group">
            <span class="summary-tag">{{ filteredAnimations.length }} 条结果</span>
            <span class="summary-tag">{{ selectedAnimations.length }} 条已选</span>
          </div>
        </section>

        <section class="glass-panel filter-panel">
        <el-row :gutter="16">
          <el-col :xs="24" :sm="12" :md="5">
            <el-select v-model="filterSubject" placeholder="筛选学科" clearable @change="applyFilters">
              <el-option
                v-for="subject in subjects"
                :key="subject.id"
                :label="subject.display_name"
                :value="subject.id"
              />
            </el-select>
          </el-col>
          <el-col :xs="24" :sm="12" :md="5">
            <el-select v-model="filterSourceType" placeholder="筛选来源" clearable @change="applyFilters">
              <el-option
                v-for="option in sourceOptions"
                :key="option.value"
                :label="option.label"
                :value="option.value"
              />
            </el-select>
          </el-col>
          <el-col :xs="24" :sm="12" :md="5">
            <el-select v-model="filterReviewStatus" placeholder="筛选审核状态" clearable @change="applyFilters">
              <el-option label="待审核" value="pending_review" />
              <el-option label="需修改" value="needs_fix" />
              <el-option label="已通过" value="approved" />
            </el-select>
          </el-col>
          <el-col :xs="24" :sm="12" :md="5">
            <el-select v-model="filterValidationStatus" placeholder="筛选校验结果" clearable @change="applyFilters">
              <el-option label="通过" value="passed" />
              <el-option label="未通过" value="failed" />
              <el-option label="待校验" value="pending" />
            </el-select>
          </el-col>
          <el-col :xs="24" :sm="24" :md="4" class="manage-actions-col">
            <el-button @click="showGuideDialog = true">
              课件设计指南
            </el-button>
            <el-button @click="$router.push('/admin/geogebra')">
              GeoGebra 制作
            </el-button>
            <el-button type="primary" @click="showUploadDialog = true">
              上传课件
            </el-button>
            <el-button
              v-if="isAdmin"
              type="success"
              @click="batchPublish"
              :disabled="selectedAnimations.length === 0"
            >
              批量发布 ({{ selectedAnimations.length }})
            </el-button>
          </el-col>
        </el-row>
        </section>

        <div class="responsive-table">
        <el-table
          class="manage-table"
          :data="filteredAnimations"
          :style="{ minWidth: tableMinWidth }"
          style="width: 100%"
          @selection-change="handleSelectionChange"
        >
          <el-table-column v-if="isAdmin" type="selection" width="55" />
          <el-table-column prop="title" label="标题" min-width="180" show-overflow-tooltip />
          <el-table-column prop="subject_name" label="学科" width="100" />
          <el-table-column label="来源" width="90">
            <template #default="scope">
              <el-tag size="small" effect="plain">{{ formatSourceType(scope.row.source_type) }}</el-tag>
            </template>
          </el-table-column>
          <el-table-column prop="textbook_path" label="教材目录" min-width="220" show-overflow-tooltip />
          <el-table-column prop="author" label="作者" width="120" show-overflow-tooltip />
          <el-table-column label="校验结果" width="140">
            <template #default="scope">
              <el-popover placement="left" :width="360" trigger="click">
                <template #reference>
                  <el-tag :type="getValidationTagType(scope.row.validation_status)" style="cursor: pointer">
                    {{ formatValidationStatus(scope.row.validation_status) }}
                  </el-tag>
                </template>
                <div>
                  <div style="font-weight: 600; margin-bottom: 8px">{{ scope.row.validation_summary || '暂无校验结果' }}</div>
                  <div v-if="scope.row.validation_errors?.length">
                    <div style="color: #f56c6c; margin-bottom: 6px">未通过项</div>
                    <div v-for="item in scope.row.validation_errors" :key="item" style="margin-bottom: 6px; color: #444">
                      {{ item }}
                    </div>
                  </div>
                  <div v-if="scope.row.validation_warnings?.length" style="margin-top: 10px">
                    <div style="color: #e6a23c; margin-bottom: 6px">提醒项</div>
                    <div v-for="item in scope.row.validation_warnings" :key="item" style="margin-bottom: 6px; color: #444">
                      {{ item }}
                    </div>
                  </div>
                </div>
              </el-popover>
            </template>
          </el-table-column>
          <el-table-column label="审核状态" width="120">
            <template #default="scope">
              <el-tag :type="getReviewTagType(scope.row.review_status)">
                {{ formatReviewStatus(scope.row.review_status) }}
              </el-tag>
            </template>
          </el-table-column>
          <el-table-column label="发布状态" width="100">
            <template #default="scope">
              <el-tag v-if="scope.row.is_published" type="success">已发布</el-tag>
              <el-tag v-else type="info">未发布</el-tag>
            </template>
          </el-table-column>
          <el-table-column prop="view_count" label="观看次数" width="100" />
          <el-table-column label="操作" fixed="right" width="360">
            <template #default="scope">
              <div class="table-action-group">
                <el-button
                  v-if="isAdmin"
                  size="small"
                  type="success"
                  :disabled="scope.row.is_published || scope.row.validation_status !== 'passed'"
                  @click="publishAnimation(scope.row)"
                >
                  发布
                </el-button>
                <el-button
                  v-if="isAdmin"
                  size="small"
                  type="warning"
                  :disabled="scope.row.is_published || scope.row.validation_status === 'passed'"
                  @click="forcePublishAnimation(scope.row)"
                >
                  强制发布
                </el-button>
                <el-button
                  v-if="scope.row.source_type === 'geogebra'"
                  size="small"
                  type="success"
                  plain
                  @click="openGeoGebraEditor(scope.row)"
                >
                  GeoGebra 编辑
                </el-button>
                <el-button
                  v-if="isAdmin && scope.row.is_published"
                  size="small"
                  @click="unpublishAnimation(scope.row)"
                >
                  下架
                </el-button>
                <el-button size="small" @click="openEditDialog(scope.row)">编辑信息</el-button>
                <el-button size="small" type="primary" plain @click="openReplaceDialog(scope.row)">更新文件</el-button>
                <el-button size="small" @click="showReview(scope.row)">查看校验</el-button>
                <el-button size="small" type="danger" @click="deleteAnimation(scope.row.id)">删除</el-button>
              </div>
            </template>
          </el-table-column>
        </el-table>
        </div>

        <el-dialog v-model="showUploadDialog" title="上传 HTML 课件" width="560px">
          <el-alert
            title="作者将自动使用当前教师姓名或用户名；系统会校验平板触控适配、文件体积和交互方式。图片、CSS、JS 等静态外链会尽量自动本地化，但运行时联网请求仍不允许。"
            type="info"
            :closable="false"
            style="margin-bottom: 18px"
          />
          <el-form :model="uploadForm" label-width="90px">
            <el-form-item label="标题">
              <el-input v-model="uploadForm.title" />
            </el-form-item>
            <el-form-item label="学科">
              <el-select v-model="uploadForm.subject_id" placeholder="选择学科" @change="handleUploadSubjectChange">
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
                v-model="uploadForm.textbook_path_ids"
                :options="textbookOptions"
                :props="textbookProps"
                filterable
                placeholder="必须选择所属章节"
              />
            </el-form-item>
            <el-form-item label="描述">
              <el-input v-model="uploadForm.description" type="textarea" :rows="3" />
            </el-form-item>
            <el-form-item label="年级">
              <el-input v-model="uploadForm.grade_level" placeholder="如：高一 / 七年级" />
            </el-form-item>
            <el-form-item label="关键词">
              <el-input v-model="uploadForm.keywords" placeholder="用逗号分隔，如：牛顿定律,力学" />
            </el-form-item>
            <el-form-item label="课件文件">
              <input type="file" ref="fileInput" accept=".html,.zip" />
            </el-form-item>
            <el-form-item label="缩略图">
              <input type="file" ref="thumbnailInput" accept="image/*" />
            </el-form-item>
            <el-form-item v-if="isAdmin" label="直接发布">
              <el-switch v-model="uploadForm.is_published" />
            </el-form-item>
          </el-form>
          <template #footer>
            <el-button @click="resetUploadDialog">取消</el-button>
            <el-button type="primary" @click="uploadAnimation">上传并校验</el-button>
          </template>
        </el-dialog>

        <el-dialog v-model="showGuideDialog" title="课件设计指南" width="760px">
          <div class="guide-shell">
            <el-alert
              title="目标不是做一个炫酷网页，而是生成一个能在校内平板稳定运行、触控友好、离线可用、易于教学的课件。"
              type="info"
              :closable="false"
              style="margin-bottom: 18px"
            />

            <section class="guide-section">
              <div class="guide-title">硬性标准</div>
              <div class="guide-list">
                <div>1. 优先输出单个可直接运行的 `.html` 文件；如果课件依赖多个本地资源，可上传包含 `index.html` 的 `.zip` 课件包。</div>
                <div>2. 必须适配平板横竖屏，包含 `viewport`，不能整体缩放异常。</div>
                <div>3. 核心交互必须支持手指触控，不能依赖 hover、右键、滚轮、键盘快捷键。</div>
                <div>4. 不要依赖运行时联网请求；`fetch`、XHR、WebSocket 这类会导致不通过。</div>
                <div>5. 页面要轻量，避免超大图片、视频和复杂库，优先保证加载快、操作稳。</div>
                <div>6. 要有明显的标题、主要内容区、返回或重置按钮，便于课堂演示。</div>
              </div>
            </section>

            <section class="guide-section">
              <div class="guide-title">最推荐 Prompt</div>
              <el-input
                :model-value="recommendedGuidePrompt"
                type="textarea"
                :rows="10"
                readonly
              />
              <div class="guide-action-row">
                <el-button type="primary" @click="copyPrompt(recommendedGuidePrompt)">复制推荐 Prompt</el-button>
              </div>
            </section>

            <section class="guide-section">
              <div class="guide-title">如果你想用 React</div>
              <el-input
                :model-value="reactGuidePrompt"
                type="textarea"
                :rows="8"
                readonly
              />
              <div class="guide-action-row">
                <el-button @click="copyPrompt(reactGuidePrompt)">复制 React Prompt</el-button>
              </div>
            </section>

            <section class="guide-section">
              <div class="guide-title">建议老师这样描述教学目标</div>
              <div class="guide-list">
                <div>1. 先写清学科、年级、章节，例如“高中物理 选择性必修第一册 机械波 多解性问题”。</div>
                <div>2. 再写清教学目标，例如“让学生通过拖动和切换参数理解波长、周期和相位关系”。</div>
                <div>3. 明确课堂场景，例如“学生在平板上单独操作 3 分钟，教师再集中讲解”。</div>
                <div>4. 明确交互方式，例如“用点击切换、滑块调整、按钮重置，不要复杂手势”。</div>
                <div>5. 明确输出限制，例如“不要联网、不要外链、不要要求安装依赖、直接输出完整 HTML”。</div>
              </div>
            </section>

            <section class="guide-section">
              <div class="guide-title">最容易失败的写法</div>
              <div class="guide-list">
                <div>1. 让 AI 输出 React/Vue 源码，但还需要 `npm install` 和打包。</div>
                <div>2. 页面依赖 CDN、在线字体、在线图片、第三方脚本，但没有离线备份。</div>
                <div>3. 页面打开后还要请求接口数据才能显示内容。</div>
                <div>4. 交互依赖鼠标悬停、滚轮缩放或右键菜单。</div>
                <div>5. 固定宽高太大，导致平板上内容被裁切或只能缩小显示。</div>
              </div>
            </section>
          </div>
          <template #footer>
            <el-button @click="showGuideDialog = false">关闭</el-button>
          </template>
        </el-dialog>

        <el-dialog v-model="showReviewDialog" title="课件校验详情" width="620px">
          <template v-if="activeAnimation">
            <div style="margin-bottom: 14px">
              <div style="font-size: 18px; font-weight: 600">{{ activeAnimation.title }}</div>
              <div style="color: #666; margin-top: 6px">{{ activeAnimation.validation_summary || '暂无校验结果' }}</div>
            </div>

            <el-descriptions :column="2" border>
              <el-descriptions-item label="作者">{{ activeAnimation.author || '-' }}</el-descriptions-item>
              <el-descriptions-item label="上传账号">{{ activeAnimation.creator_name || '-' }}</el-descriptions-item>
              <el-descriptions-item label="教材目录">{{ activeAnimation.textbook_path || '-' }}</el-descriptions-item>
              <el-descriptions-item label="审核状态">{{ formatReviewStatus(activeAnimation.review_status) }}</el-descriptions-item>
              <el-descriptions-item label="发布状态">{{ activeAnimation.is_published ? '已发布' : '未发布' }}</el-descriptions-item>
            </el-descriptions>

            <div v-if="activeAnimation.validation_errors?.length" style="margin-top: 18px">
              <div style="color: #f56c6c; font-weight: 600; margin-bottom: 10px">未通过项</div>
              <div
                v-for="item in activeAnimation.validation_errors"
                :key="item"
                style="padding: 8px 12px; background: #fef0f0; border-radius: 6px; margin-bottom: 8px"
              >
                {{ item }}
              </div>
            </div>

            <div v-if="activeAnimation.validation_warnings?.length" style="margin-top: 18px">
              <div style="color: #e6a23c; font-weight: 600; margin-bottom: 10px">提醒项</div>
              <div
                v-for="item in activeAnimation.validation_warnings"
                :key="item"
                style="padding: 8px 12px; background: #fdf6ec; border-radius: 6px; margin-bottom: 8px"
              >
                {{ item }}
              </div>
            </div>

            <div v-if="activeAnimation.review_notes" style="margin-top: 18px">
              <div style="font-weight: 600; margin-bottom: 10px">审核备注</div>
              <div style="padding: 10px 12px; background: #f5f7fa; border-radius: 6px">
                {{ activeAnimation.review_notes }}
              </div>
            </div>

            <div v-if="activeAnimation.ai_guidance" style="margin-top: 18px">
              <div style="font-weight: 600; margin-bottom: 10px">AI 修复建议</div>
              <div style="padding: 10px 12px; background: #ecf5ff; border-radius: 6px; color: #336699">
                {{ activeAnimation.ai_guidance }}
              </div>
            </div>

            <div v-if="activeAnimation.ai_prompts?.length" style="margin-top: 18px">
              <div style="font-weight: 600; margin-bottom: 10px">推荐 Prompt</div>
              <el-collapse>
                <el-collapse-item
                  v-for="item in activeAnimation.ai_prompts"
                  :key="item.title"
                  :title="item.title"
                >
                  <div style="display: flex; justify-content: flex-end; margin-bottom: 8px">
                    <el-button size="small" @click="copyPrompt(item.prompt)">复制 Prompt</el-button>
                  </div>
                  <el-input
                    :model-value="item.prompt"
                    type="textarea"
                    :rows="6"
                    readonly
                  />
                </el-collapse-item>
              </el-collapse>
            </div>
          </template>
          <template #footer>
            <el-button v-if="activeAnimation" type="primary" plain @click="openReplaceDialog(activeAnimation)">
              上传修订版
            </el-button>
            <el-button @click="showReviewDialog = false">关闭</el-button>
          </template>
        </el-dialog>

        <el-dialog v-model="showEditDialog" title="编辑课件信息" width="560px">
          <el-form :model="editForm" label-width="90px">
            <el-form-item label="标题">
              <el-input v-model="editForm.title" />
            </el-form-item>
            <el-form-item label="作者">
              <el-input v-model="editForm.author" placeholder="可修改展示作者名" />
            </el-form-item>
            <el-form-item label="学科">
              <el-select v-model="editForm.subject_id" placeholder="选择学科" @change="handleEditSubjectChange">
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
                v-model="editForm.textbook_path_ids"
                :options="editTextbookOptions"
                :props="textbookProps"
                filterable
                placeholder="必须选择所属章节"
              />
            </el-form-item>
            <el-form-item label="描述">
              <el-input v-model="editForm.description" type="textarea" :rows="3" />
            </el-form-item>
            <el-form-item label="年级">
              <el-input v-model="editForm.grade_level" />
            </el-form-item>
            <el-form-item label="关键词">
              <el-input v-model="editForm.keywords" />
            </el-form-item>
          </el-form>
          <template #footer>
            <el-button @click="resetEditDialog">取消</el-button>
            <el-button type="primary" @click="submitEditDialog">保存修改</el-button>
          </template>
        </el-dialog>

        <el-dialog v-model="showReplaceDialog" title="上传修订版课件" width="560px">
          <template v-if="replaceTarget">
          <el-alert
            title="会替换当前课件记录的 HTML 文件并自动重新校验，不会新建一条课件，原有所属章节保持不变。"
            type="info"
            :closable="false"
            style="margin-bottom: 18px"
            />
            <el-descriptions :column="2" border style="margin-bottom: 18px">
              <el-descriptions-item label="课件标题">{{ replaceTarget.title }}</el-descriptions-item>
              <el-descriptions-item label="学科">{{ replaceTarget.subject_name }}</el-descriptions-item>
              <el-descriptions-item label="当前校验">{{ formatValidationStatus(replaceTarget.validation_status) }}</el-descriptions-item>
              <el-descriptions-item label="当前审核">{{ formatReviewStatus(replaceTarget.review_status) }}</el-descriptions-item>
            </el-descriptions>

            <el-form label-width="100px">
              <el-form-item label="新课件文件">
                <input type="file" ref="replaceFileInput" accept=".html,.zip" />
              </el-form-item>
              <el-form-item label="新缩略图">
                <input type="file" ref="replaceThumbnailInput" accept="image/*" />
              </el-form-item>
              <el-form-item v-if="isAdmin" label="替换后发布">
                <el-switch v-model="replaceForm.is_published" />
              </el-form-item>
            </el-form>
          </template>
          <template #footer>
            <el-button @click="resetReplaceDialog">取消</el-button>
            <el-button type="primary" @click="replaceAnimationFile">上传修订版</el-button>
          </template>
        </el-dialog>
      </el-main>
    </el-container>
  </el-container>
</template>

<script setup>
import { computed, ref, onMounted } from 'vue'
import { useRouter } from 'vue-router'
import { useUserStore } from '../stores/user'
import axios from 'axios'
import { ElMessage, ElMessageBox } from 'element-plus'

const router = useRouter()
const userStore = useUserStore()
const isAdmin = computed(() => userStore.user?.role === 'admin')
const pageTitle = computed(() => (isAdmin.value ? '课件审核与管理' : '我的课件'))
const tableMinWidth = computed(() => (isAdmin.value ? '1500px' : '1280px'))

const animations = ref([])
const filteredAnimations = ref([])
const selectedAnimations = ref([])
const subjects = ref([])
const textbookOptions = ref([])
const editTextbookOptions = ref([])
const filterSubject = ref('')
const filterSourceType = ref('')
const filterReviewStatus = ref('')
const filterValidationStatus = ref('')
const showUploadDialog = ref(false)
const showGuideDialog = ref(false)
const showReviewDialog = ref(false)
const showEditDialog = ref(false)
const showReplaceDialog = ref(false)
const fileInput = ref(null)
const thumbnailInput = ref(null)
const replaceFileInput = ref(null)
const replaceThumbnailInput = ref(null)
const activeAnimation = ref(null)
const replaceTarget = ref(null)
const editTarget = ref(null)
const uploadForm = ref({
  title: '',
  subject_id: null,
  textbook_path_ids: [],
  description: '',
  grade_level: '',
  keywords: '',
  is_published: false
})
const replaceForm = ref({
  is_published: false
})
const editForm = ref({
  title: '',
  author: '',
  subject_id: null,
  textbook_path_ids: [],
  description: '',
  grade_level: '',
  keywords: ''
})
const textbookProps = {
  value: 'id',
  label: 'name',
  children: 'children',
  emitPath: true
}
const sourceOptions = [
  { label: 'PhET', value: 'phet' },
  { label: 'GeoGebra', value: 'geogebra' },
  { label: '原创', value: 'original' }
]

const recommendedGuidePrompt = `请为校内平板教学生成一个单文件 HTML 互动课件。

适用场景：教师上传到教育动画展示系统，学生在平板上直接打开使用。

必须满足这些要求：
1. 只输出一个完整 HTML 文件，不要解释，不要输出 npm、构建命令。
2. 页面必须适配平板横竖屏，包含 viewport。
3. 所有核心交互必须支持触控点击，不依赖 hover、右键、滚轮、键盘快捷键。
4. 不依赖外部 CDN、外部图片、外部字体、外部脚本或任何联网请求。
5. 页面加载快，结构清晰，按钮足够大，适合学生手指操作。
6. 页面要包含：标题区、内容展示区、至少一个互动环节、一个重置按钮。
7. 代码使用原生 HTML/CSS/JavaScript，直接可运行。

教学主题：{{在这里写学科、年级、章节和知识点}}
教学目标：{{在这里写希望学生理解什么}}
互动方式：{{在这里写点击、切换、滑块、拖动中的一种或几种}}

只返回完整 HTML 代码。`

const reactGuidePrompt = `请用 React 的写法设计一个课堂互动课件，但最终输出必须是“可直接运行的完整 HTML 文件”，而不是 React 源码工程。

必须满足：
1. 不要输出 npm install、vite、webpack、打包步骤。
2. 不要依赖 React CDN、外链脚本或运行时联网请求。
3. 如果你内部使用 React 思路，请最终把结果整理成一个离线可运行的完整 HTML。
4. 必须适配平板触控，按钮和点击区域适合学生手指操作。
5. 不依赖 hover、右键、滚轮、键盘快捷键。
6. 页面结构清晰，适合课堂讲解和学生自主操作。

教学主题：{{在这里填写}}
教学目标：{{在这里填写}}

只返回完整 HTML。`

const formatReviewStatus = (status) => {
  const map = {
    pending_review: '待审核',
    needs_fix: '需修改',
    approved: '已通过'
  }
  return map[status] || '未知'
}

const formatValidationStatus = (status) => {
  const map = {
    passed: '校验通过',
    failed: '校验未通过',
    pending: '待校验'
  }
  return map[status] || '未知'
}

const formatSourceType = (sourceType) => {
  if (sourceType === 'phet') {
    return 'PhET'
  }
  if (sourceType === 'geogebra') {
    return 'GeoGebra'
  }
  return '原创'
}

const getReviewTagType = (status) => {
  const map = {
    pending_review: 'warning',
    needs_fix: 'danger',
    approved: 'success'
  }
  return map[status] || 'info'
}

const getValidationTagType = (status) => {
  const map = {
    passed: 'success',
    failed: 'danger',
    pending: 'warning'
  }
  return map[status] || 'info'
}

const escapeHtml = (value = '') => String(value)
  .replace(/&/g, '&amp;')
  .replace(/</g, '&lt;')
  .replace(/>/g, '&gt;')
  .replace(/"/g, '&quot;')
  .replace(/'/g, '&#39;')

const toMessageList = (value) => Array.isArray(value)
  ? value.filter(item => typeof item === 'string' && item.trim())
  : []

const parseUploadError = (error, fallbackMessage = '上传失败') => {
  const responseData = error?.response?.data
  const payload = responseData?.detail && typeof responseData.detail === 'object'
    ? responseData.detail
    : responseData

  if (payload && typeof payload === 'object' && !Array.isArray(payload)) {
    return {
      summary: payload.summary || payload.detail || fallbackMessage,
      errors: toMessageList(payload.validation_errors),
      warnings: toMessageList(payload.validation_warnings),
      guidance: typeof payload.ai_guidance === 'string' ? payload.ai_guidance : ''
    }
  }

  return {
    summary: responseData?.detail || fallbackMessage,
    errors: [],
    warnings: [],
    guidance: ''
  }
}

const showUploadError = async (error, title = '上传失败') => {
  const parsed = parseUploadError(error, title)
  if (!parsed.errors.length && !parsed.warnings.length && !parsed.guidance) {
    ElMessage.error(parsed.summary)
    return
  }

  const sections = [
    `<div style="font-size: 14px; line-height: 1.7; text-align: left;">`,
    `<div style="font-weight: 600; margin-bottom: 10px;">${escapeHtml(parsed.summary)}</div>`
  ]

  if (parsed.errors.length) {
    sections.push('<div style="margin-bottom: 8px; color: #f56c6c; font-weight: 600;">未通过项</div>')
    sections.push('<ul style="margin: 0 0 12px 18px; padding: 0;">')
    parsed.errors.forEach(item => {
      sections.push(`<li style="margin-bottom: 6px;">${escapeHtml(item)}</li>`)
    })
    sections.push('</ul>')
  }

  if (parsed.warnings.length) {
    sections.push('<div style="margin-bottom: 8px; color: #e6a23c; font-weight: 600;">提醒项</div>')
    sections.push('<ul style="margin: 0 0 12px 18px; padding: 0;">')
    parsed.warnings.forEach(item => {
      sections.push(`<li style="margin-bottom: 6px;">${escapeHtml(item)}</li>`)
    })
    sections.push('</ul>')
  }

  if (parsed.guidance) {
    sections.push('<div style="margin-bottom: 8px; color: #409eff; font-weight: 600;">修改建议</div>')
    sections.push(`<div style="background: #ecf5ff; border-radius: 8px; padding: 10px 12px;">${escapeHtml(parsed.guidance)}</div>`)
  }

  sections.push('</div>')

  await ElMessageBox.alert(sections.join(''), title, {
    dangerouslyUseHTMLString: true,
    confirmButtonText: '知道了'
  })
}

const applyFilters = () => {
  let result = [...animations.value]

  if (filterSubject.value) {
    result = result.filter(item => item.subject_id === filterSubject.value)
  }
  if (filterSourceType.value) {
    result = result.filter(item => item.source_type === filterSourceType.value)
  }
  if (filterReviewStatus.value) {
    result = result.filter(item => item.review_status === filterReviewStatus.value)
  }
  if (filterValidationStatus.value) {
    result = result.filter(item => item.validation_status === filterValidationStatus.value)
  }

  filteredAnimations.value = result
}

const handleSelectionChange = (selection) => {
  selectedAnimations.value = selection
}

const loadSubjects = async () => {
  try {
    const response = await axios.get('/api/animations/subjects')
    subjects.value = response.data
  } catch (error) {
    console.error('加载学科失败:', error)
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
  }
}

const loadAnimations = async () => {
  try {
    const response = await axios.get('/api/animations/', {
      params: {
        limit: 200,
        ...(isAdmin.value ? {} : { mine_only: true })
      }
    })
    animations.value = response.data
    applyFilters()
  } catch (error) {
    console.error('加载课件失败:', error)
    ElMessage.error('加载课件失败')
  }
}

const resetUploadDialog = () => {
  showUploadDialog.value = false
  uploadForm.value = {
    title: '',
    subject_id: null,
    textbook_path_ids: [],
    description: '',
    grade_level: '',
    keywords: '',
    is_published: false
  }
  textbookOptions.value = []
  if (fileInput.value) {
    fileInput.value.value = ''
  }
  if (thumbnailInput.value) {
    thumbnailInput.value.value = ''
  }
}

const resetReplaceDialog = () => {
  showReplaceDialog.value = false
  replaceTarget.value = null
  replaceForm.value = { is_published: false }
  if (replaceFileInput.value) {
    replaceFileInput.value.value = ''
  }
  if (replaceThumbnailInput.value) {
    replaceThumbnailInput.value.value = ''
  }
}

const resetEditDialog = () => {
  showEditDialog.value = false
  editTarget.value = null
  editTextbookOptions.value = []
  editForm.value = {
    title: '',
    author: '',
    subject_id: null,
    textbook_path_ids: [],
    description: '',
    grade_level: '',
    keywords: ''
  }
}

const uploadAnimation = async () => {
  if (!uploadForm.value.title || !uploadForm.value.subject_id) {
    ElMessage.error('请填写标题并选择学科')
    return
  }
  if (!uploadForm.value.textbook_path_ids?.length) {
    ElMessage.error('请先选择课件所属章节')
    return
  }
  if (!fileInput.value?.files?.[0]) {
    ElMessage.error('请选择 HTML 文件或 ZIP 课件包')
    return
  }

  const formData = new FormData()
  formData.append('title', uploadForm.value.title)
  formData.append('subject_id', uploadForm.value.subject_id)
  if (uploadForm.value.textbook_path_ids?.length) {
    formData.append('textbook_node_id', uploadForm.value.textbook_path_ids[uploadForm.value.textbook_path_ids.length - 1])
  }
  formData.append('description', uploadForm.value.description)
  formData.append('grade_level', uploadForm.value.grade_level)
  formData.append('keywords', uploadForm.value.keywords)
  formData.append('is_published', uploadForm.value.is_published)
  formData.append('file', fileInput.value.files[0])

  if (thumbnailInput.value?.files?.[0]) {
    formData.append('thumbnail', thumbnailInput.value.files[0])
  }

  try {
    const response = await axios.post('/api/animations/', formData, {
      headers: { 'Content-Type': 'multipart/form-data' }
    })

    const animation = response.data
    if (animation.validation_status === 'failed') {
      ElMessage.warning(animation.validation_summary || '课件已上传，但校验未通过')
    } else if (animation.review_status === 'pending_review') {
      ElMessage.success('课件上传成功，已进入待审核状态')
    } else {
      ElMessage.success('课件上传并发布成功')
    }

    resetUploadDialog()
    loadAnimations()
  } catch (error) {
    console.error('上传失败:', error)
    await showUploadError(error, '上传失败')
  }
}

const publishAnimation = async (animation) => {
  try {
    await axios.put(`/api/animations/${animation.id}`, { is_published: true })
    ElMessage.success('课件已发布')
    loadAnimations()
  } catch (error) {
    console.error('发布失败:', error)
    ElMessage.error(error.response?.data?.detail || '发布失败')
  }
}

const forcePublishAnimation = async (animation) => {
  try {
    await ElMessageBox.confirm(
      '该课件校验未通过，确定要强制发布吗？',
      '强制发布确认',
      { type: 'warning' }
    )
    await axios.put(`/api/animations/${animation.id}`, { is_published: true, force_publish: true })
    ElMessage.success('课件已强制发布')
    loadAnimations()
  } catch (error) {
    if (error === 'cancel' || error === 'close') return
    console.error('强制发布失败:', error)
    ElMessage.error(error.response?.data?.detail || '强制发布失败')
  }
}

const unpublishAnimation = async (animation) => {
  try {
    await axios.put(`/api/animations/${animation.id}`, { is_published: false })
    ElMessage.success('课件已下架')
    loadAnimations()
  } catch (error) {
    console.error('下架失败:', error)
    ElMessage.error(error.response?.data?.detail || '下架失败')
  }
}

const openGeoGebraEditor = (animation) => {
  router.push({
    path: '/admin/geogebra',
    query: { animationId: String(animation.id) }
  })
}

const batchPublish = async () => {
  if (!selectedAnimations.value.length) return

  let successCount = 0
  for (const animation of selectedAnimations.value) {
    if (animation.validation_status !== 'passed' || animation.is_published) {
      continue
    }

    try {
      await axios.put(`/api/animations/${animation.id}`, { is_published: true })
      successCount += 1
    } catch (error) {
      console.error(`发布课件 ${animation.title} 失败:`, error)
    }
  }

  ElMessage.success(`成功发布 ${successCount} 个课件`)
  selectedAnimations.value = []
  loadAnimations()
}

const showReview = (animation) => {
  activeAnimation.value = animation
  showReviewDialog.value = true
}

const handleUploadSubjectChange = async () => {
  uploadForm.value.textbook_path_ids = []
  await loadTextbookTree(uploadForm.value.subject_id)
}

const buildNodePath = (nodes, targetId, path = []) => {
  for (const node of nodes) {
    const currentPath = [...path, node.id]
    if (node.id === targetId) {
      return currentPath
    }
    if (node.children?.length) {
      const childPath = buildNodePath(node.children, targetId, currentPath)
      if (childPath.length) {
        return childPath
      }
    }
  }
  return []
}

const loadEditTextbookTree = async (subjectId, selectedNodeId = null) => {
  if (!subjectId) {
    editTextbookOptions.value = []
    editForm.value.textbook_path_ids = []
    return
  }
  try {
    const response = await axios.get('/api/animations/textbook-tree', {
      params: { subject_id: subjectId }
    })
    editTextbookOptions.value = response.data
    editForm.value.textbook_path_ids = selectedNodeId
      ? buildNodePath(response.data, selectedNodeId)
      : []
  } catch (error) {
    console.error('加载编辑教材目录失败:', error)
    editTextbookOptions.value = []
  }
}

const openEditDialog = async (animation) => {
  editTarget.value = animation
  editForm.value = {
    title: animation.title || '',
    author: animation.author || '',
    subject_id: animation.subject_id || null,
    textbook_path_ids: [],
    description: animation.description || '',
    grade_level: animation.grade_level || '',
    keywords: animation.keywords || ''
  }
  await loadEditTextbookTree(animation.subject_id, animation.textbook_node_id)
  showEditDialog.value = true
}

const handleEditSubjectChange = async () => {
  await loadEditTextbookTree(editForm.value.subject_id)
}

const submitEditDialog = async () => {
  if (!editTarget.value) return
  if (!editForm.value.title || !editForm.value.subject_id || !editForm.value.textbook_path_ids.length) {
    ElMessage.error('请填写标题、学科并选择所属章节')
    return
  }

  try {
    await axios.put(`/api/animations/${editTarget.value.id}`, {
      title: editForm.value.title,
      author: editForm.value.author,
      subject_id: editForm.value.subject_id,
      textbook_node_id: editForm.value.textbook_path_ids[editForm.value.textbook_path_ids.length - 1],
      description: editForm.value.description,
      grade_level: editForm.value.grade_level,
      keywords: editForm.value.keywords
    })
    ElMessage.success('课件信息已更新')
    resetEditDialog()
    loadAnimations()
  } catch (error) {
    console.error('更新课件信息失败:', error)
    ElMessage.error(error.response?.data?.detail || '更新课件信息失败')
  }
}

const openReplaceDialog = (animation) => {
  replaceTarget.value = animation
  replaceForm.value = {
    is_published: isAdmin.value ? animation.is_published : false
  }
  showReviewDialog.value = false
  showReplaceDialog.value = true
}

const replaceAnimationFile = async () => {
  if (!replaceTarget.value) return
  if (!replaceFileInput.value?.files?.[0]) {
    ElMessage.error('请选择新的 HTML 文件或 ZIP 课件包')
    return
  }

  const formData = new FormData()
  formData.append('file', replaceFileInput.value.files[0])
  formData.append('is_published', replaceForm.value.is_published)

  if (replaceThumbnailInput.value?.files?.[0]) {
    formData.append('thumbnail', replaceThumbnailInput.value.files[0])
  }

  try {
    const response = await axios.post(
      `/api/animations/${replaceTarget.value.id}/replace-file`,
      formData,
      { headers: { 'Content-Type': 'multipart/form-data' } }
    )

    const animation = response.data
    if (animation.validation_status === 'failed') {
      ElMessage.warning(animation.validation_summary || '修订版已上传，但校验未通过')
    } else if (animation.review_status === 'pending_review') {
      ElMessage.success('修订版已上传，等待审核')
    } else {
      ElMessage.success('修订版已上传并发布')
    }

    if (activeAnimation.value?.id === animation.id) {
      activeAnimation.value = animation
    }
    resetReplaceDialog()
    loadAnimations()
  } catch (error) {
    console.error('上传修订版失败:', error)
    await showUploadError(error, '上传修订版失败')
  }
}

const copyPrompt = async (prompt) => {
  try {
    await navigator.clipboard.writeText(prompt)
    ElMessage.success('Prompt 已复制')
  } catch (error) {
    console.error('复制 Prompt 失败:', error)
    ElMessage.error('复制失败')
  }
}

const deleteAnimation = async (id) => {
  try {
    await ElMessageBox.confirm('确定要删除这个课件吗？此操作不可恢复。', '删除确认', {
      confirmButtonText: '确定',
      cancelButtonText: '取消',
      type: 'warning'
    })

    await axios.delete(`/api/animations/${id}`)
    ElMessage.success('删除成功')
    loadAnimations()
  } catch (error) {
    if (error !== 'cancel') {
      console.error('删除失败:', error)
      ElMessage.error(error.response?.data?.detail || '删除失败')
    }
  }
}

const handleLogout = async () => {
  await userStore.logout()
  ElMessage.success('已退出登录')
  router.push('/login')
}

onMounted(() => {
  loadSubjects()
  loadAnimations()
})
</script>

<style scoped>
.manage-summary {
  margin-bottom: 18px;
  padding: 22px 24px;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
  flex-wrap: wrap;
}

.manage-summary-copy {
  margin-top: 10px;
  color: var(--app-text-muted);
  line-height: 1.8;
}

.summary-tag-group {
  display: flex;
  gap: 10px;
  flex-wrap: wrap;
}

.summary-tag {
  display: inline-flex;
  align-items: center;
  padding: 10px 14px;
  border-radius: 999px;
  background: rgba(255, 255, 255, 0.72);
  border: 1px solid rgba(84, 125, 173, 0.18);
  font-weight: 600;
}

.filter-panel {
  margin-bottom: 18px;
  padding: 18px;
}

.responsive-table {
  overflow-x: auto;
}

.manage-table {
  width: 100%;
}

.table-action-group {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  justify-content: flex-start;
}

.guide-shell {
  max-height: 70vh;
  overflow-y: auto;
  padding-right: 4px;
}

.guide-section {
  margin-bottom: 20px;
}

.guide-title {
  margin-bottom: 10px;
  font-size: 16px;
  font-weight: 700;
  color: var(--app-text);
}

.guide-list {
  display: flex;
  flex-direction: column;
  gap: 8px;
  color: var(--app-text-muted);
  line-height: 1.7;
}

.guide-action-row {
  margin-top: 10px;
  display: flex;
  justify-content: flex-end;
}

.manage-actions-col {
  display: flex;
  justify-content: flex-end;
  gap: 8px;
  flex-wrap: wrap;
}

@media (max-width: 900px) {
  .manage-actions-col {
    justify-content: stretch;
  }

  .manage-actions-col .el-button {
    width: 100%;
    margin-left: 0;
  }
}
</style>
