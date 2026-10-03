import { requireEnv } from "./env";

const CAL_API_BASE = "https://api.cal.com/v2";
const CAL_API_VERSION = "2024-08-13";
const CAL_LATEST_API_VERSION = "2026-02-25";

type CalApiResponse<T> = {
  status: "success" | "error";
  data: T;
};

type BookingReference = {
  type: string;
  eventUid?: string;
  destinationCalendarId?: string;
  id: number;
};

type CalendarEvent = {
  start?: {
    time: string;
    timeZone?: string;
  };
  end?: {
    time: string;
    timeZone?: string;
  };
  title?: string;
  description?: string | null;
  attendees?: Array<{
    email: string;
    name?: string;
    self?: boolean;
    optional?: boolean;
    host?: boolean;
  }>;
  status?: "accepted" | "pending" | "declined" | "cancelled";
};

type CalBookingLookup = {
  uid?: string;
  bookingUid?: string;
  id?: string | number;
  bookingId?: string | number;
  status?: string;
  recurringBookingUid?: string;
  recurring_booking_uid?: string;
};

export async function isRecurringBookingUid(bookingUid: string) {
  const response = await fetch(`${CAL_API_BASE}/bookings/${encodeURIComponent(bookingUid)}`, {
    headers: {
      Authorization: `Bearer ${requireEnv("CAL_API_KEY")}`,
      "cal-api-version": CAL_LATEST_API_VERSION
    }
  });

  if (!response.ok) return false;

  const json = (await response.json()) as CalApiResponse<unknown>;
  return Array.isArray(json.data) && json.data.length > 1;
}

export async function cancelledRecurringBookingUids(bookingUid: string) {
  const booking = await getBooking(bookingUid);
  const recurringUid = recurringBookingUidFromLookup(booking);
  if (!recurringUid) {
    const bookingItem = Array.isArray(booking) ? booking[0] : booking;
    return bookingItem && isCancelledBooking(bookingItem) ? [bookingUid] : [];
  }

  const series = await getBooking(recurringUid);
  const seriesBookings = Array.isArray(series) ? series : [series];

  return seriesBookings
    .filter(isCancelledBooking)
    .map((item) => stringOrNull(item.uid || item.bookingUid))
    .filter((uid): uid is string => Boolean(uid));
}

export async function recurringSeriesBookingUids(bookingUid: string) {
  const booking = await getBooking(bookingUid);
  const recurringUid = recurringBookingUidFromLookup(booking);
  if (!recurringUid) return null;

  const series = await getBooking(recurringUid);
  const seriesBookings = Array.isArray(series) ? series : [series];

  return seriesBookings
    .map((item) => ({
      uid: stringOrNull(item.uid || item.bookingUid),
      status: item.status || null
    }))
    .filter((item): item is { uid: string; status: string | null } => Boolean(item.uid));
}

export async function updateBookingLocation(bookingUid: string, brandedUrl: string) {
  const response = await fetch(
    `${CAL_API_BASE}/bookings/${encodeURIComponent(bookingUid)}/location`,
    {
      method: "PATCH",
      headers: {
        Authorization: `Bearer ${requireEnv("CAL_API_KEY")}`,
        "Content-Type": "application/json",
        "cal-api-version": CAL_API_VERSION
      },
      body: JSON.stringify({
        location: {
          type: "link",
          link: brandedUrl
        }
      })
    }
  );

  if (!response.ok) {
    const body = await response.text();
    throw new Error(`Cal.com API ${response.status}: ${body}`);
  }

  return response.json() as Promise<unknown>;
}

async function getBooking(bookingUid: string) {
  const response = await fetch(`${CAL_API_BASE}/bookings/${encodeURIComponent(bookingUid)}`, {
    headers: {
      Authorization: `Bearer ${requireEnv("CAL_API_KEY")}`,
      "cal-api-version": CAL_LATEST_API_VERSION
    }
  });

  if (!response.ok) {
    const body = await response.text();
    throw new Error(`Cal.com get booking API ${response.status}: ${body}`);
  }

  const json = (await response.json()) as CalApiResponse<CalBookingLookup | CalBookingLookup[]>;
  return json.data;
}

function recurringBookingUidFromLookup(booking: CalBookingLookup | CalBookingLookup[]) {
  const first = Array.isArray(booking) ? booking[0] : booking;
  return stringOrNull(first?.recurringBookingUid || first?.recurring_booking_uid);
}

function isCancelledBooking(booking: CalBookingLookup) {
  return typeof booking.status === "string" && /cancel/i.test(booking.status);
}

function stringOrNull(value: unknown): string | null {
  if (typeof value === "string" && value.length > 0) return value;
  if (typeof value === "number") return String(value);
  return null;
}

