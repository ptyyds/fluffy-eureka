# 鲸台 WhaleDesk

Windows 本地 AI 工作台：解析本地资料、预览文件行动，并尝试复用 DeepSeek 网页会话进行对话。

**当前为 0.3.0 开发预览，源码公开并附加赞赏入口保留条款，不采用 MIT，不宣称 OSI 标准开源。**

## 当前状态

可用：目录浏览；DOCX、XLSX/XLSM、文字 PDF 和常见文本的文字提取；文件正文预览；新建文本、创建目录、移动文件；当前会话撤销；逐条确认的 PowerShell；技能、操作记录、赞赏页面。

试验功能：本地聊天、网页自动发送与回复采集、行动计划衔接。测试页面上的闭环通过，不等于真实账号已联网成功。

已知问题：当前机器的内置 DeepSeek 页面报 ERR_CONNECTION_CLOSED，尚未修复。不要将本版本描述为已经稳定连接 DeepSeek。需要时可用常用浏览器配合复制任务、粘贴计划。

尚不支持：压缩包、扫描件 OCR、图片内容识别、旧 DOC/XLS、CAD 原生内容解析、Office 原生编辑、无人值守任务。

## 运行与打包

需要 Windows x64、Node.js 24 或更新受支持版本、pnpm 11。

```powershell
pnpm install --frozen-lockfile
node node_modules/electron/install.js
pnpm start
pnpm test
pnpm pack
pnpm dist
```

安装包写入 package.json 中 build.directories.output 指定的目录。0.3.0 源码包不附带已验证的正式安装包；此前安装版为 0.2.0。

## 使用

完整步骤见 [安装与首次使用](docs/INSTALL.md)。交流 QQ 群：**912751779**（3年6班），应用侧栏提供「交流群与帮助」扫码入口。仓库尚未提供的安装包不能用 Source code ZIP 替代。

1. 添加本地文件，点击文件名检查提取正文。也可选择文件夹并浏览子目录。
2. 输入任务，预览要发送的文件清单和正文。仅确认后发送。
3. 网页不可用时，复制完整任务到普通浏览器的 DeepSeek，再将 JSON 回复粘贴回来。
4. 预览行动计划，确认执行。回执先留在本地，检查后再发送。
5. 直聊试验模式先检测连接；登录和人机验证由使用者完成。

每文件最多 20 MB、50000 字符；最多 8 个附件，一轮正文合计最多 100000 字符。Excel/PDF 有行列和页数限制，截断会标注。文字提取不等于完整视觉理解。

## 数据与权限

网页登录状态与配置保存在本机 Electron userData。模型推理仍在 DeepSeek 服务端；确认发送的资料会交给该服务。附件正文不保存到本地状态 JSON，但发送后会进入网页对话。

普通文件工具限制在所选工作文件夹，拒绝链接越界，新建和移动不覆盖现有目标。PowerShell 不受工作文件夹隔离，也无法一键撤销。撤销栈关闭应用或切换工作区后失效。

## 赞赏与许可

赞赏完全自愿，不影响现有功能。官方界面没有隐藏或删除入口的设置。分发衍生版本必须保留主导航入口、页面和原始支付宝/微信赞赏码，具体以 LICENSE 为准。这是许可约定，不是无法修改源码的技术锁。

![赞赏界面](docs/support-preview.png)

## 贡献与反馈

见 CONTRIBUTING.md、SECURITY.md、CHANGELOG.md 和 docs/ARCHITECTURE.md。请勿提交账号 Cookie、密钥、个人文档、聊天记录或付款截图。

## 来源说明

项目应用代码从零编写，产品思路参考 DeepSeek Harness、dsh-web-bridge、DSH Desktop 等项目，未宣称集成其全部功能，也不是 DeepSeek 官方产品。运行时依赖分别遵循各自许可证，见 THIRD_PARTY_NOTICES.md。
