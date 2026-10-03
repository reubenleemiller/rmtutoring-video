import { appUrl, booleanEnv, requireEnv } from "./env";
import { bookingTimeZone, CalBooking, isRecord } from "./booking";

const BRAND_COLOR = "#80AF5C";
const LOGO_URL = "https://www.rmtutoringservices.com/assets/logo.png";

type RoomEmail = {
  booking: CalBooking;
  roomUrl: string;
  pending: boolean;
};

type RoomEmailDigest = {
  booking: CalBooking;
  rooms: Array<{
    startsAt: string | null;
    endsAt: string | null;
    roomUrl: string;
  }>;
  pending: boolean;
};

type RecurringInitialEmail = {
  booking: CalBooking;
  pending: boolean;
};

export type EmailSendResult =
  | { sent: true }
  | { sent: false; reason: string };

export async function sendRoomEmail({ booking, roomUrl, pending }: RoomEmail) {
  if (!booleanEnv("SEND_ROOM_EMAILS", false)) {
    return { sent: false, reason: "SEND_ROOM_EMAILS is not enabled" } satisfies EmailSendResult;
  }

  const attendee = primaryAttendee(booking);
  if (!attendee.email) {
    return { sent: false, reason: "Booking payload does not include an attendee email" } satisfies EmailSendResult;
  }

  const subject = pending
    ? "Your RM Tutoring video room link"
    : "Your RM Tutoring session link";
  const timeZone = bookingTimeZone(booking);
  const when = formatBookingWindow(booking, timeZone);
  const title = stringOrNull(booking.eventTitle || booking.title) || "RM Tutoring session";
  const statusText = pending
    ? "Your booking request has been received. This is the video room link associated with your requested session."
    : "Your booking is confirmed. This is the video room link for your session.";

  const response = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${requireEnv("RESEND_API_KEY")}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      from: requireEnv("ROOM_EMAIL_FROM"),
      to: [attendee.email],
      reply_to: process.env.ROOM_EMAIL_REPLY_TO || undefined,
      subject,
      html: roomEmailHtml({
        attendeeName: attendee.name,
        roomUrl,
        statusText,
        title,
        when
      }),
      text: [
        statusText,
        "",
        title,
        when ? `When: ${when}` : null,
        "",
        `Join here: ${roomUrl}`
      ]
        .filter(Boolean)
        .join("\n")
    })
  });

  if (!response.ok) {
    const body = await response.text();
    throw new Error(`Resend API ${response.status}: ${body}`);
  }

  return { sent: true } satisfies EmailSendResult;
}

export async function sendRecurringInitialEmail({ booking, pending }: RecurringInitialEmail) {
  if (!booleanEnv("SEND_ROOM_EMAILS", false)) {
    return { sent: false, reason: "SEND_ROOM_EMAILS is not enabled" } satisfies EmailSendResult;
  }

  const attendee = primaryAttendee(booking);
  if (!attendee.email) {
    return { sent: false, reason: "Booking payload does not include an attendee email" } satisfies EmailSendResult;
  }

  const title = stringOrNull(booking.eventTitle || booking.title) || "RM Tutoring recurring sessions";
  const statusText = pending
    ? "Your recurring booking request has been received. Each session gets its own video room link, and the correct link will be emailed before that session starts."
    : "Your recurring booking is confirmed. Each session gets its own video room link, and the correct link will be emailed before that session starts.";

  const response = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${requireEnv("RESEND_API_KEY")}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      from: requireEnv("ROOM_EMAIL_FROM"),
      to: [attendee.email],
      reply_to: process.env.ROOM_EMAIL_REPLY_TO || undefined,
      subject: "Your RM Tutoring recurring sessions",
      html: recurringInitialEmailHtml({
        attendeeName: attendee.name,
        statusText,
        title
      }),
      text: [
        statusText,
        "",
        title,
        "",
        `Video rooms are hosted at ${appUrl()}. You will receive the exact room link before each session.`
      ].join("\n")
    })
  });

  if (!response.ok) {
    const body = await response.text();
    throw new Error(`Resend API ${response.status}: ${body}`);
  }

  return { sent: true } satisfies EmailSendResult;
}

