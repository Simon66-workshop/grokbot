# GrokBot

A living Grok Bot icon drawn entirely in code. The face is a circle with two
white oval eyes. Expressions, shapes, and states morph through springs — not
image swaps.

## 在你的 Mac 上用

这不是要装进 Figma / VS Code 的插件。有两种用法：

### 1. 双击打开（推荐，不用装 Node）

1. 下载仓库：绿色 **Code → Download ZIP**，或
   ```bash
   git clone https://github.com/Simon66-workshop/grokbot.git
   cd grokbot
   ```
2. 打开 `mac` 文件夹
3. 双击 **`Open GrokBot.command`**
   - 第一次 macOS 可能提示“无法验证开发者”：右键 → 打开 → 打开
   - 会用 Chrome 以小窗口打开；没有 Chrome 就用 Safari
4. 也可以直接双击 `mac/index.html`

快捷键：空格眨眼 · `D` 演示 · `R` 复位。底部芯片可切换心情。

想钉在程序坞：Chrome 打开后，菜单 **文件 → 将 “GrokBot” 添加到程序坞**（或 “Create Shortcut”）。

### 2. 在 Figma 里当组件用

打开 [GrokBot Figma 文件](https://www.figma.com/design/mLELO7cFFyWv2WQyxS3uJn)，
把 `GrokBot` 组件复制到你自己的文件。Rest / Joy / Squint / Shut / Glance / Wink
是变体。这是设计稿，不会自己动——动态版请用上面的 `mac` 窗口。

---

## 仓库里有什么

| Path | Role |
| --- | --- |
| `mac/` | 给 Mac 双击用的独立窗口 |
| `src/lib/grokbot/` | 引擎、表情、渲染 |
| `src/components/grokbot/GrokBotCanvas.tsx` | Canvas 组件 |
| `src/components/desktop/Desktop.tsx` | 透明桌面伴侣 |
| `src/components/atelier/Atelier.tsx` | 表情实验室 |

Rest pose: chubby ovals, 11° tilt, centers at `(-10, -15)` and `(50, -13)`
in a 200-unit face (`FACE_R = 100`).

## License

Personal / prototype. Grok identity belongs to xAI.
