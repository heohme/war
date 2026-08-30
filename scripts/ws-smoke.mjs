const origin = process.argv[2] || "https://multiwar.pages.dev";
const messages = { cyan: [], red: [] };

function connect(label) {
  const id = crypto.randomUUID();
  const url = new URL("/ws/match", origin);
  url.protocol = url.protocol === "https:" ? "wss:" : "ws:";
  url.searchParams.set("playerId", id);
  url.searchParams.set("name", label);
  url.searchParams.set("weapons", "sword,bow");
  const socket = new WebSocket(url);
  socket.addEventListener("message", (event) => messages[label].push(JSON.parse(event.data)));
  return socket;
}

const cyan = connect("cyan");
await new Promise((resolve, reject) => {
  cyan.addEventListener("open", resolve, { once: true });
  cyan.addEventListener("error", reject, { once: true });
});
const red = connect("red");
await new Promise((resolve, reject) => {
  red.addEventListener("open", resolve, { once: true });
  red.addEventListener("error", reject, { once: true });
});
await new Promise((resolve) => setTimeout(resolve, 2500));
cyan.close(); red.close();
const matched = messages.cyan.some((message) => message.type === "match_found") && messages.red.some((message) => message.type === "match_found");
const cyanRoom = messages.cyan.find((message) => message.type === "match_found")?.roomId;
const redRoom = messages.red.find((message) => message.type === "match_found")?.roomId;
console.log(JSON.stringify({ matched, sameRoom: Boolean(cyanRoom && cyanRoom === redRoom), queued: messages.red.find((message) => message.type === "matching")?.queued }, null, 2));
await new Promise((resolve) => setTimeout(resolve, 200));
process.exit(matched && cyanRoom === redRoom ? 0 : 1);
