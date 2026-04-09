# Render 外网部署说明

这份项目已经准备好了 Render Blueprint 文件：

- [render.yaml](D:/健身/fit-ai-app/render.yaml)

## 为什么这里用 `starter` 而不是 `free`

当前后端把训练历史、AI 长期记忆和周计划保存在本地 SQLite 文件：

- [fit-ai.db](D:/健身/fit-ai-app/server/data/fit-ai.db)

Render 的普通文件系统是临时的，服务重启或重新部署后会丢失文件。  
如果你要“真正云端训练历史 + AI 长期记忆”，就必须给服务挂一个持久化磁盘。

持久化磁盘只能挂在付费服务上，所以我这里把 Render 服务计划写成了 `starter`。

## 当前 Blueprint 会创建什么

一个 Node Web Service：

- 服务名：`fit-ai-coach-api`
- 根目录：`server`
- 健康检查：`/api/bootstrap`
- 磁盘挂载目录：`/opt/render/project/src/server/data`

这样后端继续用 SQLite，也能先稳定跑公网版本。

## 还差哪一步

现在项目目录还不是一个已经推到 GitHub / GitLab / Bitbucket 的远程仓库。  
Render 部署这一步必须要有远程 Git 仓库。

## 你下一步要做什么

最简单的顺序：

1. 在 GitHub 新建一个空仓库
2. 把 `D:\健身\fit-ai-app` 推上去
3. 在 Render 里导入这个仓库
4. 部署时把 `AI_API_KEY` 填进去
5. 部署成功后，把公网地址填到手机 App 的“手机端后端地址”

## 手机上要填什么

部署成功后，你会拿到一个公网地址，类似：

`https://fit-ai-coach-api.onrender.com`

你把它填到手机 App 设置页的：

`手机端后端地址`

然后 App 就会开始真正走云端历史、AI 长期记忆和 AI 自动重排计划。

## 我建议的后续升级

这版是“先最快可上线”的方案。  
后面更正规的一步是把 SQLite 迁移到 Postgres，这样会更适合真正长期使用，也更利于以后加用户系统和多端同步。
