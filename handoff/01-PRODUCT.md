# 交接 1/3 · 产品合同

给本机 Codex 和安装者。读完再读 [02-AUDIT.md](02-AUDIT.md)。

## 这是什么

GrokBot 是 Mac 桌宠：无框透明 Electron 窗，Canvas 画一张会动的脸。  
Web 预览（`npm run dev`）和 Mac 宠物（`npm run pet`）共用 `src/lib/grokbot/pet-shell.ts`。

不是聊天机器人。不存 token。Grok Brief 优先本机 `grok` CLI（用户自己的 SuperGrok 账号），没有 CLI 才用环境变量 `XAI_API_KEY`。

## 不要改的产品约束

- 空闲会随机蹦（Play），不要加粒子
- 点一下开面板；睡着点一下只叫醒
- 球必须能贴到屏幕四边四角
- 九个动作按钮必须同时可见：Idle Blink Look Joy Think Wow Orbit Bounce Tour
- 托盘 22px 脸是活的
- S/M/L = 脸 200 / 320 / 440
- 静音要托盘、菜单栏、面板三处同步
- 开会 / Focus 工作时 Face only，不弹系统横幅

## 目录

| 路径 | 作用 |
| --- | --- |
| `electron/main.mjs` | Electron 主进程：窗、拖、托盘、轮询、通知 |
| `electron/desk.mjs` | 日历、前台 App、git、打开 agent |
| `electron/desk-core.mjs` | 纯函数：digest、git 解析、番茄钟 |
| `electron/codex.mjs` | 本地 AI 会话分类与合并 |
| `electron/grok-bot-app.mjs` | 本机 Grok Bot App 窗口/进程 |
| `electron/grok.mjs` | Brief：CLI 优先，API 兜底 |
| `electron/hysteresis.mjs` | 滞回门闩 |
| `electron/nudge.mjs` | `grokbot://`、inbox、重复轻敲 |
| `electron/perms.mjs` | 日历 / 自动化 / Grok Bot 许可探针 |
| `electron/preload.cjs` | IPC 桥 |
| `src/lib/grokbot/pet-shell.ts` | 面板、手势、心情、芯片 |
| `src/lib/grokbot/engine.ts` | 表情状态机、弹簧、颜色 |
| `mac/grokbot.js` | `pet:bundle` 产物，打进 app |
| `mac/nudge-grokbot.sh` | 给 Grok Bot / Grok Build 的 hook |
| `scripts/desk.test.mjs` | 桌面逻辑测试 |
| `scripts/codex-watch.test.mjs` | 会话分类测试 |
| `scripts/handoff-audit.sh` | 本机审计入口 |

## 数据流

每 8 秒 `pollDesk`：

1. inbox / overlay  
2. 本地 agent 快照（可关）+ Mac 场景 AppleScript（前台 + Grok Bot 窗口）  
3. Grok Bot 状态（复用窗口标题，不再二次 osascript）  
4. 日历约每 64 秒采一次，中间用 `tickMeeting` 按分钟倒数  
5. 滞回：agent 12s 退出、开会 16s、前台工作 8s 进入 / 16s 退出  
6. `buildDesk` → `pet-desk` → 表情 + 球体颜色  

## 启动（审计通过后才做）

```bash
npm install --legacy-peer-deps
npm run pet                 # 开发
npm run dist                # 打 GrokBot.app → dist-pet/mac/
```

或双击 `mac/Open GrokBot.command`。

协议：`grokbot://nudge?status=waiting`  
Inbox：`~/Library/Application Support/GrokBot/inbox.json`

## 下一份

[02-AUDIT.md](02-AUDIT.md) — 本轮修了什么、还剩什么风险。
