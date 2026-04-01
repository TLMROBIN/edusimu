export const GEOGEBRA_SOURCE_TYPE = 'geogebra'
export const GEOGEBRA_RUNTIME_SCRIPT_URL = '/geogebra/GeoGebra/deployggb.js'
export const GEOGEBRA_HTML5_CODEBASE = '/geogebra/GeoGebra/HTML5/5.0/web3d/'

export const DEFAULT_GEOGEBRA_SETTINGS = {
  appName: 'classic',
  perspective: '',
  language: 'zh',
  country: 'CN',
  showToolBar: true,
  showAlgebraInput: false,
  showMenuBar: false,
  showResetIcon: false,
  showZoomButtons: true,
  enableRightClick: false,
  enableLabelDrags: true,
  enableShiftDragZoom: false,
  showGrid: false,
  showAxes: true,
  coordSystem: {
    xmin: -2,
    xmax: 8,
    ymin: -2,
    ymax: 6
  }
}

export const DEFAULT_GEOGEBRA_SCRIPT = `await helpers.runCommands([
  'A=(0,0)',
  'B=(4,0)',
  'C=(2,3)',
  'poly = Polygon(A, B, C)',
  'mid = Midpoint(A, B)',
  'tip = Text("拖动顶点观察三角形变化", (0.5, 4.5))'
])

api.setColor('poly', 46, 134, 222)
api.setFilling('poly', 0.28)
api.setPointSize('A', 7)
api.setPointSize('B', 7)
api.setPointSize('C', 7)
api.setFixed('tip', true, false)`

const DEFAULT_MAX_LOGS = 60

const escapeHtml = (value = '') =>
  String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')

const escapeScriptText = (value = '') => String(value).replace(/<\/script/gi, '<\\/script')

const normalizeCoordSystem = (coordSystem = {}) => {
  const toFiniteNumber = (value, fallback) => {
    const parsed = Number(value)
    return Number.isFinite(parsed) ? parsed : fallback
  }

  return {
    xmin: toFiniteNumber(coordSystem.xmin, DEFAULT_GEOGEBRA_SETTINGS.coordSystem.xmin),
    xmax: toFiniteNumber(coordSystem.xmax, DEFAULT_GEOGEBRA_SETTINGS.coordSystem.xmax),
    ymin: toFiniteNumber(coordSystem.ymin, DEFAULT_GEOGEBRA_SETTINGS.coordSystem.ymin),
    ymax: toFiniteNumber(coordSystem.ymax, DEFAULT_GEOGEBRA_SETTINGS.coordSystem.ymax)
  }
}

const normalizeSettings = (settings = {}) => ({
  ...DEFAULT_GEOGEBRA_SETTINGS,
  ...settings,
  coordSystem: normalizeCoordSystem(settings.coordSystem || DEFAULT_GEOGEBRA_SETTINGS.coordSystem)
})

const toFilename = (title = 'geogebra-courseware') => {
  const normalized = String(title)
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9\u4e00-\u9fa5_-]+/gi, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '')

  return normalized || 'geogebra-courseware'
}

