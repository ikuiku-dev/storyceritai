import { handler, ok } from "@/lib/api";
import { disconnect } from "@/lib/services/publishing/connection";
export const POST = handler(async () => ok(await disconnect()));
