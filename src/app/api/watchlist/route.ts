import { z } from "zod";
import { addWatchlist, getWatchlist, removeWatchlist } from "@/lib/db/repo";
import { getInstrument } from "@/lib/instruments";
import { fail, json, withUser } from "@/lib/api-helpers";

const schema = z.object({
  symbol: z.string().min(1),
  action: z.enum(["add", "remove"]),
});

export async function GET() {
  return withUser(async (user) => json({ watchlist: getWatchlist(user.id) }));
}

export async function POST(request: Request) {
  return withUser(async (user) => {
    const parsed = schema.safeParse(await request.json());
    if (!parsed.success) return fail("Invalid watchlist request.", 422, "VALIDATION");
    if (!getInstrument(parsed.data.symbol)) return fail("Unknown instrument.", 404, "UNKNOWN_SYMBOL");

    if (parsed.data.action === "add") addWatchlist(user.id, parsed.data.symbol);
    else removeWatchlist(user.id, parsed.data.symbol);

    return json({ watchlist: getWatchlist(user.id) });
  });
}
