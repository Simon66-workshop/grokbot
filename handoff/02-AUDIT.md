# 交接 2/3 · 完整审计报告

版本 **0.4.8**。审计日 2026-08-24。给本机 Codex 对照，不要当作已经通过。

上一份：[01-PRODUCT.md](01-PRODUCT.md)  
下一份：[03-CODEX.md](03-CODEX.md)

## 结论

本沙箱侧：语法、`tsc --noEmit`、41 个 `node --test`、`scripts/desk-qa.mjs` 在提交前通过。  
**本机 Mac + 本机 Codex 仍必须按 03 再跑一遍**，因为日历、Grok Bot 窗口、拖动手势、系统通知在 Linux 预览里验不了。

## 本轮相对 `6841897` 新增

- 桌面快照 Desk：Brief、会议、前台、git 灯、Focus、agent 列表
- Grok Bot App 联动 + `grokbot://` + inbox hook
- 授权芯片 Allow Calendar / Automation / Grok Bot
- 心情 ↔ 球体颜色（HSV 最短弧）
- 滞回：agent / 开会 / Focus / 工作时段 / 会议 soon
- 面板层级：whisper / agents / desk 贴近脸，偏好更远
- 轮询错开 + 文件 mtime 缓存

## 已关闭的缺陷（不要当还开着）

| ID | 现象 | 修复位置 |
| --- | --- | --- |
| A1 | 点拖球体卡住 | `electron/main.mjs` 主进程跟光标 + NSEvent 松手 |
| A2 | 托盘无静音 / UI 不同步 | 托盘、菜单、面板同一 `muted` |
| A3 | `emitMeeting` 被拆断，主进程 `Illegal return`，宠物起不来 | `electron/main.mjs` `function emitMeeting` 已恢复 |
| A4 | 等人连弹两次 | Mac 上 `applyCodexSnap` 直接 return，表情只走 `applyDesk` |
| A5 | inbox 读入再 `pollDesk` 重入 | `applyExternalNudge(msg, { poll: false })` |
| A6 | 全局 latch + 单线程 latch 叠两层 | 只留 `agentLatches` |
| A7 | 开会 / 前台不写回 renderer，Auto Work 漏 | `applyDesk` 写 `meetingOn` / `focusWork` |
| A8 | Joy 下一帧被 Rest 清掉 | `setExpression(id, { hold })` + `exprHoldUntil` |
| A9 | 会话缓存不看 age，done 挂很久 | `ageStatus()` 在 FILE_SNAP 命中时重算 |
| A10 | 会议分钟冻约 64s | `stampMeeting` / `tickMeeting` 每 8s 倒数 |
| A11 | 启动时已 waiting 不通知 | 首次 `emitCodex` 对 waiting/error 不静音 |
| A12 | 关 Agents Watch 后 Grok Bot 也不通知 | Grok Bot 告警绕过 watch 开关 |
| A13 | 窗口标题二次 osascript，误报 Allow Grok Bot | `readGrokBotApp({ windows })` 复用 `detectMacScene` |
| A14 | 16m→14m 跳过 15m 提醒 | 倒数穿过 15 / 5 会发 |

## 本机必须重验（Linux 上没真跑过）

1. 拖球松手，不能卡住  
2. Grok Bot 弹出 Allow once：脸变金、芯片、系统通知；点芯片打开 Grok Bot  
3. 日历许可：点 Allow Calendar 出系统框  
4. 开会 / Zoom：Face only，散会后再叫  
5. Focus 25:00 走秒，到点蹦  
6. `grokbot://nudge?status=waiting` 与 inbox.json  
7. 关 Agents Watch：Claude 芯片没了，Grok Bot 还在  
8. Joy 站住约 4 秒再滑回  
9. S / M / L 九个动作都在、不裁切  
10. Mute 托盘 / 菜单 / 面板一致  

## 已知剩余风险（不是未修 bug，是边界）

- 日历 AppleScript 仍约 64s 采一次；显示靠本地倒数，夏令时/跨夜事件可能偏一分钟
- `FILE_SNAP` 超过 240 条才回收；极端会话量内存会涨
- `pollDesk` 出错只 `console.error`，脸会停在上一帧
- Web 预览用 `demoDesk()`，**不能**当 Mac 传感器的证据
- Brief 不把会话正文发给 Grok，只送 digest 一句

## 不要碰的雷

- 不要再拆 `emitMeeting` 的函数头  
- 不要让 `applyCodexSnap` 和 `applyDesk` 同时播表情  
- 不要在 `pollDesk` 里 `applyMenus()`（会关掉打开的菜单）  
- 不要把 Grok Bot 进程匹配成 `grok` CLI 或本宠物 `grokbot`  
- 不要提交 `.env`、token、`*.pem`

## 验证命令（提交前已跑）

```
node --check electron/main.mjs electron/codex.mjs electron/hysteresis.mjs
npx tsc --noEmit
node --test scripts/desk.test.mjs scripts/codex-watch.test.mjs   # 41 pass
npm run pet:bundle
node scripts/desk-qa.mjs
```

## 下一份

[03-CODEX.md](03-CODEX.md) — 本机 Codex 三轮审计怎么跑、怎样才算过。
