import { NextRequest } from "next/server";

import { sendUpcomingRoomReminders } from "@/lib/reminders";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  return reminders(request);
}

export async function POST(request: NextRequest) {
  return reminders(request);
}

async function reminders(request: NextRequest) {
  const secret = process.env.CRON_SECRET;
  const supplied =
    request.headers.get("authorization")?.replace(/^Bearer\s+/i, "") ||
    request.nextUrl.searchParams.get("secret");

  if (secret && supplied !== secret) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  const retrySent = ["1", "true", "yes", "on"].includes(
    (request.nextUrl.searchParams.get("retrySent") || "").toLowerCase()
  );

  return Response.json({ ok: true, ...(await sendUpcomingRoomReminders({ retrySent })) });
}
