# GrokBot

A living Grok Bot icon drawn entirely in code. Drag it on your Mac desktop.
Pick any body color from the hue ring.

## 在 Mac 上当桌宠

1. 安装 [Node.js](https://nodejs.org/)（一次就好）
2. 下载仓库后在终端里：

```bash
git clone https://github.com/Simon66-workshop/grokbot.git
cd grokbot
npm install
npm run pet
```

或双击 `mac/Open GrokBot.command`（装过依赖之后）。

- 抓住脸，拖到桌面任意位置
- 窗口无边框、透明、始终置顶
- 悬停出色环，转一圈换身体颜色
- 空格眨眼 · `D` 演示 · `R` 复位

没有 Node 时，双击 `mac/index.html` 也能在浏览器里玩（只能在窗口内拖）。

## Figma

[GrokBot 设计文件](https://www.figma.com/design/mLELO7cFFyWv2WQyxS3uJn) 里是静态组件。动态版用上面的桌宠。

## 仓库

| Path | Role |
| --- | --- |
| `electron/` | 无边框置顶桌宠 |
| `mac/` | 独立窗口 + 打包后的引擎 |
| `src/lib/grokbot/` | 引擎、表情、色环、渲染 |
| `src/components/desktop/` | 网页里的伴侣预览 |

## License

Personal / prototype. Grok identity belongs to xAI.
