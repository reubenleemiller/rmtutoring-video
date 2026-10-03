import { NextRequest } from "next/server";

import { cleanupExpiredDailyRooms } from "@/lib/cleanup";
import { supabaseAdmin } from "@/lib/supabase-admin";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  return cleanup(request);
}

export async function POST(request: NextRequest) {
  return cleanup(request);
}

async function cleanup(request: NextRequest) {
  const secret = process.env.CRON_SECRET;
  const supplied =
    request.headers.get("authorization")?.replace(/^Bearer\s+/i, "") ||
    request.nextUrl.searchParams.get("secret");

  if (secret && supplied !== secret) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  const supabase = supabaseAdmin();
  const result = await cleanupExpiredDailyRooms(supabase);

  return Response.json({
    ok: result.failed.length === 0,
    deleted: result.deleted,
    failed: result.failed
  });
}
