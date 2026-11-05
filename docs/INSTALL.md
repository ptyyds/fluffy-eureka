# 安装与首次使用

## Windows 安装包

项目地址：https://github.com/ptyyds/fluffy-eureka

进入仓库 Releases，选择实际已发布的 Windows x64 安装包 `WhaleDesk-版本号-Setup.exe`。不要把 GitHub 自动生成的 Source code ZIP 当成安装程序。

已发布 [0.3.0 Windows x64 开发预览安装包](https://github.com/ptyyds/fluffy-eureka/releases/tag/v0.3.0-preview)，附 SHA-256 校验值。此版本包含赞赏与交流群页面；网页连接问题仍未修复。需要自行开发时，可使用下方源码运行方式。

运行安装包并按向导选择位置。更新前保存任务、退出旧窗口。安装包目前未签名；请先核对仓库来源和发布说明，不要关闭系统安全防护。

## 从源码运行

准备 Windows x64、Node.js 24、pnpm 11，然后在终端运行：

```powershell
git clone https://github.com/ptyyds/fluffy-eureka.git
cd fluffy-eureka
pnpm install --frozen-lockfile
node node_modules/electron/install.js
pnpm start
```

开发者验证：`pnpm test`。生成 Windows 安装包：`pnpm dist`，输出位置以 package.json 的 build.directories.output 为准。

## 第一次使用

1. 点击添加本地文件，选择 DOCX、XLSX/XLSM、文字 PDF 或常见文本。
2. 点击文件名检查提取结果。也可选择工作文件夹，浏览子文件夹并添加资料。
3. 输入需求，检查即将发送的目录清单和文件正文，再确认发送。
4. 内置网页不能连接时，在普通浏览器打开 DeepSeek，使用预览并复制完整任务，再粘贴模型的行动计划回来。
5. 检查文件路径和操作清单后执行。命令权限高于文件工具，请逐条检查。

每个输入文件最多20MB，正文最多50000字符；超限会截断并提示。添加文件不等于已经上传到模型。

## 常见问题

- 内置网页空白或 ERR_CONNECTION_CLOSED：当前是已知未解决问题，先用普通浏览器方式。不要把测试页面验证当成真实服务已连通。
- 文件无法读取：旧 DOC/XLS 请另存为 DOCX/XLSX；扫描 PDF、图片、CAD 原生格式和压缩包暂不支持内容解析。
- 找不到成果：检查执行回执与所选工作文件夹。失败步骤之后的操作可能没有执行。
- 无法撤销：仅支持本次进程中部分文件操作；关闭应用、切换工作区或文件被其他程序修改后可能无法撤销。命令不能一键撤销。

## QQ 交流与反馈

QQ群：**912751779**，群名：**3年6班**。可以在应用「交流群与帮助」中扫码，或使用 QQ 搜索群号。二维码失效或群限制加入时，以群设置为准。

![QQ交流群二维码](../assets/community-qq.jpg)

反馈请提供版本、系统、复现步骤与脱敏错误截图，不要公开个人文件、账号、Cookie、密码或密钥。
