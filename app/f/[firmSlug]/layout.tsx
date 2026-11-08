import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getPublicFirm } from "@/lib/booking/queries";

export async function generateMetadata(props: LayoutProps<"/f/[firmSlug]">): Promise<Metadata> {
  const firm = await getPublicFirm((await props.params).firmSlug);
  if (!firm) return {};
  return {
    // Absolute, so the platform's own name isn't appended to the firm's pages.
    title: { absolute: `${firm.name} | Book a consultation`, template: `%s | ${firm.name}` },
    description: `Find the right attorney at ${firm.name} and book a confidential consultation online.`,
  };
}

/** Every page under /f/<firm> belongs to one active firm. Unknown or inactive firms 404. */
export default async function FirmLayout(props: LayoutProps<"/f/[firmSlug]">) {
  const firm = await getPublicFirm((await props.params).firmSlug);
  if (!firm) notFound();
  return props.children;
}
