import { NextResponse, type NextRequest } from "next/server";
import { bookingWindow, getAvailability, getConsultTypes, getPublicFirm, listFirmAttorneys } from "@/lib/booking/queries";

/** How far ahead to look for the first open time. */
const SEARCH_DAYS = 14;

/**
 * Sends the visitor to whichever attorney has the earliest open time for the firm's first
 * consultation type, or back to the directory if nobody is free soon.
 */
export async function GET(request: NextRequest, ctx: RouteContext<"/f/[firmSlug]/first-available">) {
  const { firmSlug } = await ctx.params;
  const firm = await getPublicFirm(firmSlug);
  if (!firm) return new NextResponse("Not found", { status: 404 });

  const directory = new URL(`/f/${firm.slug}`, request.url);
  const [attorneys, consultTypes] = await Promise.all([listFirmAttorneys(firm.id), getConsultTypes(firm.id)]);
  if (!consultTypes.length || !attorneys.length) return NextResponse.redirect(directory);

  const { firstDate } = bookingWindow();
  const earliest = await Promise.all(
    attorneys.map(async (attorney) => {
      const days = await getAvailability({
        attorneyId: attorney.id,
        durationMinutes: consultTypes[0].durationMinutes,
        fromDate: firstDate,
        days: SEARCH_DAYS,
      });
      return { attorney, startsAt: days.flatMap((d) => d.slots)[0]?.startsAt ?? null };
    }),
  );
  const best = earliest
    .filter((e): e is typeof e & { startsAt: string } => e.startsAt !== null)
    .sort((a, b) => a.startsAt.localeCompare(b.startsAt))[0];

  return NextResponse.redirect(best ? new URL(`/f/${firm.slug}/book/${best.attorney.slug}/time`, request.url) : directory);
}
