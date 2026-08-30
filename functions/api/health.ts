interface PagesContext {
  env: { MATCH_QUEUE?: unknown; GAME_ROOM?: unknown };
}

export const onRequest = async ({ env }: PagesContext): Promise<Response> => {
  const bound = Boolean(env.MATCH_QUEUE && env.GAME_ROOM);
  return Response.json({ ok: bound, service: "multiwar-pages", durableObjects: bound }, { status: bound ? 200 : 503 });
};
