import { handler, ok } from "@/lib/api";
import { overview } from "@/lib/services/analytics/service";

export const GET = handler(async () => ok(await overview()));
