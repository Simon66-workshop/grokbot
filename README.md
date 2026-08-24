# GrokBot

A living Grok Bot icon drawn entirely in code. It sits on your Mac desktop
with a transparent window — only the face is there.

**0.4.8** — 本机请先审计再安装。交接三份：

1. [handoff/01-PRODUCT.md](handoff/01-PRODUCT.md)
2. [handoff/02-AUDIT.md](handoff/02-AUDIT.md)
3. [handoff/03-CODEX.md](handoff/03-CODEX.md)

索引：[HANDOFF.md](HANDOFF.md)。本机 Codex：`bash scripts/handoff-audit.sh` 通过后才 `npm run pet`。

## 在 Mac 上当桌宠

```bash
git clone https://github.com/Simon66-workshop/grokbot.git
cd grokbot
npm install --legacy-peer-deps
bash scripts/handoff-audit.sh    # 先审计
npm run pet                      # 通过后再跑
```

或者双击 `mac/Open GrokBot.command`。

菜单栏托盘是**活的 22px 脸**。右键托盘：**What's up、Grok Brief、Focus、显示 / 隐藏、场景、S/M/L、静音、Agents Watch、Auto Work、开机启动、退出。** 菜单栏 GrokBot 下拉里也可以勾 **Mute**，并有同一套 Brief / Focus。单实例。右键球体可隐藏。点系统通知会打开对应的本地 AI 或日历。

### 打成 GrokBot.app

在 Mac 上，审计通过后：

```bash
npm run dist
```

产物在 `dist-pet/mac/GrokBot.app`。仓库里不会存任何 token。

## 用法

- **点一下**球体：眨眼并打开控制面板
- **睡着时点一下**：叫醒，不弹面板
- **连点两下**：蹦一轮
- **拖动球体**：跟着鼠标走，可贴到四边四角；外接屏拔掉会落到当前屏，插回去回到原位
- **S / M / L**：脸 200 / 320 / 440
- **Auto Work**：工作日 9–18，或 Zoom / Teams / FaceTime / Webex / 日历里正在进行的会议，或你正在 Cursor / 终端 / Xcode 里 → 自动切 Work；结束回到原来的场景。开会时你手动切 Play 会记住，不会立刻抢回去
- **Agents Watch**：盯本地 AI 线程（Codex、Claude Code、Cursor、Gemini CLI、Amp、Goose、OpenCode、Aider、Copilot CLI、Grok Build），以及本机 **Grok Bot** App。Grok Bot 弹出 Allow once / Take control 时球会叫。还在等人就每约 2.5 分钟再轻轻蹦一下，点芯片才停
- **Face only**：开会或 Focus 工作时不弹系统横幅，只变脸。散会 / 休息后再叫
- **Grok Bot 回调**：Grok Bot 或 Grok Build 可打开 `grokbot://nudge?status=waiting`，或写 `~/Library/Application Support/GrokBot/inbox.json`。若本机有 `~/.grok`，会装上 `hooks/grokbot-nudge.sh`
- **授权提醒**：会议倒计时要日历许可，盯前台 App / Grok Bot 窗口要自动化许可。没按时面板出现 **Allow Calendar** / **Allow Automation** / **Allow Grok Bot**，点一下打开系统设置并再次触发许可框
- **Brief / What's up**：点一下球体、托盘或按 `W`，说一句现在怎样。Mac 上若装了 [Grok Build CLI](https://x.ai/build)（用你的 SuperGrok 账号登录），**Grok Brief** 会用你账号默认的 Grok 把那句话写顺；没有 CLI 则走 `XAI_API_KEY` 的 `grok-4.6`
- **下一场会**：15 分钟内开始会轻声提醒，5 分钟再叫一次「Stand up」。点通知打开日历
- **Focus**：球体就是番茄钟。25 分钟工作，到点蹦一下休息 5 分钟。托盘、面板、`F` 都能开
- **Git 灯**：盯正在跑的 agent 那个仓库，脏文件和 Playwright 测试红了会皱眉
- 场景：**Work** 安静 · **Play** 会看你、偶尔乱蹦，90 秒没人理就打盹 · **Demo** 走 Tour
- 空格眨眼 · `1` Work · `2` Play · `D` Demo · `R` 复位 · `M` 静音 · `W` 口播 · `F` 专注

## 官方尺寸

| 用途 | 画布 | faceScale |
| --- | --- | --- |
| 菜单栏 / 托盘 | 22 | 0.46 |
| S 桌宠 | 200 | 0.30 |
| M | 320 | 0.33 |
| L 伴侣窗 | 440 | 0.24 |
| Hero | 720 | 0.22 |

## Figma

[GrokBot 设计文件](https://www.figma.com/design/mLELO7cFFyWv2WQyxS3uJn) 是静态组件。动态版用上面的桌宠。

## License

Personal / prototype. Grok identity belongs to xAI.
