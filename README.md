# GrokBot

A living Grok Bot icon drawn entirely in code. It sits on your Mac desktop
with a transparent window — only the face is there.

## 在 Mac 上当桌宠

```bash
git clone https://github.com/Simon66-workshop/grokbot.git
cd grokbot
npm install --legacy-peer-deps
npm run pet
```

或者双击 `mac/Open GrokBot.command`。

菜单栏托盘：**显示 / 隐藏、Work / Play / Demo、声音、开机启动、退出。** 单实例，不要再 `pkill`。右键球体可隐藏。

### 打成 GrokBot.app

在 Mac 上：

```bash
npm run dist
```

产物在 `dist-pet/mac/GrokBot.app`（或 `dist-pet/GrokBot-0.2.1-arm64.dmg`）。拖进「应用程序」即可。

公证（可选，需自己的 Apple 开发者账号）：

```bash
xcrun notarytool submit dist-pet/GrokBot-*.dmg --apple-id YOU --team-id TEAM --password APP-SPECIFIC
```

仓库里不会存任何 token。

## 用法

- **点一下**球体：眨眼并打开控制面板
- **再点一下**：收起面板
- **睡着时点一下**：叫醒，不弹面板
- **连点两下**：蹦一轮
- **长按拖**：贴到四边四角，面板自动让到内侧
- **右键**：隐藏（托盘里再叫出来）
- 场景：**Work** 安静呼吸眨眼、没有音效 · **Play** 会看你、偶尔乱蹦，90 秒没人理就打盹 · **Demo** 走 Tour
- 空格眨眼 · `1` Work · `2` Play · `D` Demo · `R` 复位 · `M` 静音
- 只有你点的眨眼、落地、开面板才出声；自己眨眼是安静的

## 官方尺寸

| 用途 | 画布 | faceScale |
| --- | --- | --- |
| 菜单栏 | 22 | 0.46 |
| 桌宠 | 200 | 0.30 |
| 伴侣窗 | 440 | 0.24 |
| Hero | 720 | 0.22 |

见 `src/lib/grokbot/sizes.ts`。网页预览菜单栏里有一颗 22px 活图标。网页和 Mac 伴侣共用 `src/lib/grokbot/pet-shell.ts`。

## Figma

[GrokBot 设计文件](https://www.figma.com/design/mLELO7cFFyWv2WQyxS3uJn) 是静态组件。动态版用上面的桌宠。

## License

Personal / prototype. Grok identity belongs to xAI.
