import {
  WEAPONS,
  canRemove,
  createGame,
  resolveRound,
  validateMovePlan,
  type GameState,
  type ResolutionEvent,
  type Side,
  type TurnPlan,
  type WeaponId,
} from "../lib/game";

declare const WebSocketPair: {
  new (): { 0: WebSocket; 1: WebSocket };
};

interface WebSocketWithAttachment extends WebSocket {
  serializeAttachment(value: unknown): void;
  deserializeAttachment(): unknown;
}

interface DurableObjectStorage {
  get<T>(key: string): Promise<T | undefined>;
  put<T>(key: string, value: T): Promise<void>;
  setAlarm(timestamp: number): Promise<void>;
  deleteAlarm(): Promise<void>;
}

interface DurableObjectState {
  storage: DurableObjectStorage;
  acceptWebSocket(webSocket: WebSocket, tags?: string[]): void;
  getWebSockets(tag?: string): WebSocketWithAttachment[];
}

interface DurableObjectStub {
  fetch(request: Request): Promise<Response>;
}

interface DurableObjectNamespace {
  idFromName(name: string): unknown;
  get(id: unknown): DurableObjectStub;
}

interface Env {
  MATCH_QUEUE: DurableObjectNamespace;
  GAME_ROOM: DurableObjectNamespace;
  ALLOWED_ORIGIN?: string;
}

interface QueuePlayer {
  id: string;
  name: string;
  weapons: WeaponId[];
}

interface RoomPlayer extends QueuePlayer {
  token: string;
  side: Side;
}

interface StoredRoom {
  id: string;
  status: "waiting" | "planning" | "resolving" | "finished";
  players: Record<Side, RoomPlayer>;
  game: GameState;
  plans: Partial<Record<Side, Partial<TurnPlan>>>;
  locks: Record<Side, { remove: boolean; move: boolean; attack: boolean }>;
  deadlineAt: number | null;
  nextRoundAt: number | null;
  latest?: {
    before: GameState;
    after: GameState;
    events: ResolutionEvent[];
  };
}

const json = (value: unknown, init: ResponseInit = {}) =>
  new Response(JSON.stringify(value), {
    ...init,
    headers: { "content-type": "application/json; charset=utf-8", ...init.headers },
  });

function wsResponse(socket: WebSocket): Response {
  return new Response(null, {
    status: 101,
    webSocket: socket,
  } as ResponseInit & { webSocket: WebSocket });
}

function parseWeapons(value: string | null): WeaponId[] {
  const requested = (value ?? "")
    .split(",")
    .filter((weapon): weapon is WeaponId => weapon in WEAPONS);
  const unique = [...new Set(requested)];
  return unique.length === 2 ? unique : ["sword", "bow"];
}

function randomToken(): string {
  const bytes = new Uint8Array(18);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join("");
}

function allowedOrigin(request: Request, env: Env): boolean {
  const origin = request.headers.get("origin");
  if (!origin) return true;
  if (origin === env.ALLOWED_ORIGIN) return true;
  return (
    origin === "http://localhost:3000" ||
    origin === "http://127.0.0.1:3000" ||
    /^https:\/\/[a-z0-9-]+\.pages\.dev$/i.test(origin)
  );
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);
    if (!allowedOrigin(request, env)) return json({ error: "origin_not_allowed" }, { status: 403 });
    if (url.pathname === "/health") {
      return json({ ok: true, service: "multiwar-api", time: Date.now() });
    }
    if (url.pathname === "/ws/match") {
      const stub = env.MATCH_QUEUE.get(env.MATCH_QUEUE.idFromName("global-v1"));
      return stub.fetch(request);
    }
    const roomMatch = url.pathname.match(/^\/ws\/room\/([a-zA-Z0-9-]+)$/);
    if (roomMatch) {
      const stub = env.GAME_ROOM.get(env.GAME_ROOM.idFromName(roomMatch[1]));
      return stub.fetch(request);
    }
    return json({ error: "not_found" }, { status: 404 });
  },
};

