const origin = process.argv[2] || "https://multiwar.pages.dev";
const messages = { cyan: [], red: [], solo: [], soloRoom: [] };

function connect(label, mode) {
  const id = crypto.randomUUID();
  const url = new URL("/ws/match", origin);
  url.protocol = url.protocol === "https:" ? "wss:" : "ws:";
  url.searchParams.set("playerId", id);
  url.searchParams.set("name", label);
  url.searchParams.set("weapons", "sword,bow");
  if (mode) url.searchParams.set("mode", mode);
  const socket = new WebSocket(url);
  socket.addEventListener("message", (event) => messages[label].push(JSON.parse(event.data)));
  return { id, socket };
}

function waitForOpen(socket) {
  return new Promise((resolve, reject) => {
    socket.addEventListener("open", resolve, { once: true });
    socket.addEventListener("error", reject, { once: true });
  });
}

async function waitFor(predicate, timeout = 5_000) {
  const deadline = Date.now() + timeout;
  while (Date.now() < deadline) {
    if (predicate()) return;
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  throw new Error("Timed out waiting for WebSocket state");
}

const cyan = connect("cyan");
await waitForOpen(cyan.socket);
const red = connect("red");
await waitForOpen(red.socket);
await waitFor(() => messages.cyan.some((message) => message.type === "match_found") && messages.red.some((message) => message.type === "match_found"));
cyan.socket.close(); red.socket.close();
const matched = messages.cyan.some((message) => message.type === "match_found") && messages.red.some((message) => message.type === "match_found");
const cyanRoom = messages.cyan.find((message) => message.type === "match_found")?.roomId;
const redRoom = messages.red.find((message) => message.type === "match_found")?.roomId;

const solo = connect("solo", "solo");
await waitForOpen(solo.socket);
await waitFor(() => messages.solo.some((message) => message.type === "match_found"));
const soloMatch = messages.solo.find((message) => message.type === "match_found");
solo.socket.close();

const roomUrl = new URL(`/ws/room/${soloMatch.roomId}`, origin);
roomUrl.protocol = roomUrl.protocol === "https:" ? "wss:" : "ws:";
roomUrl.searchParams.set("playerId", solo.id);
roomUrl.searchParams.set("token", soloMatch.token);
const soloRoomSocket = new WebSocket(roomUrl);
soloRoomSocket.addEventListener("message", (event) => messages.soloRoom.push(JSON.parse(event.data)));
await waitForOpen(soloRoomSocket);
await waitFor(() => messages.soloRoom.some((message) => message.type === "round_started"));
const soloRound = messages.soloRoom.find((message) => message.type === "round_started");
soloRoomSocket.close();

const soloReady = Boolean(soloMatch?.solo && soloRound?.locks?.red?.attack);
console.log(JSON.stringify({
  matched,
  sameRoom: Boolean(cyanRoom && cyanRoom === redRoom),
  soloReady,
  queued: messages.red.find((message) => message.type === "matching")?.queued,
}, null, 2));
await new Promise((resolve) => setTimeout(resolve, 200));
process.exit(matched && cyanRoom === redRoom && soloReady ? 0 : 1);
