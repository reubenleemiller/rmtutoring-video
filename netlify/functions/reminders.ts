import type { Config } from "@netlify/functions";

import { sendUpcomingRoomReminders } from "../../lib/reminders";

const reminders = async () => {
  try {
    return Response.json({ ok: true, ...(await sendUpcomingRoomReminders()) });
  } catch (error) {
    return Response.json(
      {
        ok: false,
        error: error instanceof Error ? error.message : "Unknown reminder error"
      },
      { status: 500 }
    );
  }
};

export default reminders;

export const config: Config = {
  schedule: "@hourly"
};
