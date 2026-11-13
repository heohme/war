import assert from "node:assert/strict";
import test from "node:test";
import { readFile, mkdtemp, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import ts from "typescript";

// Run the actual worker handlers with Durable Object storage/socket stand-ins.
const temporary = await mkdtemp(join(tmpdir(), "multiwar-friend-tests-"));
let source = await readFile(new URL("../worker/api.ts", import.meta.url), "utf8");
for (const name of ["game", "feedback", "timing"]) {
  source = source.replace(`"../lib/${name}"`, JSON.stringify(new URL(`../lib/${name}.ts`, import.meta.url).href));
}
await writeFile(join(temporary, "worker.mjs"), ts.transpileModule(source, { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ESNext } }).outputText);
const NativeResponse = globalThis.Response;
class Socket {
  readyState = 1;
  messages = [];
  tags = [];
  send(value) { this.messages.push(JSON.parse(value)); }
  close() { this.readyState = 3; }
  serializeAttachment(value) { this.attachment = value; }
  deserializeAttachment() { return this.attachment; }
}
globalThis.WebSocketPair = class {
  constructor() { const server = new Socket(); return { 0: { server }, 1: server }; }
};
globalThis.Response = class extends NativeResponse {
  constructor(body, init) {
    super(body, init?.status === 101 ? { status: 200 } : init);
    if (init?.status === 101) {
      Object.defineProperty(this, "status", { value: 101 });
      this.webSocket = init.webSocket;
    }
  }
};
const { MatchQueue, GameRoom } = await import(pathToFileURL(join(temporary, "worker.mjs")));
const makeState = () => {
  const data = new Map(); const sockets = [];
  return {
    data, sockets,
    storage: {
      async get(key) { return structuredClone(data.get(key)); },
      async put(key, value) { data.set(key, structuredClone(value)); },
      async list({ prefix } = {}) { return new Map([...data].filter(([key]) => key.startsWith(prefix || ""))); },
      async delete(keys) { let count = 0; for (const key of keys) if (data.delete(key)) count++; return count; },
      async setAlarm(time) { data.set("alarm", time); },
      async deleteAlarm() { data.delete("alarm"); },
    },
    acceptWebSocket(socket, tags = []) { socket.tags = tags; sockets.push(socket); },
    getWebSockets(tag) { return sockets.filter((socket) => socket.readyState === 1 && (!tag || socket.tags.includes(tag))); },
  };
};
function environment() {
  const rooms = new Map();
  const namespace = {
    idFromName: (name) => name,
    get(id) {
      if (!rooms.has(id)) { const state = makeState(); rooms.set(id, { state, room: new GameRoom(state) }); }
      return rooms.get(id).room;
    },
  };
  const state = makeState();
  return { rooms, state, queue: new MatchQueue(state, { GAME_ROOM: namespace }) };
}
const request = (path, body) => new Request(`https://test.invalid${path}`, body ? { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) } : { headers: { upgrade: "websocket" } });
async function createFriend(env) {
  const response = await env.queue.fetch(request("/ws/friend?action=create&playerId=host&name=Host&weapons=sword,bow"));
  return response.webSocket.server.messages.find((message) => message.type === "match_found");
}
const credentials = {
  cyan: { id: "host", name: "Host", weapons: ["sword", "bow"], side: "cyan", token: "host-secret" },
  red: { id: "guest", name: "Guest", weapons: ["sword", "bow"], side: "red", token: "guest-secret" },
};
async function connect(room, id, token) {
  const response = await room.fetch(request(`/ws/room/test?playerId=${id}&token=${token}`));
  return response.webSocket.server;
}

