import { handler, ok } from "@/lib/api";
import { connectionStatus } from "@/lib/services/publishing/connection";
export const GET = handler(async () => ok(await connectionStatus()));
