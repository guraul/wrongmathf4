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

## Android / Termux（小米 6 手机，已实际部署）

2026-11-20 在小米 6（MIUI 11 / Android 9 / arm64 / Termux）上跑通，手机地址 `192.168.0.159`，
服务由 runit 托管，端口 19238。

### 三个必须知道的约束

1. **不能在手机上构建**：Next 14 的 SWC 没有 android-arm64 版本，`next build` 只在开发机上跑。
2. **sharp 没有 android 预编译包**：改用 WebAssembly 版 `@img/sharp-wasm32`（实测单页预处理 4.6 秒）。
3. **手机没有 rsync**：用 `tar` 走 ssh 管道。

### 首次部署

```bash
# 1. 开发机构建
pnpm build

# 2. 推到手机（standalone 产物 + 静态资源）
tar czf - -C packages/web/.next standalone | ssh mi6 'mkdir -p ~/wrongmath-app && tar xzf - -C ~/wrongmath-app --strip-components=1'
tar czf - -C packages/web/.next static   | ssh mi6 'tar xzf - -C ~/wrongmath-app/packages/web/.next'

# 3. 手机上装 WASM 版 sharp，并放进应用 node_modules
ssh mi6
mkdir -p ~/sharp-wasm && cd ~/sharp-wasm
npm i sharp @img/sharp-wasm32
cd ~/wrongmath-app
cp -r ~/sharp-wasm/node_modules/{sharp,@img,@emnapi,tslib,detect-libc} node_modules/

# 4. 放 .env（含 OPENCODE_GO_API_KEY）到应用根
#    ~/wrongmath-app/.env

# 5. 注册 runit 服务
export SVDIR=$PREFIX/var/service
mkdir -p $SVDIR/wrongmath/log ~/wrongmath-app.log
cat > $SVDIR/wrongmath/run <<'RUN'
#!/data/data/com.termux/files/usr/bin/sh
export PORT=19238
export WRONGMATH_DATA_DIR=/data/data/com.termux/files/home/wrongmath-data
export NODE_ENV=production
cd /data/data/com.termux/files/home/wrongmath-app || exit 1
exec /data/data/com.termux/files/usr/bin/node packages/web/server.js 2>&1
RUN
chmod +x $SVDIR/wrongmath/run
cat > $SVDIR/wrongmath/log/run <<'LOGRUN'
#!/data/data/com.termux/files/usr/bin/sh
exec svlogd -tt /data/data/com.termux/files/home/wrongmath-app.log
LOGRUN
chmod +x $SVDIR/wrongmath/log/run
sv up wrongmath
```

### 日常更新

```bash
pnpm build
tar czf - -C packages/web/.next standalone | ssh mi6 'tar xzf - -C ~/wrongmath-app --strip-components=1'
tar czf - -C packages/web/.next static   | ssh mi6 'tar xzf - -C ~/wrongmath-app/packages/web/.next'
ssh mi6 'SVDIR=$PREFIX/var/service sv restart wrongmath'
```

### 排障

| 现象 | 原因 | 处理 |
|---|---|---|
| 接口 500，日志 `Could not load the "sharp" module using the android-arm64 runtime` | sharp 被 webpack 内联，或 `node_modules` 里没有 wasm 版 | 确认 `node_modules/{sharp,@img,@emnapi,tslib,detect-libc}` 齐全 |
| 批次失败，日志「没有可用的模型 key」 | `.env` 不在应用根 | 放到 `~/wrongmath-app/.env` |
| 换端口启动报 `EADDRINUSE` 但 `ps` 看不到进程 | Android 隐藏了进程命令行 | 按 socket inode 找：见 `docs/knowledge-base/OPERATIONS.md` |

## 更新

```bash
git pull && pnpm install && pnpm build && sudo systemctl restart wrongmath
```
