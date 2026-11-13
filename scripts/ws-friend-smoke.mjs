import assert from "node:assert/strict";

// Deliberately defaults to local: this test plays a full match and rematch.
const origin = process.argv[2] || "http://localhost:8787";
const sockets = [];
function connect(path, params) {
  const url = new URL(path, origin);
  url.protocol = url.protocol === "https:" ? "wss:" : "ws:";
  for (const [key, value] of Object.entries(params)) url.searchParams.set(key, value);
  const socket = new WebSocket(url);
  sockets.push(socket);
  const messages = [];
  socket.addEventListener("message", (event) => messages.push(JSON.parse(event.data)));
  return { socket, messages };
}
async function waitFor(check, timeout = 12_000) {
  const end = Date.now() + timeout;
  while (Date.now() < end) {
    const value = check();
    if (value) return value;
    await new Promise((resolve) => setTimeout(resolve, 50));
  }
  throw new Error("Timed out waiting for friend-room state");
}
async function friend(action, id, code) {
  const peer = connect("/ws/friend", { action, playerId: id, name: `friend-test-${action}`, weapons: "dagger,bow", ...(code ? { code } : {}) });
  const result = await waitFor(() => peer.messages.find((m) => m.type === "match_found" || m.type === "error"));
  peer.socket.close();
  return result;
}
async function enter(credential, playerId) {
  const peer = connect(`/ws/room/${credential.roomId}`, { playerId, token: credential.token });
  await waitFor(() => peer.messages.find((m) => m.type === "room_snapshot"));
  return peer;
}
function assertNoTokens(value) {
  assert.doesNotMatch(JSON.stringify(value), /"token"/);
}
try {
  const ids = [crypto.randomUUID(), crypto.randomUUID()];
  const host = await friend("create", ids[0]);
  assert.equal(host.mode, "friend");
  const a = await enter(host, ids[0]);
  const initial = a.messages.find((m) => m.type === "room_snapshot");
  assert.equal(initial.status, "waiting"); assert.equal(initial.deadlineAt, null); assertNoTokens(initial);
  assert.equal((await friend("join", ids[0], host.roomCode)).code, "cannot_join_self");
  const guest = await friend("join", ids[1], host.roomCode.toLowerCase());
  assert.equal(guest.roomId, host.roomId);
  assert.equal((await friend("join", crypto.randomUUID(), host.roomCode)).code, "room_full");
  const b = await enter(guest, ids[1]);
  const first = await waitFor(() => a.messages.find((m) => m.type === "round_started"));
  assertNoTokens(first);
  let round = first;
  let finished;
  for (let index = 0; index < 14; index += 1) {
    const number = round.game.round;
    for (const [peer, side] of [[a, "cyan"], [b, "red"]]) {
      const moves = number === 1 ? side === "cyan" ? ["-3,0", "-2,0"] : ["3,0", "2,0"]
        : number === 2 ? side === "cyan" ? ["-1,0", "0,0"] : ["1,0", "0,0"] : [];
      for (const command of [{ type: "lock_remove" }, { type: "lock_move", moves }, { type: "lock_attack", weapon: "dagger", direction: 1 }]) {
        peer.socket.send(JSON.stringify({ ...command, round: number, matchId: round.matchId }));
      }
    }
    const resolution = await waitFor(() => a.messages.find((m) => m.type === "resolution" && m.before.round === number));
    const other = await waitFor(() => b.messages.find((m) => m.type === "resolution" && m.before.round === number));
    assert.deepEqual(resolution.after, other.after); assertNoTokens(resolution);
    if (resolution.after.winner) { finished = resolution; break; }
    round = await waitFor(() => a.messages.find((m) => m.type === "round_started" && m.game.round === number + 1), 45_000);
  }
  assert.ok(finished, "full match must finish");
  a.socket.send(JSON.stringify({ type: "request_rematch", matchId: first.matchId }));
  await waitFor(() => b.messages.find((m) => m.type === "rematch_state" && m.rematch.cyan));
  assert.equal(a.messages.filter((m) => m.type === "round_started" && m.game.round === 1).length, 1);
  const resumed = await enter(host, ids[0]);
  assert.equal(resumed.messages.find((m) => m.type === "room_snapshot").rematch.cyan, true);
  b.socket.send(JSON.stringify({ type: "request_rematch", matchId: first.matchId }));
  const fresh = await waitFor(() => resumed.messages.find((m) => m.type === "round_started" && m.matchId !== first.matchId));
  assert.equal(fresh.game.round, 1); assert.equal(fresh.game.players.cyan.health, 6); assert.equal(fresh.game.players.red.health, 6);
  assert.deepEqual(fresh.game.removed, []); assert.notEqual(fresh.game.initiative, first.game.initiative);
  resumed.socket.send(JSON.stringify({ type: "lock_remove", matchId: first.matchId, round: 1 }));
  await waitFor(() => resumed.messages.find((m) => m.type === "error" && m.code === "stale_match"));
  resumed.socket.send(JSON.stringify({ type: "leave_room", matchId: fresh.matchId }));
  await waitFor(() => b.messages.find((m) => m.type === "peer_left"));
  console.log(JSON.stringify({ waitingWithoutTimer: true, codeJoin: true, selfJoinRejected: true, fullRoomRejected: true, fullMatchCompleted: true, rematchRequiresBoth: true, rematchSurvivesReconnect: true, sameRoomFreshMatch: true, initiativeSwapped: true, staleMatchRejected: true, departureNotified: true }, null, 2));
} finally {
  for (const socket of sockets) if (socket.readyState <= 1) socket.close();
}
