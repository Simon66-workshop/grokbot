# GrokBot 交接（先审计，后安装）

版本 **0.4.8**。仓库：https://github.com/Simon66-workshop/grokbot

本机用 **Codex 审计通过之前，不要 `npm run pet` / `npm run dist`，也不要打开 GrokBot.app。**

按顺序做完这三份交接，三份都做：

1. [handoff/01-PRODUCT.md](handoff/01-PRODUCT.md) — 产品合同、目录、启动路径  
2. [handoff/02-AUDIT.md](handoff/02-AUDIT.md) — 本轮完整审计报告（已修 / 未修）  
3. [handoff/03-CODEX.md](handoff/03-CODEX.md) — 本机 Codex 必须跑的三轮审计清单与通过门槛  

机器入口：

```bash
git clone https://github.com/Simon66-workshop/grokbot.git
cd grokbot
npm install --legacy-peer-deps
bash scripts/handoff-audit.sh
```

`scripts/handoff-audit.sh` 退出码 0 且 03 的人工项打勾之后，才允许安装。
