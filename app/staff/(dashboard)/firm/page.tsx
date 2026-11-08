import { FirmProfileForm } from "@/components/staff/firm-profile-form";
import { Panel } from "@/components/staff/form-ui";
import { ImageUploader } from "@/components/staff/image-uploader";
import { pageHeading } from "@/lib/booking/ui";
import { getFirmProfile, requireManagerContext } from "@/lib/firm/queries";

export const metadata = { title: "Firm settings" };

export default async function FirmSettingsPage() {
  const ctx = await requireManagerContext();
  const firm = await getFirmProfile(ctx);
  return (
    <div>
      <h2 style={pageHeading}>Firm &amp; policies</h2>
      <Panel title="Logo">
        <ImageUploader kind="logo" imageUrl={firm.logoUrl} alt={`${firm.name} logo`} />
      </Panel>
      <FirmProfileForm firm={firm} />
    </div>
  );
}
