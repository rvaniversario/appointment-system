import Link from "next/link";
import { notFound } from "next/navigation";
import { AttorneyForm, LinkAccountForm } from "@/components/staff/attorney-form";
import { Panel } from "@/components/staff/form-ui";
import { ImageUploader } from "@/components/staff/image-uploader";
import { colors, linkButton, pageHeading } from "@/lib/booking/ui";
import { getFirmAttorneys, getFirmMembers, getFirmOffices } from "@/lib/firm/queries";
import { getStaffContext } from "@/lib/staff/queries";

export const metadata = { title: "Attorney profile" };

/** Partners and admins edit any attorney; an attorney edits the public parts of their own profile. */
export default async function AttorneyProfilePage({ params, searchParams }: PageProps<"/staff/firm/attorneys/[attorneyId]">) {
  const ctx = await getStaffContext();
  const { attorneyId } = await params;
  const { created } = await searchParams;
  const isSelf = ctx.attorneyId === attorneyId;
  if (!ctx.isManager && !isSelf) notFound();

  const [attorneys, offices, members] = await Promise.all([
    getFirmAttorneys(ctx),
    getFirmOffices(ctx),
    ctx.isManager ? getFirmMembers(ctx) : Promise.resolve([]),
  ]);
  const attorney = attorneys.find((a) => a.id === attorneyId);
  if (!attorney) notFound();

  return (
    <div>
      {ctx.isManager && (
        <Link href="/staff/firm/attorneys" style={{ ...linkButton, textDecoration: "none", display: "inline-block", marginBottom: 12 }}>
          ← Attorneys
        </Link>
      )}
      <h2 style={pageHeading}>{isSelf && !ctx.isManager ? "Your profile" : attorney.fullName}</h2>
      {created && (
        <div role="status" style={{ background: "oklch(0.96 0.03 150)", borderRadius: 8, padding: "10px 14px", fontSize: 13.5, marginBottom: 16 }}>
          Attorney added. Next,{" "}
          <Link href={`/staff/availability?attorney=${attorney.id}`} style={{ color: colors.green, fontWeight: 600 }}>
            set their weekly hours
          </Link>{" "}
          so clients can book them.
        </div>
      )}
      <Panel title="Photo">
        <ImageUploader kind="attorney-photo" attorneyId={attorney.id} imageUrl={attorney.photoUrl} alt={attorney.fullName} />
      </Panel>
      <AttorneyForm attorney={attorney} offices={offices} selfOnly={!ctx.isManager} />
      {ctx.isManager && (
        <div style={{ marginTop: 18 }}>
          <Panel title="Staff account">
            <p style={{ fontSize: 13.5, color: "oklch(0.5 0.01 258)", margin: "0 0 10px" }}>
              The account linked here sees this attorney&apos;s bookings, clients and messages. To add someone new, invite them from Staff.
            </p>
            <LinkAccountForm attorney={attorney} members={members} />
          </Panel>
        </div>
      )}
      {!ctx.isManager && (
        <p style={{ fontSize: 12.5, color: "oklch(0.55 0.01 258)" }}>
          Your name, IBP details, page address and office are managed by your firm&apos;s partners and admins.
        </p>
      )}
    </div>
  );
}
