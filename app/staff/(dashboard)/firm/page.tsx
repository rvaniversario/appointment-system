import { FirmProfileForm } from "@/components/staff/firm-profile-form";
import { Panel } from "@/components/staff/form-ui";
import { ImageUploader } from "@/components/staff/image-uploader";
import { pageHeading } from "@/lib/booking/ui";
import { getFirmProfile, getSmsUsage, requireManagerContext } from "@/lib/firm/queries";

export const metadata = { title: "Firm settings" };

export default async function FirmSettingsPage() {
  const ctx = await requireManagerContext();
  const [firm, sms] = await Promise.all([getFirmProfile(ctx), getSmsUsage(ctx)]);
  return (
    <div>
      <h2 style={pageHeading}>Firm &amp; policies</h2>
      <Panel title="Logo">
        <ImageUploader kind="logo" imageUrl={firm.logoUrl} alt={`${firm.name} logo`} />
      </Panel>
      <FirmProfileForm firm={firm} />
      <Panel title="Reminders">
        <p id="sms-usage" style={{ margin: "0 0 8px", fontSize: 14 }}>
          <strong>{sms.sent}</strong> of {sms.cap} text messages sent this month.
        </p>
        <p style={{ margin: 0, fontSize: 13, color: "oklch(0.5 0.01 258)", lineHeight: 1.5 }}>
          Clients get an email reminder a day before and an hour before their consultation. Clients who agree to texts on the
          booking form also get a text. When the monthly limit is reached, texts stop until next month and emails continue.
        </p>
      </Panel>
    </div>
  );
}
