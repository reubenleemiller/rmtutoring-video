# RM Tutoring Video

Custom Cal.com video meeting-location service for `https://your-conferencing-software.com`.
It creates one Daily room per concrete Cal.com booking occurrence, stores the room
lifecycle in Supabase, shows attendees a branded Cal Video-style UI, records via
Daily cloud recording, and deletes rooms after cancellation, reschedule, or the
admin ending the meeting.

## How It Works

1. Cal.com sends booking webhooks to `/api/cal/webhook`.
2. The app creates a deterministic Daily room for that booking occurrence.
3. The app stores the mapping in Supabase `public.video_rooms`.
4. The app patches the Cal.com booking location to:

   ```text
   https://your-conferencing-software.com/<room-name>
   ```

5. Attendees join on your branded domain. Daily powers the embedded call, but
   the attendee-facing URL is not `rmtutoring.daily.co`; generated rooms are
   private and joined with short-lived meeting tokens.
6. Rooms are deleted immediately for cancellations/reschedules and when the
   admin clicks End meeting. Scheduled end time does not close the room, so
   overtime sessions can continue.
7. Completed recordings stay downloadable for 30 days after Daily reports them
   ready, then the scheduled cleanup function deletes the Daily recording files.

## Install

```bash
npm install
cp .env.example .env.local
```

Fill in `.env.local`:

```bash
NEXT_PUBLIC_APP_URL=https://your-conferencing-software.com
NEXT_PUBLIC_SUPABASE_URL=https://your-project-ref.supabase.co
NEXT_PUBLIC_DASHBOARD_SUPABASE_URL=https://your-dashboard-project-ref.supabase.co
NEXT_PUBLIC_DASHBOARD_SUPABASE_ANON_KEY=your_dashboard_anon_or_publishable_key
NEXT_PUBLIC_STUDENT_DASHBOARD_URL=https://dashboard.rmtutoringservices.com

DAILY_API_KEY=your_daily_api_key
DAILY_WEBHOOK_HMAC=base64_encoded_daily_webhook_hmac
CAL_API_KEY=cal_live_or_cal_test_key
CAL_WEBHOOK_SECRET=choose_a_long_random_secret
CRON_SECRET=choose_a_second_long_random_secret
SUPABASE_SERVICE_ROLE_KEY=your_server_only_service_role_key
DASHBOARD_SUPABASE_URL=https://your-dashboard-project-ref.supabase.co
DASHBOARD_SUPABASE_SERVICE_ROLE_KEY=your_dashboard_server_only_service_role_key
DAILY_DEMO_ROOM_URL=demo_room_url_here

SEND_ROOM_EMAILS=true
RESEND_API_KEY=your_resend_api_key
ROOM_EMAIL_FROM=Name Here <>
ROOM_EMAIL_REPLY_TO=Email Here

ROOM_PREFIX=random-here
ROOM_JOIN_ANYTIME=true
ROOM_OPEN_MINUTES_BEFORE=random-here
ROOM_MAX_PARTICIPANTS=random-here
DAILY_MEETING_TOKEN_TTL_HOURS=720
```

## Supabase Setup

Create a Supabase project, then run these migrations in the SQL editor:

```text
supabase/migrations/0001_video_rooms.sql
supabase/migrations/0002_custom_room_emails.sql
supabase/migrations/0003_calendar_event_sync.sql
supabase/migrations/0004_email_group_dedupe.sql
supabase/migrations/0005_room_reminders.sql
supabase/migrations/0006_backfill_booking_ids.sql
supabase/migrations/0007_backfill_recurring_series_ids.sql
supabase/migrations/0008_recording_retention.sql
```

The video database table has RLS enabled and no public policies. The app uses
the server-only `SUPABASE_SERVICE_ROLE_KEY` for video room state, so do not
expose that key in browser code or any `NEXT_PUBLIC_` variable.

This site also talks to the separate student dashboard Supabase project for
login and role checks:

- browser sign-in uses `NEXT_PUBLIC_DASHBOARD_SUPABASE_URL` and
  `NEXT_PUBLIC_DASHBOARD_SUPABASE_ANON_KEY`
- server-side token validation and `profiles.role` checks use
  `DASHBOARD_SUPABASE_URL` and `DASHBOARD_SUPABASE_SERVICE_ROLE_KEY`
- only dashboard users with `public.profiles.role = 'admin'` receive Daily owner
  meeting tokens with recording controls

## Daily Setup

1. In Daily, keep using your existing `rmtutoring.daily.co` domain.
2. Create a Daily API key.
3. Set `DAILY_API_KEY` in Netlify and local `.env.local`.
4. Make sure your Daily plan supports cloud recording.
5. Create a Daily webhook for recording availability:

   ```text
   URL: https://video.rmtutoringservices.com/api/daily/webhook
   Event types:
   - recording.ready-to-download
   ```

   Daily returns an `hmac` value for the webhook. Set that base64 value as
   `DAILY_WEBHOOK_HMAC` in Netlify. If this env var is not set, the endpoint
   still accepts events, but signature verification is skipped.

Daily room settings created by this app:

- private room access with long-lived meeting tokens
- cloud recording available only through admin meeting tokens
- prejoin UI enabled
- chat and people UI enabled
- screen sharing enabled
- room can be joined immediately when `ROOM_JOIN_ANYTIME=true`
- generated rooms do not expire at the scheduled booking end time
- Daily room expiration is configured not to eject participants
- room is explicitly deleted through cancellation/reschedule webhooks or when
  the admin clicks End meeting
