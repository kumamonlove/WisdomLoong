# 项目永久约束

- 禁止使用 GPT Sites、ChatGPT Sites 或任何相关 Sites 工具部署本项目。
- 禁止创建或恢复 `.openai/hosting.json`。
- 本项目的前端部署、后端、数据库和文件存储统一使用阿里云。
- 禁止继续使用 GitHub Pages 作为生产托管平台。
- GitHub 用于代码托管，并通过 GitHub Actions 在代码推送后自动部署最新版本到阿里云。
- 页面底部必须显示当前版本号，版本从 `v1.0.0` 开始；每次发布更新都必须同步提升 `package.json` 中的版本号。
- 后续如需迁移部署平台，必须由用户明确指定。
