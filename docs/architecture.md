# Multi War 技术架构

## 目标

Multi War 是横屏 H5 1V1 六边格策略游戏。首版采用 Cloudflare 全栈部署，前端、匹配、房间状态与回合计时均无需常驻服务器。

## 线上组成

- `https://multiwar.pages.dev`：静态前端与 Pages Functions，同域提供 `/ws/*`。
- `multiwar-api` Worker：导出 `MatchQueue` 与 `GameRoom` 两个 Durable Object 类，并保留独立健康入口。
- Pages Functions 通过 Durable Object binding 直接访问上述对象，不通过公网 `workers.dev` 转发长连接。

## 请求路径

1. 玩家在匹配页选择两把公开武器并点击“开始匹配”。
2. 浏览器连接 `wss://multiwar.pages.dev/ws/match`。
3. 全局 `MatchQueue` 将两名玩家配成一局，为双方生成不同的房间令牌。
4. 双方连接 `wss://multiwar.pages.dev/ws/room/:roomId`。
5. 房间内两人到齐后，`GameRoom` 开启 30 秒计划阶段。
6. 玩家依次锁定撤、搜、打；服务器只广播完成进度，不公开计划内容。
7. 两人完成或倒计时结束后，服务器权威执行规则引擎并广播事件序列。
8. 前端按事件序列播放撤除、移动、骰子、伤害动画；非终局自动开始下一轮。

## 服务端权威边界

服务端负责：

- 地图与连通性校验；
- 每阶段顺序、锁定和超时；
- 移动合法性与缺口截断；
- 武器范围、骰子和伤害；
- 先后手轮换、14 回合上限和胜负；
- 房间重连与状态快照。

客户端只负责计划输入、视觉预览和事件回放，不能指定骰点、伤害或最终位置。

## Durable Object 划分

### MatchQueue

全局固定实例 `global-v1`，仅保存当前 WebSocket 队列。配对后创建随机房间 ID 和双方令牌，不持久保存大厅账号。

### GameRoom

每场对局一个实例，持久化：

- 双方公开信息与私有令牌；
- 当前 `GameState`；
- 本轮私有计划与三个阶段锁；
- 计划截止时间、结算结束时间；
- 最近一次结算事件，供断线重连恢复。

房间使用 Durable Object Alarm 处理 30 秒提交超时及结算后的下一轮启动，浏览器断开不会让计时停止。

## 本地开发

前端：`npm run dev`

实时服务：`wrangler dev --config wrangler.api.jsonc --port 8787`

默认前端连接 `http://localhost:8787`；生产构建通过 `NEXT_PUBLIC_API_ORIGIN=https://multiwar.pages.dev npm run build:pages` 使用同域连接。

## 验证与发布

- `npm test`：构建、页面 SSR 与核心规则测试。
- `npm run lint`：代码规范检查。
- `npm run smoke:ws`：线上双连接匹配冒烟测试。
- `wrangler deploy --config wrangler.api.jsonc`：发布 Durable Object Worker。
- `wrangler pages deploy dist/client --project-name multiwar --branch main`：发布 Pages。

Pages 发布必须读取根目录 `wrangler.jsonc`，以加载对 `multiwar-api` 的 `MATCH_QUEUE` 和 `GAME_ROOM` 绑定。
