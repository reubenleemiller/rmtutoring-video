import { createHash } from "crypto";

import { appUrl, roomPrefix } from "./env";

export type CalBooking = Record<string, unknown>;

export function webhookEventName(body: Record<string, unknown>): string {
  return String(
    body.triggerEvent ||
      body.event ||
      body.type ||
      body.eventType ||
      body.name ||
      ""
  ).toUpperCase();
}

export function payloadOf(body: Record<string, unknown>): Record<string, unknown> {
  const payload = body.payload;
  return isRecord(payload) ? payload : body;
}

export function bookingsFromPayload(payload: Record<string, unknown>): CalBooking[] {
  const nestedBookings = payload.bookings;
  const cancelledBookings = payload.cancelledBookings || payload.cancelled_bookings;
  const booking = payload.booking;
  const data = payload.data;

  if (Array.isArray(nestedBookings)) return nestedBookings.filter(isRecord);
  if (Array.isArray(cancelledBookings)) return cancelledBookings.filter(isRecord);
  if (isRecord(booking)) return [booking];
  if (Array.isArray(data)) return data.filter(isRecord);
  if (isRecord(data)) return [data];

  return [payload];
}

export function bookingUid(booking: CalBooking): string {
  return String(booking.uid || booking.bookingUid || booking.id || "");
}

export function bookingId(booking: CalBooking): string | null {
  return stringOrNull(booking.bookingId || booking.id);
}

export function bookingStart(booking: CalBooking): string | null {
  return stringOrNull(booking.start || booking.startTime || booking.start_at);
}

export function bookingEnd(booking: CalBooking): string | null {
  return stringOrNull(booking.end || booking.endTime || booking.end_at);
}

export function deleteAfter(): string | null {
  return null;
}

export function rescheduledFromUid(booking: CalBooking): string | null {
  return stringOrNull(booking.rescheduledFromUid || booking.rescheduled_from_uid);
}

export function recurringEventId(booking: CalBooking): string | null {
  const existingRecurringEvent = booking.existingRecurringEvent;
  if (isRecord(existingRecurringEvent)) {
    const id = stringOrNull(existingRecurringEvent.recurringEventId || existingRecurringEvent.id);
    if (id) return id;
  }

  const recurringEvent = booking.recurringEvent;
  if (isRecord(recurringEvent)) {
    const id = stringOrNull(recurringEvent.recurringEventId || recurringEvent.id);
    if (id) return id;
  }

  return stringOrNull(
    booking.recurringEventId ||
      booking.recurring_event_id ||
      booking.recurringId ||
      booking.recurring_id ||
      booking.recurringBookingUid ||
      booking.recurring_booking_uid ||
      booking.recurringBookingId ||
      booking.recurring_booking_id
  );
}

export function isRecurringBooking(booking: CalBooking): boolean {
  return Boolean(recurringEventId(booking) || isRecord(booking.recurringEvent));
}

export function recurringBookingCount(booking: CalBooking): number | null {
  const existingRecurringEvent = booking.existingRecurringEvent;
  const existingCount = recurringCountFromValue(existingRecurringEvent);
  if (existingCount) return existingCount;

  const recurringEvent = booking.recurringEvent;
  const recurringCount = recurringCountFromValue(recurringEvent);
  if (recurringCount) return recurringCount;

  return numberOrNull(
    booking.recurringCount ||
      booking.recurring_count ||
      booking.recurringEventCount ||
      booking.recurring_event_count ||
      booking.occurrencesCount ||
      booking.occurrences_count
  );
}

export function eventTypeId(booking: CalBooking): string | null {
  const eventType = booking.eventType;
  if (isRecord(eventType)) {
    return stringOrNull(eventType.id);
  }

  return stringOrNull(booking.eventTypeId || booking.event_type_id);
}

export function bookingTitle(booking: CalBooking): string | null {
  return stringOrNull(booking.eventTitle || booking.title);
}

