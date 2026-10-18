import { handler, ok } from "@/lib/api";
import { refreshToken } from "@/lib/services/publishing/connection";
export const POST = handler(async () => ok(await refreshToken()));