export class MatchQueue {
  constructor(
    private readonly state: DurableObjectState,
    private readonly env: Env,
  ) {}

  async fetch(request: Request): Promise<Response> {
    if (request.headers.get("upgrade")?.toLowerCase() !== "websocket") {
      return json({ error: "websocket_required" }, { status: 426 });
    }
    const url = new URL(request.url);
    const player: QueuePlayer = {
      id: url.searchParams.get("playerId") || crypto.randomUUID(),
      name: (url.searchParams.get("name") || "旅行者").slice(0, 20),
      weapons: parseWeapons(url.searchParams.get("weapons")),
    };
    for (const existing of this.state.getWebSockets(player.id)) {
      existing.close(4001, "replaced");
    }
    const pair = new WebSocketPair();
    const client = pair[0];
    const server = pair[1] as WebSocketWithAttachment;
    this.state.acceptWebSocket(server, [player.id]);
    server.serializeAttachment({ kind: "queue", player });
    const queuedSockets = this.state.getWebSockets();
    server.send(JSON.stringify({ type: "matching", playerId: player.id, queued: queuedSockets.length }));

    const opponentSocket = queuedSockets.find((socket) => {
      const attachment = socket.deserializeAttachment() as
        | { kind: "queue"; player: QueuePlayer }
        | undefined;
      return attachment?.player.id !== player.id;
    });
    if (opponentSocket) {
      const attachment = opponentSocket.deserializeAttachment() as
        | { kind: "queue"; player: QueuePlayer }
        | undefined;
      if (attachment?.player && attachment.player.id !== player.id) {
        await this.createRoom(attachment.player, opponentSocket, player, server);
      }
    }
    return wsResponse(client);
  }

  private async createRoom(
    cyanPlayer: QueuePlayer,
    cyanSocket: WebSocket,
    redPlayer: QueuePlayer,
    redSocket: WebSocket,
  ): Promise<void> {
    const roomId = crypto.randomUUID();
    const cyanToken = randomToken();
    const redToken = randomToken();
    const roomStub = this.env.GAME_ROOM.get(this.env.GAME_ROOM.idFromName(roomId));
    const response = await roomStub.fetch(
      new Request(`https://room.internal/init`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          roomId,
          players: {
            cyan: { ...cyanPlayer, side: "cyan", token: cyanToken },
            red: { ...redPlayer, side: "red", token: redToken },
          },
        }),
      }),
    );
    if (!response.ok) {
      cyanSocket.send(JSON.stringify({ type: "error", code: "room_create_failed" }));
      redSocket.send(JSON.stringify({ type: "error", code: "room_create_failed" }));
      return;
    }
    cyanSocket.send(
      JSON.stringify({ type: "match_found", roomId, side: "cyan", token: cyanToken }),
    );
    redSocket.send(
      JSON.stringify({ type: "match_found", roomId, side: "red", token: redToken }),
    );
  }

  webSocketMessage(socket: WebSocket, message: string | ArrayBuffer): void {
    if (typeof message !== "string") return;
    try {
      const data = JSON.parse(message) as { type?: string };
      if (data.type === "cancel_match") socket.close(1000, "cancelled");
      if (data.type === "ping") socket.send(JSON.stringify({ type: "pong", at: Date.now() }));
    } catch {
      socket.send(JSON.stringify({ type: "error", code: "invalid_message" }));
    }
  }
}

export class GameRoom {
  constructor(private readonly state: DurableObjectState) {}

