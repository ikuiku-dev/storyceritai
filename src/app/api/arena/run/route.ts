import { handler, ok, parseBody } from "@/lib/api";
import { tournamentInput } from "@/lib/schemas";
import { runTournament } from "@/lib/services/arena/tournament";

// Bounded by maxAiCalls and a 180s wall clock inside the service.
export const maxDuration = 300;

export const POST = handler(async (req) => {
  const input = await parseBody(req, tournamentInput);
  return ok(await runTournament(input));
});
