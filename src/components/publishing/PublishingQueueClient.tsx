"use client";

import { useEffect, useState } from "react";
import { api } from "@/lib/client";
import { Card, CardHeader, Button, Badge, Callout, PageHeader, EmptyState, Table, Td } from "@/components/ui/primitives";

interface Item {
  id: string;
  finalText: string;
  status: string;
  scheduledAt: string | null;
  publishedAt: string | null;
  affiliateUrl: string | null;
  disclosureIncluded: boolean;
  failedReason: string | null;
}

const TONE: Record<string, "green" | "amber" | "red" | "neutral" | "violet"> = {
  PUBLISHED: "green", APPROVED: "violet", SCHEDULED: "violet",
  WAITING_APPROVAL: "amber", FAILED: "red", CANCELLED: "neutral",
};

const LABEL: Record<string, string> = {
  PUBLISHED: "Terbit", APPROVED: "Disetujui", SCHEDULED: "Terjadwal",
  WAITING_APPROVAL: "Menunggu persetujuan", FAILED: "Gagal", CANCELLED: "Dibatalkan",
};

function at(iso: string | null): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleString("id-ID", { dateStyle: "medium", timeStyle: "short" });
}

export default function PublishingQueueClient() {
  const [items, setItems] = useState<Item[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | false>(false);

  async function load() {
    try {
      const r = await api<{ items: Item[] }>("/api/publishing/queue");
      setItems(r.items);
    } catch (e) { setError((e as Error).message); }
  }
  useEffect(() => { void load(); }, []);

  async function act(id: string, action: "approve" | "cancel") {
    setBusy(`${action}:${id}`); setError(null); setNotice(null);
    try {
      if (action === "approve") {
        await api(`/api/posts/${id}/approve`, { method: "POST", body: JSON.stringify({}) });
        setNotice("Postingan disetujui. Masih menunggu publikasi manual.");
      } else {
        await api(`/api/publishing/pause`, { method: "POST", body: JSON.stringify({ action: "cancel_scheduled" }) });
        setNotice("Antrean terjadwal dibatalkan.");
      }
      await load();
    } catch (e) { setError((e as Error).message); } finally { setBusy(false); }
  }

  const queued = items?.filter((i) => ["WAITING_APPROVAL", "APPROVED", "SCHEDULED"].includes(i.status)) ?? [];

  return (
    <div className="space-y-5">
      <PageHeader
        title="Publishing Queue"
        description="Apa yang menunggu, apa yang terjadwal, dan kenapa ada yang gagal."
      />

      {error && <Callout tone="red" title="Gagal">{error}</Callout>}
      {notice && <Callout tone="blue" title="Status">{notice}</Callout>}

      <Card>
        <CardHeader
          title="Antrean"
          subtitle={`${queued.length} postingan menunggu di antrean`}
          action={<Button size="sm" variant="ghost" onClick={() => void load()}>Muat ulang</Button>}
        />
        {items === null ? (
          <div className="p-5 text-sm text-ink-500">Memuat…</div>
        ) : items.length === 0 ? (
          <EmptyState title="Antrean kosong" description="Setujui cerita di Story Arena atau Story Studio untuk memasukkannya ke antrean." />
        ) : (
          <Table head={["Konten", "Status", "Jadwal", "Terbit", "Aksi"]}>
            {items.map((i) => (
              <tr key={i.id} className="border-t hairline">
                <Td>
                  <span className="line-clamp-2 text-[13px] text-ink-800">{i.finalText.slice(0, 120)}</span>
                  {i.failedReason && <span className="mt-1 block text-[11px] text-red-700">{i.failedReason.slice(0, 90)}</span>}
                </Td>
                <Td><Badge tone={TONE[i.status] ?? "neutral"}>{LABEL[i.status] ?? i.status}</Badge></Td>
                <Td><span className="whitespace-nowrap text-[12px] text-ink-600">{at(i.scheduledAt)}</span></Td>
                <Td><span className="whitespace-nowrap text-[12px] text-ink-600">{at(i.publishedAt)}</span></Td>
                <Td>
                  {i.status === "WAITING_APPROVAL" && (
                    <Button size="sm" onClick={() => act(i.id, "approve")} loading={busy === `approve:${i.id}`}>Setujui</Button>
                  )}
                  {i.status === "FAILED" && <span className="text-[12px] text-ink-500">perlu diperiksa</span>}
                </Td>
              </tr>
            ))}
          </Table>
        )}
      </Card>

      <Callout tone="amber" title="Antrean bukan jaminan terbit">
        Menyetujui hanya memindahkan postingan ke antrean. Kebijakan diperiksa ulang tepat sebelum
        terbit — kuota, jarak waktu, tautan, dan fact-check bisa membatalkannya.
      </Callout>
    </div>
  );
}
