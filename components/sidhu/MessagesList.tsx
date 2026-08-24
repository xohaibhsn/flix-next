import type { ContactMessage } from "@/lib/cms/types";

export function MessagesList({ messages }: { messages: ContactMessage[] }) {
  return (
    <div className="overflow-hidden rounded-xl border border-line bg-white">
      {messages.length === 0 ? (
        <p className="p-6 text-sm text-muted">No contact messages yet.</p>
      ) : (
        <table className="w-full text-left text-sm">
          <thead className="bg-paper text-xs tracking-wide text-muted uppercase">
            <tr>
              <th className="px-4 py-3">When</th>
              <th className="px-4 py-3">Name</th>
              <th className="px-4 py-3">Email</th>
              <th className="px-4 py-3">Subject</th>
              <th className="px-4 py-3">Message</th>
            </tr>
          </thead>
          <tbody>
            {messages.map((item) => (
              <tr key={item.id} className="border-t border-line align-top">
                <td className="px-4 py-3 whitespace-nowrap">{item.createdAt.slice(0, 16).replace("T", " ")}</td>
                <td className="px-4 py-3">{item.name}</td>
                <td className="px-4 py-3">{item.email}</td>
                <td className="px-4 py-3">{item.subject}</td>
                <td className="px-4 py-3">
                  {item.phone ? <p className="text-xs text-muted">{item.phone}</p> : null}
                  <p>{item.message}</p>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}