export async function confirmBooking(bookingUid: string) {
  const response = await fetch(
    `${CAL_API_BASE}/bookings/${encodeURIComponent(bookingUid)}/confirm`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${requireEnv("CAL_API_KEY")}`,
        "cal-api-version": CAL_LATEST_API_VERSION
      }
    }
  );

  if (!response.ok) {
    const body = await response.text();
    throw new Error(`Cal.com confirm API ${response.status}: ${body}`);
  }

  return response.json() as Promise<unknown>;
}

export async function syncBookingCalendarEvent(params: {
  bookingUid: string;
  roomUrl: string;
  title?: string | null;
  description?: string | null;
  startsAt?: string | null;
  endsAt?: string | null;
  timeZone?: string | null;
}) {
  const references = await getBookingReferencesWithRetry(params.bookingUid);
  const calendarReferences = references.filter(
    (reference) => reference.eventUid && reference.type.includes("calendar")
  );

  const results = [];

  for (const reference of calendarReferences) {
    const calendar = calendarProvider(reference.type);
    if (!calendar || !reference.eventUid) continue;

    const existing = await getCalendarEvent(calendar, reference.eventUid);
    const patchedDescription = meetingDescription({
      existingDescription: existing.description || params.description || "",
      roomUrl: params.roomUrl
    });

    const body = {
      start: existing.start || datePayload(params.startsAt, params.timeZone),
      end: existing.end || datePayload(params.endsAt, params.timeZone),
      title: existing.title || params.title || "RM Tutoring session",
      description: patchedDescription,
      attendees: existing.attendees || null,
      status: existing.status || "accepted",
      locations: [
        {
          type: "video",
          url: params.roomUrl,
          label: "RM Tutoring Video"
        }
      ],
      location: params.roomUrl
    };

    try {
      results.push(await updateCalendarEvent(calendar, reference.eventUid, body));
    } catch (error) {
      const fallbackBody = {
        start: body.start,
        end: body.end,
        title: body.title,
        description: patchedDescription,
        attendees: body.attendees,
        status: body.status
      };

      results.push(await updateCalendarEvent(calendar, reference.eventUid, fallbackBody));

      if (error instanceof Error) {
        results.push({
          warning: "Calendar provider rejected explicit location fields; description was patched.",
          error: error.message
        });
      }
    }
  }

  return {
    references,
    results
  };
}

async function getBookingReferencesWithRetry(bookingUid: string) {
  let lastError: unknown;

  for (let attempt = 0; attempt < 4; attempt += 1) {
    try {
      const references = await getBookingReferences(bookingUid);
      if (references.length > 0) return references;
    } catch (error) {
      lastError = error;
    }

    await new Promise((resolve) => setTimeout(resolve, 750 * (attempt + 1)));
  }

  if (lastError) throw lastError;
  return [];
}

async function getBookingReferences(bookingUid: string) {
  const response = await fetch(
    `${CAL_API_BASE}/bookings/${encodeURIComponent(bookingUid)}/references`,
    {
      headers: {
        Authorization: `Bearer ${requireEnv("CAL_API_KEY")}`,
        "cal-api-version": CAL_LATEST_API_VERSION
      }
    }
  );

  if (!response.ok) {
    const body = await response.text();
    throw new Error(`Cal.com references API ${response.status}: ${body}`);
  }

  const json = (await response.json()) as CalApiResponse<BookingReference[]>;
  return json.data || [];
}

async function getCalendarEvent(calendar: "google", eventUid: string) {
  const response = await fetch(
    `${CAL_API_BASE}/calendars/${calendar}/event/${encodeURIComponent(eventUid)}`,
    {
      headers: {
        Authorization: `Bearer ${requireEnv("CAL_API_KEY")}`
      }
    }
  );

  if (!response.ok) {
    const body = await response.text();
    throw new Error(`Cal.com calendar get API ${response.status}: ${body}`);
  }

  const json = (await response.json()) as CalApiResponse<CalendarEvent>;
  return json.data || {};
}

async function updateCalendarEvent(
  calendar: "google",
  eventUid: string,
  body: Record<string, unknown>
) {
  const response = await fetch(
    `${CAL_API_BASE}/calendars/${calendar}/events/${encodeURIComponent(eventUid)}`,
    {
      method: "PATCH",
      headers: {
        Authorization: `Bearer ${requireEnv("CAL_API_KEY")}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify(body)
    }
  );

  if (!response.ok) {
    const responseBody = await response.text();
    throw new Error(`Cal.com calendar patch API ${response.status}: ${responseBody}`);
  }

  return response.json() as Promise<unknown>;
}

function calendarProvider(type: string) {
  if (type === "google_calendar") return "google";
  return null;
}

function meetingDescription({
  existingDescription,
  roomUrl
}: {
  existingDescription: string;
  roomUrl: string;
}) {
  const clean = existingDescription.replace(
    /^RM Tutoring Video Room:\s*https:\/\/video\.rmtutoringservices\.com\/\S+\s*/m,
    ""
  ).trim();

  const linkBlock = `RM Tutoring Video Room: ${roomUrl}`;

  return clean ? `${linkBlock}\n\n${clean}` : linkBlock;
}

function datePayload(value?: string | null, timeZone?: string | null) {
  if (!value) return undefined;

  return {
    time: value,
    timeZone: timeZone || "America/Edmonton"
  };
}
