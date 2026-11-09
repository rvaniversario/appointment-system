/**
 * iCalendar (RFC 5545) files attached to booking emails, so a client can add the
 * consultation to their calendar. Every version of one booking shares a UID, and a higher
 * SEQUENCE tells calendar apps to replace the earlier copy.
 */

export interface CalendarEvent {
  /** The appointment id. */
  uid: string;
  /** Increases with each change to the booking (we use the change time in seconds). */
  sequence: number;
  startsAt: Date;
  endsAt: Date;
  summary: string;
  description: string;
  location?: string | null;
  url?: string | null;
  organizerName: string;
  organizerEmail: string;
  canceled?: boolean;
}

const stamp = (d: Date) => d.toISOString().replace(/[-:]/g, "").replace(/\.\d{3}/, "");

/** Escapes text values: backslash, semicolon, comma and line breaks. */
export function escapeText(value: string): string {
  return value.replace(/\\/g, "\\\\").replace(/;/g, "\\;").replace(/,/g, "\\,").replace(/\r?\n/g, "\\n");
}

/** Lines longer than 75 octets continue on the next line after a space. */
export function foldLine(line: string): string {
  const bytes = Buffer.from(line, "utf8");
  if (bytes.length <= 75) return line;
  const parts: string[] = [];
  let current = "";
  let size = 0;
  for (const ch of line) {
    const n = Buffer.byteLength(ch, "utf8");
    // The first line holds 75 octets; continuation lines hold 74 after their leading space.
    if (size + n > (parts.length ? 74 : 75)) {
      parts.push(current);
      current = "";
      size = 0;
    }
    current += ch;
    size += n;
  }
  parts.push(current);
  return parts.join("\r\n ");
}

const cleanName = (name: string) => name.replace(/["\r\n:;]/g, "").trim();

export function buildIcs(event: CalendarEvent, now = new Date()): string {
  const lines = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//Consult Booking//Appointments//EN",
    "CALSCALE:GREGORIAN",
    `METHOD:${event.canceled ? "CANCEL" : "PUBLISH"}`,
    "BEGIN:VEVENT",
    `UID:${event.uid}@consult-booking`,
    `SEQUENCE:${event.sequence}`,
    `DTSTAMP:${stamp(now)}`,
    `DTSTART:${stamp(event.startsAt)}`,
    `DTEND:${stamp(event.endsAt)}`,
    `SUMMARY:${escapeText(event.summary)}`,
    `DESCRIPTION:${escapeText(event.description)}`,
    ...(event.location ? [`LOCATION:${escapeText(event.location)}`] : []),
    ...(event.url ? [`URL:${event.url}`] : []),
    `ORGANIZER;CN="${cleanName(event.organizerName)}":mailto:${event.organizerEmail}`,
    `STATUS:${event.canceled ? "CANCELLED" : "CONFIRMED"}`,
    "END:VEVENT",
    "END:VCALENDAR",
  ];
  return lines.map(foldLine).join("\r\n") + "\r\n";
}
