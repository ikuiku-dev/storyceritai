import { handler, ok } from "@/lib/api";
import { listSources } from "@/lib/connectors/sources/registry";

export const GET = handler(async () => ok({ sources: await listSources() }));
