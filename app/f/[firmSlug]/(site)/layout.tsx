import { notFound } from "next/navigation";
import { FirmSiteChrome } from "@/components/firm/firm-site-chrome";
import { getPublicFirm } from "@/lib/booking/queries";

export default async function FirmSiteLayout(props: LayoutProps<"/f/[firmSlug]">) {
  const firm = await getPublicFirm((await props.params).firmSlug);
  if (!firm) notFound();
  return <FirmSiteChrome firm={firm}>{props.children}</FirmSiteChrome>;
}