- Daily recording files are deleted after `video_rooms.recording_delete_after`,
  which is set to 30 days after the recording-ready webhook

The public demo room at `/rmt_demo` uses `DAILY_DEMO_ROOM_URL`, requires no
student dashboard login, and receives a non-owner meeting token with recording
controls disabled.

## Cal.com Setup

In Cal.com, create a webhook:

```text
Subscriber URL: https://your-conferencing-software.com/api/cal/webhook
Secret: same value as CAL_WEBHOOK_SECRET
Events:
- Booking Requested
- Booking Created
- Booking Rescheduled
- Booking Cancelled
- Booking Rejected
- Meeting Ended
- Recording Ready
```

Use a Cal.com API key with booking write access as `CAL_API_KEY`.

For event type locations, use a link/custom location rather than Cal Video. The
webhook will patch each accepted booking to the branded per-occurrence URL.

Important Cal.com timing note: for the final room URL to appear in the first
calendar invite, set each Cal.com event type to require confirmation. The app
handles `BOOKING_REQUESTED`, creates the Daily room, patches the booking
location, and then calls Cal.com's confirm-booking API. If confirmation is off,
Cal.com may create the external calendar event before the webhook patch runs,
leaving the calendar invite with the generic URL.

## Branded Room Link Emails

Cal.com can send request/confirmation emails before webhook-patched locations
are reflected in the email body. To avoid misleading attendees, this app can
send its own branded room-link email immediately after it creates the room.

Use Resend for this:

1. Verify `rmtutoringservices.com` in Resend.
2. Create a Resend API key.
3. Set `SEND_ROOM_EMAILS=true`.
4. Set `RESEND_API_KEY`, `ROOM_EMAIL_FROM`, and optionally
   `ROOM_EMAIL_REPLY_TO` in Netlify.
5. Consider disabling or simplifying Cal.com's built-in request email if it
   shows the generic event location.

The custom email uses the RM Tutoring logo and a `#80AF5C` join button.
For recurring events, the app sends one compiled email with every session time
and room link. If Cal sends one occurrence per webhook, the app waits until all
expected recurring rooms have been created, then sends the single compiled email.
Per-room database state prevents duplicate sends when Cal retries the same
webhook.
Room deletion and reminder state stay keyed by Cal booking/recurring IDs so
unrelated bookings are not deleted or reminded together. Email times are rendered
in the attendee timezone from Cal's payload, falling back to organizer timezone.

The app also sends per-room reminder emails during the 24 hours before each
session starts. This is intentionally per occurrence so recurring students get
the correct room link for the upcoming session without receiving every future
link again. Netlify runs `netlify/functions/reminders.ts` hourly, and you can
manually trigger the same job:

```bash
curl -X POST \
  -H "Authorization: Bearer $CRON_SECRET" \
  https://your-conferencing-software.com/api/admin/reminders
```

## Calendar Event Sync

Cal.com's booking-location patch updates the Cal.com booking but may not update
the already-created Google Calendar event. This app also syncs the generated room
URL into the actual Google Calendar event after Cal creates it:

- finds Cal booking references with `GET /v2/bookings/{bookingUid}/references`
- retrieves the Google event through Cal Unified Calendars
- patches the calendar event description/body with the room URL
- attempts to patch the event location/locations to the same room URL
- stores success/error details on `video_rooms.calendar_sync_*`

If Cal rejects explicit location fields for a provider, the app still patches the
event body and records the provider response in Supabase. For the cleanest
calendar invite, keep Cal event types on **Requires confirmation** so this sync
runs immediately after auto-confirmation.

## Netlify Deploy

This repo is ready for Netlify:

- `netlify.toml` builds with `npm run build`
- Next.js API routes deploy as Netlify Functions
- `netlify/functions/cleanup.ts` runs hourly
- publish directory is `.next`

Deploy steps:

1. Push this repo to GitHub.
2. Create a Netlify site from the repo.
3. Set build command to `npm run build` and publish directory to `.next`
   if Netlify does not auto-detect them.
4. Add all environment variables from `.env.example` in Netlify Site settings.
5. Add the custom domain `video.rmtutoringservices.com`.
6. Point DNS to Netlify as instructed in the Netlify domain setup screen.
7. Wait for HTTPS provisioning.
8. Add the Cal.com webhook URL after the Netlify production deploy is live.

Manual cleanup endpoint:

```bash
curl -X POST \
  -H "Authorization: Bearer $CRON_SECRET" \
  https://your-conferencing-software.com/api/admin/cleanup
```

## Local Development

```bash
npm run dev
```

Open:

```text
http://localhost:3000
```

Use a webhook tunnel such as the Netlify CLI, ngrok, or Cloudflare Tunnel when
testing real Cal.com webhooks locally.

## Verify

```bash
npm run lint
npm run build
```

## Daily Domain Masking

The public meeting link and UI are branded as `https://your-conferencing-software.com`.
The raw Daily room link is not shown in the interface. Daily still runs the call,
so a technical user can discover `rmtutoring.daily.co` in browser developer tools
or network traffic. Fully eliminating that requires Daily-supported custom
domain/proxy capabilities, not just an app-level route.
