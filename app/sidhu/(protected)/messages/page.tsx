import { AdminShell } from "@/components/sidhu/AdminShell";
import { MessagesList } from "@/components/sidhu/MessagesList";
import { cms } from "@/lib/cms/repository";

export const dynamic = "force-dynamic";

export default async function SidhuMessagesPage() {
  const messages = await cms.listMessages();
  return (
    <AdminShell
      title="Contact messages"
      subtitle="Inquiries from the public contact form. SMTP is not configured; messages are stored in MySQL."
    >
      <MessagesList messages={messages} />
    </AdminShell>
  );
}
