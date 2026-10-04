"use client";

import { useMemo, useState } from "react";
import type { ContactMessage } from "@/lib/cms/types";
import {
  DataTable,
  DataTableShell,
  ListCard,
  ListStack,
  TableHead,
  TableRow,
  TableScroll,
  TableSearch,
  TableToolbar,
  Td,
  Th,
} from "@/components/sidhu/ui/DataTable";
import { EmptyState } from "@/components/sidhu/ui/EmptyState";
import { ListActionButton, ListActions } from "@/components/sidhu/ui/ListActions";
import { SectionCard } from "@/components/sidhu/ui/SectionCard";

function summarize(text: string, max = 72) {
  const cleaned = text.replace(/\s+/g, " ").trim();
  if (cleaned.length <= max) return cleaned;
  return `${cleaned.slice(0, max - 1)}…`;
}

export function MessagesList({ messages }: { messages: ContactMessage[] }) {
  const [query, setQuery] = useState("");
  const [openId, setOpenId] = useState<string | null>(null);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return messages;
    return messages.filter((item) =>
      [item.name, item.email, item.subject, item.phone, item.message]
        .join(" ")
        .toLowerCase()
        .includes(q),
    );
  }, [messages, query]);

  if (messages.length === 0) {
    return (
      <EmptyState
        title="No contact messages yet"
        description="Inquiries from the public contact form will appear here."
      />
    );
  }

  const open = filtered.find((item) => item.id === openId) ?? null;

  return (
    <div className="space-y-4">
      <DataTableShell
        toolbar={
          <TableToolbar>
            <TableSearch
              id="messages-search"
              label="Search messages"
              placeholder="Search name, email, subject…"
              value={query}
              onChange={setQuery}
            />
            <p className="text-xs text-muted">{filtered.length} shown</p>
          </TableToolbar>
        }
      >
        {filtered.length === 0 ? (
          <div className="p-4">
            <EmptyState title="No matching messages" description="Try a different search term." />
          </div>
        ) : (
          <>
            <TableScroll className="hidden md:block">
              <DataTable>
                <TableHead>
                  <tr>
                    <Th>When</Th>
                    <Th>Name</Th>
                    <Th hideBelow="md">Email</Th>
                    <Th>Subject</Th>
                    <Th>
                      <span className="sr-only">Actions</span>
                    </Th>
                  </tr>
                </TableHead>
                <tbody>
                  {filtered.map((item) => (
                    <TableRow key={item.id}>
                      <Td className="whitespace-nowrap text-muted">
                        {item.createdAt.slice(0, 16).replace("T", " ")}
                      </Td>
                      <Td className="font-medium">{item.name}</Td>
                      <Td hideBelow="md" className="text-muted">
                        {item.email}
                      </Td>
                      <Td>
                        <span className="line-clamp-1">{item.subject || summarize(item.message)}</span>
                      </Td>
                      <Td>
                        <ListActions>
                          <ListActionButton
                            onClick={() => setOpenId(openId === item.id ? null : item.id)}
                            aria-expanded={openId === item.id}
                          >
                            {openId === item.id ? "Hide" : "View"}
                          </ListActionButton>
                        </ListActions>
                      </Td>
                    </TableRow>
                  ))}
                </tbody>
              </DataTable>
            </TableScroll>
            <ListStack>
              {filtered.map((item) => (
                <ListCard key={item.id}>
                  <div className="flex flex-wrap items-start justify-between gap-2">
                    <div className="min-w-0">
                      <p className="font-semibold">{item.name}</p>
                      <p className="text-xs text-muted">{item.email}</p>
                    </div>
                    <p className="text-xs text-muted whitespace-nowrap">
                      {item.createdAt.slice(0, 16).replace("T", " ")}
                    </p>
                  </div>
                  <p className="text-sm">{item.subject || summarize(item.message)}</p>
                  <ListActions>
                    <ListActionButton
                      onClick={() => setOpenId(openId === item.id ? null : item.id)}
                      aria-expanded={openId === item.id}
                    >
                      {openId === item.id ? "Hide" : "View"}
                    </ListActionButton>
                  </ListActions>
                </ListCard>
              ))}
            </ListStack>
          </>
        )}
      </DataTableShell>

      {open ? (
        <SectionCard className="space-y-2" padding="sm">
          <div className="flex flex-wrap items-start justify-between gap-2">
            <div>
              <p className="text-sm font-semibold text-ink">{open.subject || "Message"}</p>
              <p className="mt-0.5 text-xs text-muted">
                {open.name} · {open.email}
                {open.phone ? ` · ${open.phone}` : ""}
              </p>
            </div>
            <ListActionButton variant="secondary" onClick={() => setOpenId(null)}>
              Close
            </ListActionButton>
          </div>
          <p className="text-xs text-muted">{open.createdAt.slice(0, 16).replace("T", " ")}</p>
          <p className="whitespace-pre-wrap text-sm leading-relaxed text-ink">{open.message}</p>
        </SectionCard>
      ) : null}
    </div>
  );
}