export async function sendRoomEmailDigest({ booking, rooms, pending }: RoomEmailDigest) {
  if (!booleanEnv("SEND_ROOM_EMAILS", false)) {
    return { sent: false, reason: "SEND_ROOM_EMAILS is not enabled" } satisfies EmailSendResult;
  }
  if (rooms.length === 0) {
    return { sent: false, reason: "No rooms were provided for the email digest" } satisfies EmailSendResult;
  }

  const attendee = primaryAttendee(booking);
  if (!attendee.email) {
    return { sent: false, reason: "Booking payload does not include an attendee email" } satisfies EmailSendResult;
  }

  const title = stringOrNull(booking.eventTitle || booking.title) || "RM Tutoring sessions";
  const statusText = pending
    ? "Your recurring booking request has been received. These are the video room links associated with each requested session."
    : "Your recurring booking is confirmed. These are the video room links for each session.";

  const response = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${requireEnv("RESEND_API_KEY")}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      from: requireEnv("ROOM_EMAIL_FROM"),
      to: [attendee.email],
      reply_to: process.env.ROOM_EMAIL_REPLY_TO || undefined,
      subject: "Your RM Tutoring recurring session links",
      html: roomEmailDigestHtml({
        attendeeName: attendee.name,
        rooms,
        statusText,
        title,
        timeZone: bookingTimeZone(booking)
      }),
      text: [
        statusText,
        "",
        title,
        "",
        ...rooms.map((room) => `${formatWindow(room.startsAt, room.endsAt, bookingTimeZone(booking)) || "Session"}: ${room.roomUrl}`)
      ].join("\n")
    })
  });

  if (!response.ok) {
    const body = await response.text();
    throw new Error(`Resend API ${response.status}: ${body}`);
  }

  return { sent: true } satisfies EmailSendResult;
}

function recurringInitialEmailHtml({
  attendeeName,
  statusText,
  title
}: {
  attendeeName: string | null;
  statusText: string;
  title: string;
}) {
  return `<!doctype html>
<html>
  <body style="margin:0;background:#f6f8f4;color:#20251d;font-family:Arial,Helvetica,sans-serif;">
    <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background:#f6f8f4;padding:28px 12px;">
      <tr>
        <td align="center">
          <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="max-width:560px;background:#ffffff;border:1px solid #dde6d6;border-radius:8px;overflow:hidden;">
            <tr>
              <td style="padding:28px;">
                <img src="${LOGO_URL}" width="168" alt="RM Tutoring Services" style="display:block;max-width:168px;height:auto;margin:0 0 24px;" />
                <h1 style="margin:0 0 12px;font-size:26px;line-height:1.2;color:#172015;">Your recurring sessions are booked</h1>
                <p style="margin:0 0 18px;font-size:16px;line-height:1.55;color:#4c5847;">${escapeHtml(greeting(attendeeName))}${escapeHtml(statusText)}</p>
                <p style="margin:0 0 18px;font-size:14px;line-height:1.45;color:#4c5847;"><strong>${escapeHtml(title)}</strong></p>
                <p style="margin:18px 0 0;font-size:13px;line-height:1.5;color:#6d7668;">Video rooms are hosted at <a href="${appUrl()}" style="color:${BRAND_COLOR};">${appUrl()}</a>. You will receive the exact room link before each session.</p>
              </td>
            </tr>
          </table>
        </td>
      </tr>
    </table>
  </body>
</html>`;
}

function roomEmailHtml({
  attendeeName,
  roomUrl,
  statusText,
  title,
  when
}: {
  attendeeName: string | null;
  roomUrl: string;
  statusText: string;
  title: string;
  when: string | null;
}) {
  return `<!doctype html>
<html>
  <body style="margin:0;background:#f6f8f4;color:#20251d;font-family:Arial,Helvetica,sans-serif;">
    <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background:#f6f8f4;padding:28px 12px;">
      <tr>
        <td align="center">
          <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="max-width:560px;background:#ffffff;border:1px solid #dde6d6;border-radius:8px;overflow:hidden;">
            <tr>
              <td style="padding:28px 28px 16px;">
                <img src="${LOGO_URL}" width="168" alt="RM Tutoring Services" style="display:block;max-width:168px;height:auto;margin:0 0 24px;" />
                <h1 style="margin:0 0 12px;font-size:26px;line-height:1.2;color:#172015;">Your video room is ready</h1>
                <p style="margin:0 0 18px;font-size:16px;line-height:1.55;color:#4c5847;">${escapeHtml(greeting(attendeeName))}${escapeHtml(statusText)}</p>
                <table role="presentation" cellspacing="0" cellpadding="0" style="margin:24px 0;">
                  <tr>
                    <td style="border-radius:8px;background:${BRAND_COLOR};">
                      <a href="${roomUrl}" style="display:inline-block;padding:13px 20px;color:#ffffff;text-decoration:none;font-weight:700;font-size:15px;">Join video room</a>
                    </td>
                  </tr>
                </table>
                <p style="margin:0 0 6px;font-size:14px;line-height:1.45;color:#4c5847;"><strong>${escapeHtml(title)}</strong></p>
                ${when ? `<p style="margin:0 0 18px;font-size:14px;line-height:1.45;color:#4c5847;">${escapeHtml(when)}</p>` : ""}
                <p style="margin:18px 0 0;font-size:13px;line-height:1.5;color:#6d7668;">If the button does not work, paste this link into your browser:<br /><a href="${roomUrl}" style="color:${BRAND_COLOR};word-break:break-all;">${roomUrl}</a></p>
              </td>
            </tr>
          </table>
        </td>
      </tr>
    </table>
  </body>
</html>`;
}