export function bookingDescription(booking: CalBooking): string | null {
  return stringOrNull(booking.description || booking.eventDescription);
}

export function bookingTimeZone(booking: CalBooking): string | null {
  const attendees = booking.attendees;
  if (Array.isArray(attendees)) {
    const first = attendees.find(isRecord);
    if (first) {
      const attendeeTimeZone = stringOrNull(first.timeZone);
      if (attendeeTimeZone) return attendeeTimeZone;
    }
  }

  const organizer = booking.organizer;
  if (isRecord(organizer)) {
    const organizerTimeZone = stringOrNull(organizer.timeZone);
    if (organizerTimeZone) return organizerTimeZone;
  }

  return null;
}

export function initialEmailBurstKey(booking: CalBooking): string {
  const recurringId = recurringEventId(booking);
  if (recurringId) return `recurring:${recurringId}`;

  const id = bookingId(booking);
  if (id) return `booking:${id}`;

  const uid = bookingUid(booking);
  if (uid) return `booking-uid:${uid}`;

  const stableParts = [
    "initial",
    organizerEmail(booking) || "organizer",
    attendeeEmail(booking) || "attendee",
    eventTypeId(booking) || "event",
    bookingTitle(booking) || "session"
  ];

  return createHash("sha256").update(stableParts.join(":").toLowerCase()).digest("hex");
}

export function emailGroupKey(booking: CalBooking): string {
  const recurringId = recurringEventId(booking);
  if (recurringId) return `recurring:${recurringId}`;

  const id = bookingId(booking);
  if (id) return `booking:${id}`;

  const stableParts = ["booking", bookingUid(booking) || "unknown"];

  return createHash("sha256").update(stableParts.join(":")).digest("hex");
}

export function roomNameForBooking(booking: CalBooking): string {
  const uid = bookingUid(booking);
  const start = bookingStart(booking) || new Date().toISOString();
  const stable = createHash("sha256").update(`${uid}:${start}`).digest("hex").slice(0, 12);
  return `${roomPrefix()}_${slugPart(uid)}_${stable}`.slice(0, 128);
}

export function brandedRoomUrl(roomName: string): string {
  return `${appUrl()}/${roomName}`;
}

export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function stringOrNull(value: unknown): string | null {
  if (typeof value === "string" && value.length > 0) return value;
  if (typeof value === "number") return String(value);
  return null;
}

function numberOrNull(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value) && value > 0) return Math.floor(value);
  if (typeof value === "string" && value.length > 0) {
    const parsed = Number(value);
    if (Number.isFinite(parsed) && parsed > 0) return Math.floor(parsed);
  }

  return null;
}

function recurringCountFromValue(value: unknown): number | null {
  if (!isRecord(value)) return null;

  const occurrences = value.occurrences || value.bookings || value.dates;
  if (Array.isArray(occurrences) && occurrences.length > 0) return occurrences.length;

  return numberOrNull(
    value.count ||
      value.numEvents ||
      value.num_events ||
      value.numberOfEvents ||
      value.number_of_events ||
      value.occurrencesCount ||
      value.occurrences_count
  );
}

function attendeeEmail(booking: CalBooking): string | null {
  const attendees = booking.attendees;
  if (Array.isArray(attendees)) {
    const first = attendees.find(isRecord);
    if (first) return stringOrNull(first.email);
  }

  const attendee = booking.attendee;
  if (isRecord(attendee)) return stringOrNull(attendee.email);

  return stringOrNull(booking.email);
}

function organizerEmail(booking: CalBooking): string | null {
  const organizer = booking.organizer;
  if (isRecord(organizer)) return stringOrNull(organizer.email);

  return stringOrNull(booking.organizerEmail);
}

function slugPart(value: string): string {
  return value.replace(/[^A-Za-z0-9_-]/g, "_").slice(0, 48) || "booking";
}
