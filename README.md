# Fit AI Coach

这是一个面向手机 App 打包与云端 AI 训练管理的全栈项目，目标不是单纯记录动作，而是让 AI 参与并推进整套训练流程。

当前已经具备这些核心能力：
- 云端训练历史
- AI 自动复盘
- AI 长期记忆
- AI 周计划重排
- AI 对话后可一键替换整周计划
- AI 对话后可一键替换当天动作
- 自定义动作库
- B 站动作视频与搜索兜底
- Android APK 打包

## 项目结构

`client`
React + Vite + Capacitor 安卓壳

`server`
Express + SQLite + AI 工作流编排

## 本地启动

先安装依赖：

```powershell
npm install
```

启动前后端开发环境：

```powershell
npm run dev
```

默认地址：
- 前端：`http://localhost:5173`
- 后端：`http://localhost:8787`

## AI 配置

后端配置文件在：

`server/.env`

支持配置：
- `AI_API_ENDPOINT`
- `AI_API_KEY`
- `AI_MODEL`

## Android 打包

进入前端目录后执行：

```powershell
npm run build
npm run cap:sync
cd android
.\gradlew.bat assembleDebug
```

输出 APK：

`client/android/app/build/outputs/apk/debug/app-debug.apk`

另外项目根目录会保留一份方便查找的安装包：

`FitAI-Android-debug.apk`

## 当前闭环

1. 用户维护训练画像
2. 用户同步今日恢复状态
3. 用户记录训练动作
4. 后端写入云端历史
5. AI 根据画像、恢复、历史和长期记忆生成结论
6. AI 自动更新下一次目标、风险提醒、PR 目标和动作替换建议
7. 用户可以通过 AI 对话直接替换计划并写回系统

## 后续可继续增强

- 多用户账号系统
- 外网正式部署数据库
- 发布版签名 APK / AAB
- 更多训练模板、超级组和周期化规则
