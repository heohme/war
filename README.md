# Multi War

横屏 H5 六边格策略游戏。双方在 30 秒内秘密规划“撤 → 搜 → 打”，随后由服务器依次公开结算；既可在线 1V1，也可用单人 AI 模式快速测试完整对局。

线上地址：<https://multiwar.pages.dev>

## 当前玩法

- 33 格椭圆六边形战场，双方 6 点生命；
- 每回合可撤除一格、移动至多两步、用一把武器指定方向攻击；
- 撤除不能命中玩家脚下，也不能切断地图连通性；
- 对手撤掉预设路线时，移动停在缺口前；
- 长剑、战斧、长枪、弓箭四种范围和命中门槛；
- D6 骰子判定，先后手逐回合交换，最多 14 回合；
- 单人测试模式即时建房，由训练 AI 自动完成撤、搜、打；
- WebSocket 实时匹配、房间重连、服务器权威结算。

详细规则见 [产品文档](docs/product.md)，部署结构见 [技术架构](docs/architecture.md)。

## 本地运行

需要 Node.js 22.13 或更新版本。

```bash
npm install
npm run dev
```

另开一个终端启动实时服务：

```bash
npx wrangler dev --config wrangler.api.jsonc --port 8787
```

打开 <http://localhost:3000>，用两个独立标签页开始匹配。

## 检查

```bash
npm run lint
npm test
npm run smoke:ws
```

`smoke:ws` 会连接线上 `multiwar.pages.dev`，确认在线匹配与单人 AI 房间均可正常建立。

## 自动发布

`main` 是唯一生产分支。每次推送到 `main` 后，GitHub Actions 会自动：

1. 安装依赖并运行 lint、规则测试和生产构建；
2. 部署 `multiwar-api` Worker；
3. 构建并部署 `multiwar` Pages；
4. 在线验证两位测试玩家能进入同一房间，并确认单人 AI 房间可用。

仓库需要配置以下 GitHub Actions Secrets：

- `CLOUDFLARE_DEPLOY_TOKEN`：拥有 Workers Scripts 与 Cloudflare Pages 编辑权限的 API Token；
- `CLOUDFLARE_DEPLOY_ACCOUNT_ID`：Cloudflare Account ID。

日常发布只需：

```bash
git push origin main
```

需要应急手动重跑时，可在 GitHub Actions 的 `Test and deploy` 工作流中选择 `Run workflow`。Pages 构建仍会读取根目录 `wrangler.jsonc`，以加载 `MATCH_QUEUE` 和 `GAME_ROOM` 两个 Durable Object 绑定。
