import { AutoRefresh } from "@/components/booking/auto-refresh";
import { StaffMessages } from "@/components/staff/staff-messages";
import { getStaffContext, getStaffThreadMessages, getStaffThreads } from "@/lib/staff/queries";

export const metadata = { title: "Messages" };

export default async function StaffMessagesPage({ searchParams }: PageProps<"/staff/messages">) {
  const ctx = await getStaffContext();
  const { thread } = await searchParams;
  const threads = await getStaffThreads(ctx);
  const selected = threads.find((t) => t.threadId === thread) ?? threads[0] ?? null;
  const messages = selected ? ((await getStaffThreadMessages(ctx, selected.threadId)) ?? []) : [];

  return (
    <>
      <AutoRefresh seconds={30} />
      <StaffMessages threads={threads} selected={selected} messages={messages} />
    </>
  );
}
