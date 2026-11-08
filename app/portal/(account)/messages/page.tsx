import { AutoRefresh } from "@/components/booking/auto-refresh";
import { MessagesView } from "@/components/portal/messages-view";
import { PortalPage } from "@/components/portal/portal-page";
import { requireClient } from "@/lib/auth/session";
import { getPortalContacts, getThreadMessages } from "@/lib/portal/queries";

export const metadata = { title: "Messages" };

export default async function PortalMessagesPage({ searchParams }: PageProps<"/portal/messages">) {
  const account = await requireClient();
  const { with: withParam } = await searchParams;
  const contacts = await getPortalContacts(account);
  const selected = contacts.find((c) => c.attorneyId === withParam) ?? contacts[0] ?? null;
  const messages = selected?.threadId ? await getThreadMessages(account, selected.threadId) : [];
  const unreadElsewhere = contacts.filter((c) => c !== selected).reduce((n, c) => n + c.unread, 0);

  return (
    <PortalPage active="messages" unread={unreadElsewhere}>
      {/* Replies arrive without a reload; Phase 6 adds email alerts. */}
      <AutoRefresh seconds={30} />
      <MessagesView contacts={contacts} selected={selected} messages={messages} />
    </PortalPage>
  );
}
