import { AdminShell } from "@/components/sidhu/AdminShell";
import { MessagesList } from "@/components/sidhu/MessagesList";
import { cms } from "@/lib/cms/repository";

export const dynamic = "force-dynamic";

export default async function SidhuMessagesPage() {
  const messages = await cms.listMessages();
  return (
    <AdminShell
      title="Messages"
      subtitle="Contact form inquiries. Message bodies open on View — they do not fill the table."
      breadcrumbs={[{ label: "Operations" }, { label: "Messages" }]}
    >
      <MessagesList messages={messages} />
    </AdminShell>
  );
}
