# 交接 3/3 · 本机 Codex 三轮审计

在 Mac 上用 **本地 Codex** 做。三轮都做完、门槛全绿，才允许 `npm run pet` 或 `npm run dist`。

先读 [01-PRODUCT.md](01-PRODUCT.md)、[02-AUDIT.md](02-AUDIT.md)。

```bash
cd grokbot
npm install --legacy-peer-deps
```

---

## 第 1 轮 · 静态（必须机器跑）

```bash
bash scripts/handoff-audit.sh
```

脚本会：

1. `node --check` 全部 `electron/*.mjs`  
2. `npx tsc --noEmit`  
3. `node --test scripts/desk.test.mjs scripts/codex-watch.test.mjs`  
4. 确认 `function emitMeeting` 存在、无顶层 `Illegal return`  
5. 确认 `ageStatus`、`tickMeeting`、`stampMeeting` 已导出  
6. 确认 `grokbot` 协议在 `electron-builder.yml`  
7. `npm run pet:bundle` 且 `mac/grokbot.js` 含 `exprHoldUntil`  
8. `node scripts/desk-qa.mjs`：8080 未就绪则先起 Vite；截图写在 `scripts/.desk-qa-shots`（不要 `/workspace`）；九个动作、Grok Bot · needs you、Allow Calendar  

**失败 = 停。不要安装。** 把脚本 stdout 贴进 Codex 对话。

人工 grep（脚本没扫到也要看）：

```bash
rg -n "XAI_API_KEY|sk-|BEGIN PRIVATE" electron src/lib/grokbot mac --glob '!mac/grokbot.js'
rg -n "emitMeeting|applyExternalNudge|ageStatus|tickMeeting" electron/main.mjs electron/codex.mjs
rg -n "if \\(pet\\) return" src/lib/grokbot/pet-shell.ts
```

通过门槛：

- [ ] 测试 41+ 全过  
- [ ] 无密钥、无 pem  
- [ ] `emitMeeting` 是完整函数  
- [ ] desk-qa 无 `errors`，九个 `actions` 都在  

---

## 第 2 轮 · 逻辑对照 02-AUDIT

Codex 只读打开这些文件，逐条核对 02 的 A1–A14 是否仍在代码里，而不是只信报告：

| 核对 | 文件 |
| --- | --- |
| 主进程轮询、通知、协议 | `electron/main.mjs` |
| 滞回、会议倒数 | `electron/hysteresis.mjs` |
| 会话过期 | `electron/codex.mjs` `ageStatus` |
| Grok Bot 窗口复用 | `electron/grok-bot-app.mjs`、`electron/desk.mjs` |
| 表情 hold、心情 | `src/lib/grokbot/engine.ts` |
| 面板 / Auto Work / Joy | `src/lib/grokbot/pet-shell.ts` |
| preload 通道 | `electron/preload.cjs` |

通过门槛：

- [ ] A3 函数头在，`latchAgents` 后面不是裸 `if (meeting === on) return`  
- [ ] `readGrokBotApp` 调用带 `windows:`  
- [ ] Joy 走 `setExpression(5, { hold: 4 })`  
- [ ] 关 watch 仍 `void pollDesk()`，Grok Bot 告警不依赖 `watchCodex`  
- [ ] `FILE_SNAP` 命中走 `ageStatus`，不是原样 `prev.status`  
- [ ] 没发现新的语法错误、TDZ、重复 `play()` 双弹  

发现问题：写进 `handoff/LOCAL-FINDINGS.md`（本机建，不要改 02 除非确认是回归）。**有 P0/P1 先修再进入第 3 轮。**

---

## 第 3 轮 · Mac 真机（安装前烟雾）

允许 `npm run pet` **仅用于这一轮**，不要 `dist` 到 Applications，除非本轮通过。

| # | 操作 | 期望 |
| --- | --- | --- |
| 1 | 点拖球体，松手 | 不粘手，停在松手处 |
| 2 | 点一下 / 连点两下 | 面板开；双击蹦 |
| 3 | Joy | 笑约 4 秒，再回到当前心情色 |
| 4 | S / M / L | 九个动作都在，面板不裁切 |
| 5 | Mute 点面板、托盘、菜单 | 三处勾选一致，声停 |
| 6 | 开 Grok Bot，造 Allow once | 金球、needs you、通知；点芯片前台 Grok Bot |
| 7 | 关 Agents Watch | 其它 agent 芯片消失，Grok Bot 仍可叫 |
| 8 | 未授权日历时点 Allow Calendar | 出系统许可框 |
| 9 | Focus | 倒计时走秒 |
| 10 | `open 'grokbot://nudge?status=waiting'` | 蹦 + 芯片 |
| 11 | 工作日把前台切到 Cursor 约 10s | Auto Work → Work（若 Auto 开着） |

全过之后才：

```bash
npm run dist
# 打开 dist-pet/mac/GrokBot.app
```

---

## Codex 输出格式

三轮结束后，Codex 只许给下面这种结论，不要含糊：

```
PASS1: yes|no
PASS2: yes|no
PASS3: yes|no
P0: <none or list>
INSTALL: allowed|blocked
```

`INSTALL: allowed` 当且仅当三轮都是 yes 且 P0 为空。