  async fetch(request: Request): Promise<Response> {
    const url = new URL(request.url);
    if (url.pathname === "/init" && request.method === "POST") {
      const existing = await this.state.storage.get<StoredRoom>("room");
      if (existing) return json({ ok: true, existing: true });
      const body = (await request.json()) as {
        roomId: string;
        players: Record<Side, RoomPlayer>;
      };
      const initiative: Side = crypto.getRandomValues(new Uint8Array(1))[0] % 2 ? "cyan" : "red";
      const room: StoredRoom = {
        id: body.roomId,
        status: "waiting",
        players: body.players,
        game: createGame(body.players.cyan, body.players.red, initiative),
        plans: {},
        locks: {
          cyan: { remove: false, move: false, attack: false },
          red: { remove: false, move: false, attack: false },
        },
        deadlineAt: null,
        nextRoundAt: null,
      };
      await this.state.storage.put("room", room);
      return json({ ok: true });
    }

    if (request.headers.get("upgrade")?.toLowerCase() !== "websocket") {
      return json({ error: "websocket_required" }, { status: 426 });
    }
    const room = await this.state.storage.get<StoredRoom>("room");
    if (!room) return json({ error: "room_not_found" }, { status: 404 });
    const playerId = url.searchParams.get("playerId") ?? "";
    const token = url.searchParams.get("token") ?? "";
    const side = (Object.keys(room.players) as Side[]).find(
      (candidate) =>
        room.players[candidate].id === playerId && room.players[candidate].token === token,
    );
    if (!side) return json({ error: "invalid_room_token" }, { status: 403 });
    for (const existing of this.state.getWebSockets(playerId)) {
      existing.close(4001, "reconnected");
    }
    const pair = new WebSocketPair();
    const client = pair[0];
    const server = pair[1] as WebSocketWithAttachment;
    this.state.acceptWebSocket(server, [playerId, side]);
    server.serializeAttachment({ kind: "room", playerId, side });
    server.send(JSON.stringify(this.snapshot(room, side)));
    if (room.status === "waiting" && this.bothConnected(room, side)) {
      const currentVisible = this.state.getWebSockets(playerId).length > 0;
      const roundStarted = await this.startPlanning(room);
      if (!currentVisible) server.send(JSON.stringify(roundStarted));
    } else {
      this.broadcast(room, { type: "connection", side, connected: true });
    }
    return wsResponse(client);
  }

  async webSocketMessage(
    socket: WebSocketWithAttachment,
    message: string | ArrayBuffer,
  ): Promise<void> {
    if (typeof message !== "string") return;
    const attachment = socket.deserializeAttachment() as
      | { kind: "room"; playerId: string; side: Side }
      | undefined;
    if (!attachment) return;
    let data: Record<string, unknown>;
    try {
      data = JSON.parse(message) as Record<string, unknown>;
    } catch {
      socket.send(JSON.stringify({ type: "error", code: "invalid_json" }));
      return;
    }
    if (data.type === "ping") {
      socket.send(JSON.stringify({ type: "pong", at: Date.now() }));
      return;
    }
    const room = await this.state.storage.get<StoredRoom>("room");
    if (!room || room.status !== "planning" || room.game.winner) return;
    if (data.round !== room.game.round) {
      socket.send(JSON.stringify({ type: "error", code: "stale_round" }));
      return;
    }
    const side = attachment.side;
    const partial = room.plans[side] ?? {};
    if (data.type === "lock_remove" && !room.locks[side].remove) {
      const cell = typeof data.cell === "string" ? data.cell : undefined;
      if (cell && !canRemove(room.game, cell)) {
        socket.send(JSON.stringify({ type: "error", code: "invalid_remove" }));
        return;
      }
      room.plans[side] = { ...partial, remove: cell };
      room.locks[side].remove = true;
    } else if (data.type === "lock_move" && room.locks[side].remove && !room.locks[side].move) {
      const moves = Array.isArray(data.moves)
        ? data.moves.filter((cell): cell is string => typeof cell === "string")
        : [];
      if (!validateMovePlan(room.game, side, moves)) {
        socket.send(JSON.stringify({ type: "error", code: "invalid_move" }));
        return;
      }
      room.plans[side] = { ...partial, moves };
      room.locks[side].move = true;
    } else if (
      data.type === "lock_attack" &&
      room.locks[side].move &&
      !room.locks[side].attack
    ) {
      const weapon = data.weapon as WeaponId | undefined;
      const direction = Number(data.direction);
      if (
        !weapon ||
        !room.players[side].weapons.includes(weapon) ||
        direction < 1 ||
        direction > 6
      ) {
        socket.send(JSON.stringify({ type: "error", code: "invalid_attack" }));
        return;
      }
      room.plans[side] = { ...partial, weapon, direction };
      room.locks[side].attack = true;
    } else {
      socket.send(JSON.stringify({ type: "error", code: "phase_locked" }));
      return;
    }
    await this.state.storage.put("room", room);
    this.broadcast(room, { type: "progress", locks: room.locks });
    if (room.locks.cyan.attack && room.locks.red.attack) await this.resolve(room);
  }

