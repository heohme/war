interface DurableObjectStub { fetch(request: Request): Promise<Response> }
interface DurableObjectNamespace {
  idFromName(name: string): unknown;
  get(id: unknown): DurableObjectStub;
}

interface PagesContext {
  request: Request;
  env: { MATCH_QUEUE: DurableObjectNamespace };
}

export const onRequestPost = async ({ request, env }: PagesContext): Promise<Response> => {
  const origin = request.headers.get("origin");
  if (origin && origin !== "https://multiwar.pages.dev") return Response.json({ error: "forbidden" }, { status: 403 });
  return env.MATCH_QUEUE.get(env.MATCH_QUEUE.idFromName("global-v1")).fetch(request);
};
