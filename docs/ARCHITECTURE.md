# 结构与边界

src/main.cjs：主进程、会话管理、受限 IPC、文件与命令执行。
src/preload.cjs：仅向本地 UI 暴露白名单方法。
src/core.cjs：工具协议、工作区边界和撤销。
src/documents.cjs、file-worker.cjs：文档解析与资源限制。
src/session-bridge.cjs、session-adapter.cjs：试验性网页会话发送和采集。
src/renderer.js、chat.js：本地工作台与聊天。
src/support.js、support.html：固定赞赏入口和页面。

远程网页没有 Node 或本地 preload，不得直接执行本地操作。模型回复最多成为待审阅计划。通用命令单独确认。页面输出按不可信内容处理。

测试命令 pnpm test 覆盖工具边界、文档读取和会话状态机。UI 测试需要另装 Playwright；自有测试页面成功不能证明第三方网站可联网、可登录或可稳定使用。