export function buildGeoGebraCoursewareHtml(payload = {}) {
  const title = (payload.title || 'GeoGebra 课件').trim() || 'GeoGebra 课件'
  const description = (payload.description || '使用本地 GeoGebra 引擎生成的互动课件。').trim()
  const gradeLevel = (payload.gradeLevel || '').trim()
  const keywords = (payload.keywords || '').trim()
  const settings = normalizeSettings(payload.settings)
  const script = payload.script || DEFAULT_GEOGEBRA_SCRIPT

  const manifest = {
    title,
    description,
    gradeLevel,
    keywords,
    sourceType: GEOGEBRA_SOURCE_TYPE,
    settings,
    script,
    runtime: {
      deployUrl: GEOGEBRA_RUNTIME_SCRIPT_URL,
      codebase: GEOGEBRA_HTML5_CODEBASE
    }
  }

  return `<!DOCTYPE html>
<html lang="zh-CN">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover" />
  <title>${escapeHtml(title)}</title>
  <style>
    :root {
      color-scheme: light;
      --page-bg: #edf4fb;
      --panel-bg: rgba(255, 255, 255, 0.94);
      --panel-border: rgba(98, 139, 186, 0.18);
      --accent: #1661ff;
      --accent-soft: #12a9c4;
      --text: #10233f;
      --muted: #617897;
      --success: #25a870;
      --warning: #e69b2d;
      --danger: #f15b6c;
      --shadow: 0 24px 56px rgba(21, 46, 79, 0.12);
    }

    * {
      box-sizing: border-box;
    }

    html, body {
      margin: 0;
      min-height: 100%;
      background:
        radial-gradient(circle at top left, rgba(18, 169, 196, 0.16), transparent 32%),
        linear-gradient(180deg, #f8fbff 0%, var(--page-bg) 100%);
      color: var(--text);
      font-family: "PingFang SC", "Microsoft YaHei", "Noto Sans SC", "Segoe UI", sans-serif;
      touch-action: manipulation;
    }

    body {
      min-height: 100vh;
    }

    .page-shell {
      min-height: 100vh;
      display: flex;
      flex-direction: column;
      gap: 14px;
      padding: 16px;
    }

    .panel {
      background: var(--panel-bg);
      border: 1px solid var(--panel-border);
      border-radius: 24px;
      box-shadow: var(--shadow);
      backdrop-filter: blur(18px);
    }

    .header-panel {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 16px;
      padding: 18px 20px;
      flex-wrap: wrap;
    }

    .title-block {
      min-width: 0;
      flex: 1 1 320px;
      display: flex;
      align-items: center;
      gap: 16px;
      flex-wrap: wrap;
    }

    .title-copy {
      min-width: 0;
      flex: 1 1 240px;
    }

    .eyebrow {
      display: inline-flex;
      align-items: center;
      gap: 8px;
      font-size: 12px;
      font-weight: 700;
      letter-spacing: 0.08em;
      color: var(--accent);
      text-transform: uppercase;
      margin-bottom: 8px;
    }

    .eyebrow::before {
      content: "";
      width: 10px;
      height: 10px;
      border-radius: 999px;
      background: linear-gradient(135deg, var(--accent), var(--accent-soft));
      box-shadow: 0 0 16px rgba(22, 97, 255, 0.25);
    }

    h1 {
      margin: 0;
      font-size: clamp(24px, 3vw, 34px);
      line-height: 1.2;
    }

    .status-pill {
      display: inline-flex;
      align-items: center;
      gap: 10px;
      padding: 10px 14px;
      border-radius: 16px;
      border: 1px solid rgba(98, 139, 186, 0.16);
      background: rgba(245, 249, 255, 0.96);
    }

    .status-label {
      font-size: 12px;
      font-weight: 700;
      color: var(--muted);
      letter-spacing: 0.08em;
      text-transform: uppercase;
    }

    .header-actions {
      display: flex;
      align-items: center;
      gap: 10px;
      flex-wrap: wrap;
    }

    button {
      appearance: none;
      border: none;
      border-radius: 14px;
      padding: 12px 18px;
      font: inherit;
      font-weight: 700;
      cursor: pointer;
      transition: transform 0.2s ease, box-shadow 0.2s ease, opacity 0.2s ease;
      touch-action: manipulation;
    }

    button:hover {
      transform: translateY(-1px);
    }

    button.primary {
      background: linear-gradient(135deg, var(--accent), var(--accent-soft));
      color: #fff;
      box-shadow: 0 12px 26px rgba(22, 97, 255, 0.2);
    }

    button.secondary {
      background: rgba(245, 249, 255, 0.96);
      color: var(--text);
      border: 1px solid rgba(98, 139, 186, 0.2);
    }

    .content-grid {
      flex: 1;
      min-height: 0;
      display: grid;
      grid-template-columns: minmax(0, 1fr) 280px;
      gap: 14px;
    }

    .stage-panel {
      display: flex;
      flex-direction: column;
      min-height: 0;
      overflow: hidden;
    }

    .status-text {
      font-size: 13px;
      color: var(--muted);
      font-weight: 700;
    }

    .status-text[data-level="success"] {
      color: var(--success);
    }

    .status-text[data-level="warning"] {
      color: var(--warning);
    }

    .status-text[data-level="error"] {
      color: var(--danger);
    }

    .applet-shell {
      flex: 1;
      min-height: 0;
      padding: 12px 18px 18px;
    }

    #ggb-element {
      width: 100%;
      min-height: 68vh;
      height: 100%;
      background: linear-gradient(180deg, rgba(248, 251, 255, 0.94), rgba(240, 246, 255, 0.86));
      border: 1px solid rgba(98, 139, 186, 0.14);
      border-radius: 20px;
      overflow: hidden;
    }

    .info-panel {
      padding: 20px;
      display: flex;
      flex-direction: column;
      gap: 16px;
    }

    .info-card-title {
      margin: 0;
      font-size: 17px;
      font-weight: 700;
    }

    .info-block {
      display: flex;
      flex-direction: column;
      gap: 8px;
    }

    .info-label {
      font-size: 12px;
      font-weight: 700;
      color: var(--muted);
      letter-spacing: 0.06em;
      text-transform: uppercase;
    }

    .info-value {
      font-size: 14px;
      line-height: 1.6;
      color: var(--text);
      white-space: pre-wrap;
      word-break: break-word;
    }

    .meta-pill-group {
      display: flex;
      flex-wrap: wrap;
      gap: 8px;
    }

    .meta-pill {
      display: inline-flex;
      align-items: center;
      padding: 7px 12px;
      border-radius: 999px;
      background: rgba(22, 97, 255, 0.08);
      color: var(--accent);
      font-size: 12px;
      font-weight: 700;
    }

    .script-tip {
      margin: 0;
      font-size: 13px;
      color: var(--muted);
      line-height: 1.7;
    }

    @media (max-width: 960px) {
      .page-shell {
        padding: 12px;
      }

      .header-actions {
        width: 100%;
      }

      .header-actions button {
        flex: 1;
      }

      .content-grid {
        grid-template-columns: 1fr;
      }

      #ggb-element {
        min-height: 58vh;
      }
    }
  </style>
</head>
<body>
  <div class="page-shell" id="courseware-root">
    <section class="panel header-panel">
      <div class="title-block">
        <div class="title-copy">
          <div class="eyebrow">GeoGebra Local Courseware</div>
          <h1>${escapeHtml(title)}</h1>
        </div>
        <div class="status-pill">
          <span class="status-label">状态</span>
          <div class="status-text" id="status-text" data-level="info">正在准备本地 GeoGebra 引擎…</div>
        </div>
      </div>
      <div class="header-actions">
        <button id="rerun-button" class="secondary" type="button">重新执行脚本</button>
        <button id="reset-button" class="primary" type="button">重置课件</button>
      </div>
    </section>

    <section class="content-grid">
      <div class="panel stage-panel">
        <div class="applet-shell">
          <div id="ggb-element"></div>
        </div>
      </div>

      <aside class="panel info-panel">
        <div class="info-block">
          <h2 class="info-card-title">课件信息</h2>
          <div class="meta-pill-group">
            <span class="meta-pill">GeoGebra</span>
            <span class="meta-pill">${escapeHtml(settings.appName)}</span>
            ${gradeLevel ? `<span class="meta-pill">${escapeHtml(gradeLevel)}</span>` : ''}
          </div>
        </div>

        <div class="info-block">
          <div class="info-label">关键词</div>
          <div class="info-value">${escapeHtml(keywords || '未填写')}</div>
        </div>

        <div class="info-block">
          <div class="info-label">交互提示</div>
          <p class="script-tip">可直接拖动对象、点击控件，或使用右上方“重置课件”恢复初始状态。该课件运行时只依赖站内本地 GeoGebra 资源。</p>
        </div>
      </aside>
    </section>
  </div>

  <script id="edusimu-geogebra-manifest" type="application/json">${escapeScriptText(JSON.stringify(manifest))}</script>
  <script>
    (() => {
      const manifestElement = document.getElementById('edusimu-geogebra-manifest')
      const manifest = JSON.parse(manifestElement.textContent || '{}')
      const statusText = document.getElementById('status-text')
      const resetButton = document.getElementById('reset-button')
      const rerunButton = document.getElementById('rerun-button')
      const coursewareRoot = document.getElementById('courseware-root')
      const MAX_LOGS = ${DEFAULT_MAX_LOGS}

      const postMessageToParent = (type, payload = {}) => {
        try {
          if (window.parent && window.parent !== window) {
            window.parent.postMessage({ type, ...payload }, '*')
          }
        } catch (error) {
          console.warn('postMessage failed', error)
        }
      }

      const setStatus = (level, message, detail = null) => {
        statusText.dataset.level = level
        statusText.textContent = message
        postMessageToParent('GEOGEBRA_PREVIEW_LOG', {
          level,
          message,
          detail,
          ts: Date.now()
        })
      }

      const postInteraction = (() => {
        let lastTime = 0
        return (interactionType, data = {}) => {
          const now = Date.now()
          if (now - lastTime < 220) {
            return
          }
          lastTime = now
          postMessageToParent('ANIMATION_INTERACTION', {
            interactionType,
            data
          })
        }
      })()

      const createHelpers = (api) => ({
        delay(ms = 0) {
          return new Promise(resolve => window.setTimeout(resolve, ms))
        },
        async runCommands(commands = []) {
          for (const command of commands) {
            if (!command || !String(command).trim()) {
              continue
            }
            const success = api.evalCommand(String(command))
            if (!success) {
              throw new Error('GeoGebra 命令执行失败: ' + command)
            }
          }
        },
        setView(view = {}) {
          const { xmin, xmax, ymin, ymax } = view
          if ([xmin, xmax, ymin, ymax].every(item => Number.isFinite(item))) {
            api.setCoordSystem(xmin, xmax, ymin, ymax)
          }
        },
        postInteraction,
        getManifest() {
          return manifest
        }
      })

      const applyInitialView = (api) => {
        const settings = manifest.settings || {}
        const coordSystem = settings.coordSystem || {}
        if (
          typeof api.setCoordSystem === 'function' &&
          [coordSystem.xmin, coordSystem.xmax, coordSystem.ymin, coordSystem.ymax].every(item => Number.isFinite(item))
        ) {
          api.setCoordSystem(coordSystem.xmin, coordSystem.xmax, coordSystem.ymin, coordSystem.ymax)
        }
        if (typeof settings.showGrid === 'boolean' && typeof api.setGridVisible === 'function') {
          try {
            api.setGridVisible(settings.showGrid)
          } catch (error) {
            console.warn('setGridVisible failed', error)
          }
        }
        if (typeof settings.showAxes === 'boolean' && typeof api.setAxesVisible === 'function') {
          try {
            api.setAxesVisible(settings.showAxes, settings.showAxes)
          } catch (error) {
            console.warn('setAxesVisible failed', error)
          }
        }
        if (settings.perspective && typeof api.setPerspective === 'function') {
          try {
            api.setPerspective(settings.perspective)
          } catch (error) {
            console.warn('setPerspective failed', error)
          }
        }
      }

      const bindInteractionBridge = (api) => {
        coursewareRoot.addEventListener('pointerdown', event => {
          const target = event.target
          postInteraction('courseware-pointerdown', {
            tagName: target && target.tagName ? target.tagName : 'UNKNOWN',
            id: target && target.id ? target.id : null
          })
        }, { passive: true })

        if (typeof api.registerClickListener === 'function') {
          api.registerClickListener(objectName => {
            postInteraction('geogebra-object-click', {
              objectName: objectName || ''
            })
          })
        }
      }

      const executeUserScript = async (api) => {
        const helpers = createHelpers(api)
        const scriptRunner = new Function(
          'api',
          'helpers',
          'manifest',
          '"use strict"; return (async () => {\\n' + (manifest.script || '') + '\\n})();'
        )

        await scriptRunner(api, helpers, manifest)
      }

      const createThumbnailDataUrl = () => {
        const sourceCanvas = document.querySelector('#ggb-element canvas')
        if (!sourceCanvas) {
          throw new Error('当前预览中未找到可截图的 GeoGebra 画布。')
        }

        const outputCanvas = document.createElement('canvas')
        outputCanvas.width = 320
        outputCanvas.height = 180
        const context = outputCanvas.getContext('2d')
        if (!context) {
          throw new Error('缩略图画布初始化失败。')
        }

        context.fillStyle = '#f4f8ff'
        context.fillRect(0, 0, outputCanvas.width, outputCanvas.height)

        const innerWidth = outputCanvas.width - 24
        const innerHeight = outputCanvas.height - 24
        const scale = Math.min(innerWidth / sourceCanvas.width, innerHeight / sourceCanvas.height)
        const drawWidth = sourceCanvas.width * scale
        const drawHeight = sourceCanvas.height * scale
        const drawX = (outputCanvas.width - drawWidth) / 2
        const drawY = (outputCanvas.height - drawHeight) / 2

        context.save()
        context.fillStyle = '#ffffff'
        context.strokeStyle = 'rgba(73, 122, 184, 0.18)'
        context.lineWidth = 1
        context.beginPath()
        context.roundRect(10, 10, outputCanvas.width - 20, outputCanvas.height - 20, 16)
        context.fill()
        context.stroke()
        context.clip()
        context.drawImage(sourceCanvas, drawX, drawY, drawWidth, drawHeight)
        context.restore()

        context.fillStyle = 'rgba(16, 35, 63, 0.82)'
        context.font = '600 13px "PingFang SC", "Microsoft YaHei", sans-serif'
        context.fillText(manifest.title || 'GeoGebra 课件', 18, outputCanvas.height - 18)

        return outputCanvas.toDataURL('image/png')
      }

      const resolveRuntimeUrl = (value, fallback) => {
        const rawValue = typeof value === 'string' && value.trim() ? value.trim() : fallback

        try {
          return new URL(rawValue, window.location.origin).toString()
        } catch (error) {
          console.warn('GeoGebra 运行库地址解析失败，将回退到默认地址。', error)
          return new URL(fallback, window.location.origin).toString()
        }
      }

      const runtimeDeployUrl = resolveRuntimeUrl(
        manifest.runtime && manifest.runtime.deployUrl,
        '${GEOGEBRA_RUNTIME_SCRIPT_URL}'
      )
      const runtimeCodebase = resolveRuntimeUrl(
        manifest.runtime && manifest.runtime.codebase,
        '${GEOGEBRA_HTML5_CODEBASE}'
      )

      const ensureRuntimeLoaded = () => {
        if (typeof window.GGBApplet === 'function') {
          return Promise.resolve()
        }

        return new Promise((resolve, reject) => {
          const existingScript = document.querySelector('script[data-geogebra-runtime="true"]')
          if (existingScript) {
            existingScript.addEventListener('load', () => resolve(), { once: true })
            existingScript.addEventListener('error', () => reject(new Error('GeoGebra 运行库脚本加载失败。')), { once: true })
            return
          }

          const script = document.createElement('script')
          script.src = runtimeDeployUrl
          script.async = true
          script.dataset.geogebraRuntime = 'true'
          script.addEventListener('load', () => resolve(), { once: true })
          script.addEventListener('error', () => reject(new Error('GeoGebra 运行库脚本加载失败。')), { once: true })
          document.head.appendChild(script)
        })
      }

      const mountApplet = async () => {
        try {
          await ensureRuntimeLoaded()
        } catch (error) {
          setStatus('error', 'GeoGebra 运行库加载失败：' + runtimeDeployUrl, {
            detail: error && error.message ? error.message : String(error)
          })
          return
        }

        if (typeof window.GGBApplet !== 'function') {
          setStatus('error', '未检测到 GeoGebra 运行库：' + runtimeDeployUrl)
          return
        }

        const settings = manifest.settings || {}
        const applet = new window.GGBApplet({
          appName: settings.appName || 'classic',
          showToolBar: !!settings.showToolBar,
          showAlgebraInput: !!settings.showAlgebraInput,
          showMenuBar: !!settings.showMenuBar,
          showResetIcon: !!settings.showResetIcon,
          showZoomButtons: !!settings.showZoomButtons,
          enableRightClick: !!settings.enableRightClick,
          enableLabelDrags: settings.enableLabelDrags !== false,
          enableShiftDragZoom: !!settings.enableShiftDragZoom,
          useBrowserForJS: true,
          language: settings.language || 'zh',
          country: settings.country || 'CN',
          borderColor: '#dce7f7',
          appletOnLoad: async api => {
            window.ggbApplet = api
            bindInteractionBridge(api)
            applyInitialView(api)
            setStatus('warning', 'GeoGebra 已加载，正在执行脚本…')

            try {
              await executeUserScript(api)
              setStatus('success', 'GeoGebra 脚本执行完成。')
              postMessageToParent('GEOGEBRA_PREVIEW_READY', {
                title: manifest.title,
                appName: settings.appName || 'classic'
              })
            } catch (error) {
              console.error(error)
              setStatus('error', '脚本执行失败：' + (error && error.message ? error.message : String(error)), {
                stack: error && error.stack ? String(error.stack).slice(0, MAX_LOGS * 200) : null
              })
            }
          }
        }, true)

        if (typeof applet.setHTML5Codebase === 'function') {
          applet.setHTML5Codebase(runtimeCodebase)
        }

        applet.inject('ggb-element', 'preferhtml5')
      }

      resetButton.addEventListener('click', () => {
        if (window.ggbApplet && typeof window.ggbApplet.reset === 'function') {
          window.ggbApplet.reset()
          setStatus('success', '课件已重置到初始状态。')
          postInteraction('geogebra-reset')
        }
      })

      rerunButton.addEventListener('click', () => {
        postInteraction('geogebra-rerun')
        window.location.reload()
      })

      window.addEventListener('message', event => {
        const data = event.data || {}
        if (data.type !== 'EDUSIMU_CAPTURE_THUMBNAIL') {
          return
        }

        try {
          const dataUrl = createThumbnailDataUrl()
          postMessageToParent('GEOGEBRA_THUMBNAIL_READY', {
            requestId: data.requestId || null,
            dataUrl
          })
        } catch (error) {
          postMessageToParent('GEOGEBRA_THUMBNAIL_ERROR', {
            requestId: data.requestId || null,
            message: error && error.message ? error.message : 'GeoGebra 缩略图生成失败'
          })
        }
      })

      window.addEventListener('error', event => {
        setStatus('error', '运行时错误：' + (event.message || '未知错误'))
      })

      window.addEventListener('unhandledrejection', event => {
        const reason = event.reason && event.reason.message ? event.reason.message : String(event.reason || '未知错误')
        setStatus('error', '脚本 Promise 拒绝：' + reason)
      })

      window.addEventListener('load', () => {
        void mountApplet()
      })
    })()
  </script>
</body>
</html>`
}

export function buildGeoGebraCoursewareFile(payload = {}) {
  const html = buildGeoGebraCoursewareHtml(payload)
  return new File([html], `${toFilename(payload.title)}.html`, {
    type: 'text/html;charset=utf-8'
  })
}