test("friend code creates a private waiting room and starts only with both connected", async () => {
  const env = environment(); const host = await createFriend(env);
  assert.match(host.roomCode, /^[23456789A-HJ-NP-Z]{6}$/);
  const { room, state } = env.rooms.get(host.roomId);
  const hostSocket = await connect(room, "host", host.token);
  const snapshot = hostSocket.messages.find((message) => message.type === "room_snapshot");
  assert.equal(snapshot.mode, "friend"); assert.equal(snapshot.connected.red, false);
  assert.equal(snapshot.deadlineAt, null); assert.equal(snapshot.game.players.cyan.token, undefined);
  assert.equal(hostSocket.messages.some((message) => message.type === "round_started"), false);
  const response = await env.queue.fetch(request(`/ws/friend?action=join&code=${host.roomCode.toLowerCase()}&playerId=guest`));
  const guest = response.webSocket.server.messages.find((message) => message.type === "match_found");
  assert.equal(guest.roomId, host.roomId); assert.equal(guest.side, "red");
  assert.equal(state.data.get("room").status, "waiting");
  await connect(room, "guest", guest.token);
  assert.equal(state.data.get("room").status, "planning");
  const start = hostSocket.messages.find((message) => message.type === "round_started");
  assert.equal(start.matchId, snapshot.matchId); assert.ok(start.connected.cyan && start.connected.red);
  assert.equal(JSON.stringify(start).includes(host.token), false);
  assert.equal(JSON.stringify(start).includes(guest.token), false);
});

test("friend rooms reject self-join, invalid/expired codes, and concurrent extra guests", async () => {
  const env = environment(); const host = await createFriend(env);
  const self = await env.queue.fetch(request(`/ws/friend?action=join&code=${host.roomCode}&playerId=host`));
  assert.equal(self.webSocket.server.messages[0].code, "cannot_join_self");
  const { room } = env.rooms.get(host.roomId);
  const results = await Promise.all(["one", "two"].map((id) => room.fetch(request("/join-friend", { player: { ...credentials.red, id } }))));
  assert.deepEqual(results.map((result) => result.status).sort(), [200, 409]);
  const full = await env.queue.fetch(request(`/ws/friend?action=join&code=${host.roomCode}&playerId=third`));
  assert.equal(full.webSocket.server.messages[0].code, "room_full");
  const invalid = await env.queue.fetch(request("/ws/friend?action=join&code=123&playerId=third"));
  assert.equal(invalid.webSocket.server.messages[0].code, "invalid_room_code");
  env.state.data.get(`friend:${host.roomCode}`).expiresAt = Date.now() - 1;
  const expired = await env.queue.fetch(request(`/ws/friend?action=join&code=${host.roomCode}&playerId=third`));
  assert.equal(expired.webSocket.server.messages[0].code, "room_expired");
});

test("both players must consent to rematch; it resets in the same room and rejects old match input", async () => {
  const state = makeState(); const room = new GameRoom(state);
  await room.fetch(request("/init", { roomId: "test", players: credentials }));
  const cyan = await connect(room, "host", "host-secret");
  const red = await connect(room, "guest", "guest-secret");
  const finished = state.data.get("room");
  const originalMatchId = finished.matchId; const firstInitiative = finished.initialInitiative;
  finished.status = "finished"; finished.game.winner = "cyan"; finished.game.round = 8;
  finished.game.players.red.health = 0; finished.game.removed = ["0,2"];
  finished.plans = { cyan: { moves: ["-3,0"] } }; finished.latest = { before: finished.game, after: finished.game, events: [] };
  await state.storage.put("room", finished);
  await room.webSocketMessage(cyan, JSON.stringify({ type: "request_rematch", matchId: originalMatchId }));
  assert.equal(state.data.get("room").status, "finished");
  assert.equal(state.data.get("room").rematch.cyan, true);
  const reconnected = await connect(room, "host", "host-secret");
  assert.equal(reconnected.messages[0].rematch.cyan, true);
  await room.webSocketMessage(red, JSON.stringify({ type: "request_rematch", matchId: originalMatchId }));
  const next = state.data.get("room");
  assert.equal(next.id, "test"); assert.notEqual(next.matchId, originalMatchId);
  assert.equal(next.status, "planning"); assert.equal(next.game.round, 1); assert.equal(next.game.winner, null);
  assert.equal(next.game.players.red.health, 6); assert.deepEqual(next.game.removed, []);
  assert.deepEqual(next.plans, {}); assert.equal(next.latest, undefined);
  assert.equal(next.initialInitiative, firstInitiative === "cyan" ? "red" : "cyan");
  assert.equal(next.players.cyan.token, "host-secret"); assert.equal(next.game.players.cyan.token, undefined);
  await room.webSocketMessage(reconnected, JSON.stringify({ type: "lock_remove", round: 1, matchId: originalMatchId }));
  assert.equal(reconnected.messages.at(-1).code, "stale_match");
  assert.equal(state.data.get("room").locks.cyan.remove, false);
});

