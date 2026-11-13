# Multi War

横屏 H5 六边格策略游戏。双方在 45 秒内秘密规划“撤 → 搜 → 打”，双方确认后立即由服务器依次公开结算；既可在线 1V1，也可用单人 AI 模式快速测试完整对局。

线上地址：<https://multiwar.pages.dev>

## 当前玩法

- 33 格椭圆六边形战场，双方 6 点生命；
- 每回合可撤除一格、移动至多两步、用一把武器指定方向攻击；
- 撤除不能命中玩家脚下，也不能切断地图连通性；
- 对手撤掉预设路线时，移动停在缺口前；
- 长剑、战斧、长枪、弓箭四种范围和命中门槛；
- D6 骰子判定，先后手逐回合交换，最多 14 回合；
- 单人测试模式即时建房，由训练 AI 自动完成撤、搜、打；
- AI 仅依据公开局面预测原地防守和可能走位，按武器控距、侧移或后撤反击，并优先拆除能干扰路线的地块；近似等价的方案会有少量变化；
- WebSocket 实时匹配、房间重连、服务器权威结算；
- 创建六位好友房间码，或打开邀请链接并加入指定房间；
- 双方结算后确认同房再战，保留玩家和武器，重置地图与生命并交换初始先手。

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

打开 <http://localhost:3000>，用两个独立标签页开始匹配，或按以下方式邀请朋友：

1. 选好武器，点击「创建好友房间」。
2. 复制邀请链接或六位房间码，发给朋友；等待房间十分钟有效。
3. 朋友打开链接（自动填入房间码），选好武器后点击「加入房间」。双方进入后自动开局。
4. 结算页双方分别点击「同房再战」，无需重新匹配。只有双方同意且在线才会开始。

浏览器刷新会恢复当前房间和本人已锁定的计划；「离开房间」会通知对手并阻止继续再战。暂不提供重新开放旧房间给第三人的功能。

## 检查

```bash
npm run lint
npm test
npm run smoke:ws
node scripts/ws-friend-smoke.mjs http://localhost:8787
```

`ws-friend-smoke.mjs` 默认连接本地服务，验证建房、房间码加入、自连/满房拒绝、完整对局、双向同意再战、重连恢复及旧局消息拒绝。需要先启动实时服务。

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