  async webSocketClose(socket: WebSocketWithAttachment): Promise<void> {
    const attachment = socket.deserializeAttachment() as { side?: Side } | undefined;
    const room = await this.state.storage.get<StoredRoom>("room");
    if (room && attachment?.side) {
      this.broadcast(room, { type: "connection", side: attachment.side, connected: false });
    }
  }

  async alarm(): Promise<void> {
    const room = await this.state.storage.get<StoredRoom>("room");
    if (!room || room.status === "finished") return;
    const now = Date.now();
    if (room.status === "planning" && room.deadlineAt && now >= room.deadlineAt) {
      await this.resolve(room);
      return;
    }
    if (room.status === "resolving" && room.nextRoundAt && now >= room.nextRoundAt) {
      await this.startPlanning(room);
      return;
    }
    const next = room.status === "planning" ? room.deadlineAt : room.nextRoundAt;
    if (next) await this.state.storage.setAlarm(next);
  }

  private bothConnected(room: StoredRoom, joiningSide?: Side): boolean {
    return (Object.keys(room.players) as Side[]).every((side) =>
      side === joiningSide || this.state.getWebSockets(room.players[side].id).length > 0,
    );
  }

  private async startPlanning(room: StoredRoom): Promise<Record<string, unknown>> {
    room.status = "planning";
    room.plans = {};
    room.locks = {
      cyan: { remove: false, move: false, attack: false },
      red: { remove: false, move: false, attack: false },
    };
    room.deadlineAt = Date.now() + 30_000;
    room.nextRoundAt = null;
    await this.state.storage.put("room", room);
    await this.state.storage.setAlarm(room.deadlineAt);
    const payload = {
      type: "round_started",
      game: room.game,
      deadlineAt: room.deadlineAt,
      locks: room.locks,
    };
    this.broadcast(room, payload);
    return payload;
  }

  private completePlans(room: StoredRoom): Record<Side, TurnPlan> {
    return {
      cyan: { moves: [], ...room.plans.cyan },
      red: { moves: [], ...room.plans.red },
    };
  }

  private async resolve(room: StoredRoom): Promise<void> {
    if (room.status !== "planning") return;
    const before = room.game;
    const result = resolveRound(before, this.completePlans(room), () => {
      const value = crypto.getRandomValues(new Uint32Array(1))[0];
      return (value % 6) + 1;
    });
    room.game = result.state;
    room.latest = { before, after: result.state, events: result.events };
    room.deadlineAt = null;
    if (result.state.winner) {
      room.status = "finished";
      room.nextRoundAt = null;
      await this.state.storage.deleteAlarm();
    } else {
      room.status = "resolving";
      room.nextRoundAt = Date.now() + Math.max(7_000, result.events.length * 950 + 1_800);
      await this.state.storage.setAlarm(room.nextRoundAt);
    }
    await this.state.storage.put("room", room);
    this.broadcast(room, {
      type: "resolution",
      before,
      after: result.state,
      events: result.events,
      nextRoundAt: room.nextRoundAt,
      winner: result.state.winner,
    });
  }

  private snapshot(room: StoredRoom, side: Side): Record<string, unknown> {
    return {
      type: "room_snapshot",
      roomId: room.id,
      side,
      status: room.status,
      game: room.game,
      locks: room.locks,
      deadlineAt: room.deadlineAt,
      latest: room.status === "resolving" ? room.latest : undefined,
    };
  }

  private broadcast(room: StoredRoom, payload: unknown): void {
    const message = JSON.stringify(payload);
    for (const socket of this.state.getWebSockets()) {
      try { socket.send(message); } catch { /* closed sockets are removed by the runtime */ }
    }
  }
}