test("explicit leave invalidates a waiting invitation", async () => {
  const env = environment(); const host = await createFriend(env); const { room, state } = env.rooms.get(host.roomId);
  const socket = await connect(room, "host", host.token);
  await room.webSocketMessage(socket, JSON.stringify({ type: "leave_room", matchId: state.data.get("room").matchId }));
  const response = await env.queue.fetch(request(`/ws/friend?action=join&code=${host.roomCode}&playerId=guest`));
  assert.equal(response.webSocket.server.messages[0].code, "room_expired");
  assert.equal(state.data.get("room").peerLeft, true);
  assert.equal(state.data.has("alarm"), false);
});

test("expired waiting-room reconnects report a readable error only after authentication", async () => {
  const env = environment(); const host = await createFriend(env); const { room, state } = env.rooms.get(host.roomId);
  const stored = state.data.get("room"); stored.expiresAt = Date.now() - 1;
  await state.storage.put("room", stored);
  const stranger = await room.fetch(request(`/ws/room/${host.roomId}?playerId=host&token=wrong`));
  assert.equal(stranger.status, 403);
  assert.deepEqual(await stranger.json(), { error: "invalid_room_token" });
  const response = await room.fetch(request(`/ws/room/${host.roomId}?playerId=host&token=${host.token}`));
  assert.equal(response.status, 101);
  assert.deepEqual(response.webSocket.server.messages, [{ type: "error", code: "room_expired" }]);
  assert.equal(response.webSocket.server.readyState, 3);
  assert.equal(state.data.get("room").status, "waiting");
});

test("an opponent leaving the result screen prevents starting another match", async () => {
  const state = makeState(); const room = new GameRoom(state);
  await room.fetch(request("/init", { roomId: "test", players: credentials }));
  const cyan = await connect(room, "host", "host-secret");
  const red = await connect(room, "guest", "guest-secret");
  const finished = state.data.get("room"); finished.status = "finished"; finished.game.winner = "draw";
  await state.storage.put("room", finished);
  await room.webSocketMessage(cyan, JSON.stringify({ type: "request_rematch", matchId: finished.matchId }));
  await room.webSocketMessage(red, JSON.stringify({ type: "leave_room", matchId: finished.matchId }));
  assert.equal(cyan.messages.at(-1).type, "peer_left");
  await room.webSocketMessage(cyan, JSON.stringify({ type: "request_rematch", matchId: finished.matchId }));
  assert.equal(cyan.messages.at(-1).code, "peer_left");
  assert.equal(state.data.get("room").status, "finished");
  assert.deepEqual(state.data.get("room").rematch, { cyan: false, red: false });
});

test("reconnection restores only the viewer's own locked plan", async () => {
  const state = makeState(); const room = new GameRoom(state);
  await room.fetch(request("/init", { roomId: "test", players: credentials }));
  const cyan = await connect(room, "host", "host-secret");
  const red = await connect(room, "guest", "guest-secret");
  const matchId = state.data.get("room").matchId;
  await room.webSocketMessage(cyan, JSON.stringify({ type: "lock_remove", round: 1, matchId, cell: "0,2" }));
  await room.webSocketMessage(cyan, JSON.stringify({ type: "lock_move", round: 1, matchId, moves: ["-3,0", "-2,0"] }));
  await room.webSocketMessage(red, JSON.stringify({ type: "lock_remove", round: 1, matchId, cell: "1,2" }));
  assert.equal(cyan.messages.some((message) => "selfPlan" in message && message.selfPlan.remove === "1,2"), false);
  assert.equal(red.messages.some((message) => "plans" in message), false);
  const reconnected = await connect(room, "host", "host-secret");
  const snapshot = reconnected.messages.find((message) => message.type === "room_snapshot");
  assert.deepEqual(snapshot.selfPlan, { remove: "0,2", moves: ["-3,0", "-2,0"] });
  assert.equal("plans" in snapshot, false);
  assert.equal(JSON.stringify(snapshot).includes("guest-secret"), false);
});

test.after(async () => { globalThis.Response = NativeResponse; await rm(temporary, { recursive: true, force: true }); });
