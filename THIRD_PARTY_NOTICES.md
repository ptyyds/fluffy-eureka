# 第三方组件

应用代码采用根目录自定义许可证。第三方组件不因此更改许可。

| 组件 | 用途 | 上游许可 |
|---|---|---|
| Electron | 桌面运行时 | MIT，含 Chromium/Node.js 等独立许可 |
| mammoth | DOCX 文字提取 | BSD-2-Clause |
| ExcelJS | Excel 内容读取 | MIT |
| PDF.js / pdfjs-dist | PDF 文字提取 | Apache-2.0 |
| @napi-rs/canvas | PDF.js 运行支持 | MIT |
| electron-builder | 开发与打包 | MIT |

完整依赖版本见 pnpm-lock.yaml，各组件许可证以随包上游 LICENSE/NOTICE 为准。分发二进制时保留 Electron 的 LICENSE、LICENSES.chromium.html 及其他依赖声明。

赞赏图片由项目发起者提供，按其要求随项目展示并保留，不属于第三方依赖许可的替代品。
