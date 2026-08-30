interface DurableObjectStub { fetch(request: Request): Promise<Response> }
interface DurableObjectNamespace {
  idFromName(name: string): unknown;
  get(id: unknown): DurableObjectStub;
}

interface PagesContext {
  request: Request;
  env: { MATCH_QUEUE: DurableObjectNamespace; GAME_ROOM: DurableObjectNamespace };
}

export const onRequest = async ({ request, env }: PagesContext): Promise<Response> => {
  const url = new URL(request.url);
  const origin = request.headers.get("origin");
  if (origin && origin !== "https://multiwar.pages.dev") return new Response("Forbidden", { status: 403 });
  if (url.pathname === "/ws/match") {
    return env.MATCH_QUEUE.get(env.MATCH_QUEUE.idFromName("global-v1")).fetch(request);
  }
  const room = url.pathname.match(/^\/ws\/room\/([a-zA-Z0-9-]+)$/);
  if (room) return env.GAME_ROOM.get(env.GAME_ROOM.idFromName(room[1])).fetch(request);
  return new Response("Not found", { status: 404 });
};
