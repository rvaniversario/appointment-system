import { NextResponse, type NextRequest } from "next/server";
import { getConfirmedBooking } from "@/lib/booking/confirmed";
import { getPublicFirm } from "@/lib/booking/queries";
import { PLATFORM } from "@/lib/brand";

/** Text values in iCalendar escape backslashes, commas, semicolons and newlines. */
const escape = (value: string) => value.replace(/\\/g, "\\\\").replace(/([,;])/g, "\\$1").replace(/\r?\n/g, "\\n");

/** 2026-11-09T01:00:00.000Z → 20261109T010000Z */
const icsTime = (iso: string) => new Date(iso).toISOString().replace(/[-:]/g, "").replace(/\.\d{3}/, "");

/** The visitor's confirmed consultation as a calendar file. */
export async function GET(request: NextRequest, ctx: RouteContext<"/f/[firmSlug]/booking.ics">) {
  const { firmSlug } = await ctx.params;
  const firm = await getPublicFirm(firmSlug);
  const booking = firm ? await getConfirmedBooking(firm.id) : null;
  if (!firm || !booking) return new NextResponse("Not found", { status: 404 });

  const location = booking.mode === "video" ? booking.meetingUrl : booking.mode === "in_person" ? booking.officeAddress : "Phone call";
  const lines = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    `PRODID:-//${PLATFORM.name}//EN`,
    "CALSCALE:GREGORIAN",
    "METHOD:PUBLISH",
    "BEGIN:VEVENT",
    `UID:${booking.id}@${new URL(request.url).hostname}`,
    `DTSTAMP:${icsTime(new Date().toISOString())}`,
    `DTSTART:${icsTime(booking.startsAt)}`,
    `DTEND:${icsTime(booking.endsAt)}`,
    `SUMMARY:${escape(`${booking.consultTypeLabel} with ${booking.attorneyName}`)}`,
    `DESCRIPTION:${escape(`Consultation with ${booking.attorneyName} of ${firm.name}.`)}`,
    ...(location ? [`LOCATION:${escape(location)}`] : []),
    "END:VEVENT",
    "END:VCALENDAR",
  ];

  return new NextResponse(lines.join("\r\n") + "\r\n", {
    headers: {
      "Content-Type": "text/calendar; charset=utf-8",
      "Content-Disposition": `attachment; filename="consultation.ics"`,
      "Cache-Control": "private, no-store",
    },
  });
}
