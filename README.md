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

菜单栏托盘是**活的 22px 脸**。右键托盘：**显示 / 隐藏、场景、S/M/L、声音、Auto Work、开机启动、退出。** 单实例。右键球体可隐藏。

### 打成 GrokBot.app

在 Mac 上：

```bash
npm run dist
```

产物在 `dist-pet/mac/GrokBot.app`。仓库里不会存任何 token。

## 用法

- **点一下**球体：眨眼并打开控制面板
- **睡着时点一下**：叫醒，不弹面板
- **连点两下**：蹦一轮
- **长按拖**：贴到四边四角；外接屏拔掉会落到当前屏，插回去回到原位
- **S / M / L**：脸 200 / 320 / 440
- **Auto Work**：工作日 9–18，或 Zoom / Teams / FaceTime / Webex / 日历里正在进行的会议 → 自动切 Work；结束回到原来的场景。开会时你手动切 Play 会记住，不会立刻抢回去
- 场景：**Work** 安静 · **Play** 会看你、偶尔乱蹦，90 秒没人理就打盹 · **Demo** 走 Tour
- 空格眨眼 · `1` Work · `2` Play · `D` Demo · `R` 复位 · `M` 静音

## 官方尺寸

| 用途 | 画布 | faceScale |
| --- | --- | --- |
| 菜单栏 / 托盘 | 22 | 0.46 |
| S 桌宠 | 200 | 0.30 |
| M | 320 | 0.26 |
| L 伴侣窗 | 440 | 0.24 |
| Hero | 720 | 0.22 |

## Figma

[GrokBot 设计文件](https://www.figma.com/design/mLELO7cFFyWv2WQyxS3uJn) 是静态组件。动态版用上面的桌宠。

## License

Personal / prototype. Grok identity belongs to xAI.
