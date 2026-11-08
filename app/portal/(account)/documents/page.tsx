import { DocumentsView } from "@/components/portal/documents-view";
import { PortalPage } from "@/components/portal/portal-page";
import { requireClient } from "@/lib/auth/session";
import { getClientFirms, getPortalDocuments } from "@/lib/portal/queries";

export const metadata = { title: "Documents" };

export default async function PortalDocumentsPage() {
  const account = await requireClient();
  const [documents, firms] = await Promise.all([getPortalDocuments(account), getClientFirms(account)]);

  return (
    <PortalPage active="documents">
      <DocumentsView documents={documents} firms={firms} />
    </PortalPage>
  );
}