function roomEmailDigestHtml({
  attendeeName,
  rooms,
  statusText,
  title,
  timeZone
}: {
  attendeeName: string | null;
  rooms: RoomEmailDigest["rooms"];
  statusText: string;
  title: string;
  timeZone: string | null;
}) {
  const rows = rooms
    .map((room) => {
      const when = formatWindow(room.startsAt, room.endsAt, timeZone) || "Session";
      return `<tr>
        <td colspan="2" style="padding:14px 0;border-top:1px solid #dde6d6;">
          <p style="margin:0 0 10px;font-size:14px;line-height:1.45;color:#4c5847;"><strong>${escapeHtml(when)}</strong></p>
          <a href="${room.roomUrl}" style="display:inline-block;border-radius:8px;background:${BRAND_COLOR};padding:10px 14px;color:#ffffff;text-decoration:none;font-weight:700;font-size:14px;">Join video room</a>
          <p style="margin:10px 0 0;font-size:13px;line-height:1.5;color:#6d7668;">If the button does not work, paste this link into your browser:<br /><a href="${room.roomUrl}" style="color:${BRAND_COLOR};word-break:break-all;">${room.roomUrl}</a></p>
        </td>
      </tr>`;
    })
    .join("");

  return `<!doctype html>
<html>
  <body style="margin:0;background:#f6f8f4;color:#20251d;font-family:Arial,Helvetica,sans-serif;">
    <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background:#f6f8f4;padding:28px 12px;">
      <tr>
        <td align="center">
          <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="max-width:640px;background:#ffffff;border:1px solid #dde6d6;border-radius:8px;overflow:hidden;">
            <tr>
              <td style="padding:28px;">
                <img src="${LOGO_URL}" width="168" alt="RM Tutoring Services" style="display:block;max-width:168px;height:auto;margin:0 0 24px;" />
                <h1 style="margin:0 0 12px;font-size:26px;line-height:1.2;color:#172015;">Your recurring video rooms are ready</h1>
                <p style="margin:0 0 18px;font-size:16px;line-height:1.55;color:#4c5847;">${escapeHtml(greeting(attendeeName))}${escapeHtml(statusText)}</p>
                <p style="margin:0 0 18px;font-size:14px;line-height:1.45;color:#4c5847;"><strong>${escapeHtml(title)}</strong></p>
                <table role="presentation" width="100%" cellspacing="0" cellpadding="0">${rows}</table>
              </td>
            </tr>
          </table>
        </td>
      </tr>
    </table>
  </body>
</html>`;
}

function primaryAttendee(booking: CalBooking) {
  const attendees = booking.attendees;
  if (Array.isArray(attendees)) {
    const first = attendees.find(isRecord);
    if (first) {
      return {
        email: stringOrNull(first.email),
        name: stringOrNull(first.name) || [first.firstName, first.lastName].filter(Boolean).join(" ")
      };
    }
  }

  const attendee = booking.attendee;
  if (isRecord(attendee)) {
    return {
      email: stringOrNull(attendee.email),
      name: stringOrNull(attendee.name)
    };
  }

  return {
    email: stringOrNull(booking.email),
    name: stringOrNull(booking.name)
  };
}

function formatBookingWindow(booking: CalBooking, timeZone: string | null) {
  const start = stringOrNull(booking.startTime || booking.start);
  const end = stringOrNull(booking.endTime || booking.end);
  return formatWindow(start, end, timeZone);
}

function formatWindow(start: string | null, end: string | null, timeZone: string | null) {
  if (!start) return null;

  const startDate = new Date(start);
  const endDate = end ? new Date(end) : null;
  const date = new Intl.DateTimeFormat("en", {
    weekday: "long",
    month: "long",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
    timeZoneName: "short",
    ...(timeZone ? { timeZone } : {})
  }).format(startDate);

  if (!endDate) return date;

  const endTime = new Intl.DateTimeFormat("en", {
    hour: "numeric",
    minute: "2-digit",
    timeZoneName: "short",
    ...(timeZone ? { timeZone } : {})
  }).format(endDate);

  return `${date} - ${endTime}`;
}

function greeting(name: string | null) {
  return name ? `Hi ${name}, ` : "";
}

function stringOrNull(value: unknown): string | null {
  if (typeof value === "string" && value.length > 0) return value;
  if (typeof value === "number") return String(value);
  return null;
}

function escapeHtml(value: string) {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}
