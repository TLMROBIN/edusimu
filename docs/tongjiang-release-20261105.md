# 铜匠课件隔离修复与发布记录

2026-11-05：54 门课件（物理 10、化学 25、生物 5、地理 14）全部发布，动画 ID 285–338，作者字段均为“铜匠”，审核状态均为 `approved`，系统校验状态均为 `passed`。首页搜索“铜匠”确认显示 54 门。

## 修复内容

- 每门课件的原始 HTML 以 Base64 完整封装在本地隔离容器中，逐门核对原件 SHA-256；原动画脚本、样式与素材保持完整。原始下载目录里的 HTML 没有改写。
- 动画在不带 `allow-same-origin` 的 sandbox iframe 中执行。内容安全策略禁止联网、表单提交和嵌套远程页面；父页面、Cookie 与平台登录令牌不可读。
- 进度适配器仅允许读写本课件的 `lab3d:<slug>`，由可信容器写入独立的 `edusimu:tongjiang:progress:<slug>`。消息必须来自指定 iframe、来源为 `null`，并通过键名、JSON 格式和长度检查。
- 播放器停止向标记为隔离版的课件发送身份上下文；所有旧协议交互消息先校验实际 iframe、同源来源和载荷大小。合法旧课件协议仍保留。
- 课件“目录”按钮返回系统首页；课件内全屏获准使用。

实现：[封装模板](../scripts/tongjiang_isolated_wrapper.html)、[生成器](../scripts/build_tongjiang_isolated.py)、[播放器](../frontend/src/views/AnimationPlayer.vue)、[消息校验](../frontend/src/utils/coursewareBridge.js)。sandbox 方案依据 [WHATWG iframe 规范](https://html.spec.whatwg.org/multipage/iframe-embed-object.html)。

## 验证证据

- 54/54：原版与隔离版桌面浏览器加载成功，文字、视口、画布尺寸一致，3D 绘制与步骤切换正常。
- 54/54：隔离版无法访问父页面、顶层页面、Cookie 或登录令牌；外部请求被内容安全策略阻止。
- 54 组截图已对照，并人工检查了物理、化学、生物、地理代表页面。最大平均通道像素差为 2.05/255，未观察到素材缺失或布局改变。
- 54/54：服务器修订文件与生成包字节一致；54 个旧版未隔离文件链接均返回 404。
- 线上抽查：身份上下文不再发送给隔离版，伪造交互不产生请求；进度刷新后保留，越权进度消息被拒绝；目录返回、随堂检测、全屏正常。
- 触控模拟：收到 `touch` 类型指针事件，画布 `touch-action` 实际值为 `none`，拖动后 3D 相机位置改变。
- 前端消息校验及 API 路径测试 4/4 通过，前端生产构建成功。
- 实体平板、软键盘及真实课堂验收尚未进行。

## 发布与备份

通过现有服务器部署入口发布前端，并先备份数据库、54 门原课件与前端资源。服务器备份目录：`/var/backups/edusimu/tongjiang-isolation-20261105T081802Z`。

逐课结果与哈希：[发布 JSON](../tmp/tongjiang-release-20261105.json)、[逐门浏览器检查](../tmp/tongjiang-runtime-audit.json)、[截图比较](../tmp/tongjiang-visual-comparison.json)。截图位于 `tmp/tongjiang-screenshots/`。

发布采用普通审核流程，54 门均未使用强制发布。
