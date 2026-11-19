# 部署

## Linux（systemd）

```bash
sudo cp wrongmath.service /etc/systemd/system/
sudo systemctl daemon-reload
sudo systemctl enable --now wrongmath
```

单元文件假定：

- 代码在 `/opt/wrongmath`，用户 `wrongmath`
- `.env` 与代码同目录（`EnvironmentFile`），至少要有 `OPENCODE_GO_API_KEY`
- 先跑过 `pnpm install && pnpm build`

## macOS（launchd）

```bash
cp deploy/com.wrongmath.web.plist ~/Library/LaunchAgents/
launchctl load ~/Library/LaunchAgents/com.wrongmath.web.plist
```

本地开发直接 `pnpm dev` 即可，不需要常驻服务。

## 更新

```bash
git pull && pnpm install && pnpm build && sudo systemctl restart wrongmath
```
