import { handler, ok } from "@/lib/api";
import { testConnection } from "@/lib/connectors/shopee";

export const POST = handler(async () => {
  const cfg = {
    appId: process.env.SHOPEE_APP_ID,
    appSecret: process.env.SHOPEE_APP_SECRET,
    apiAccessConfirmed: process.env.SHOPEE_API_CONFIRMED === "true",
  };
  return ok(await testConnection(cfg));
});
