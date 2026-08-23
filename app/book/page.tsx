import { BookingApp } from "@/components/booking/booking-app";
import type { BookEntryScreen } from "@/lib/booking/types";

const VALID_ENTRY_SCREENS: BookEntryScreen[] = ["portal-login", "admin-login"];

function firstParam(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}

export default async function BookPage(props: PageProps<"/book">) {
  const searchParams = await props.searchParams;
  const requestedScreen = firstParam(searchParams.screen);
  const screen: BookEntryScreen = VALID_ENTRY_SCREENS.includes(requestedScreen as BookEntryScreen)
    ? (requestedScreen as BookEntryScreen)
    : "portal-login";

  return <BookingApp initialScreen={screen} />;
}
