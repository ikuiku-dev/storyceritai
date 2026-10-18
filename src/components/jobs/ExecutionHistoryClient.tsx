"use client";

import { useEffect, useState } from "react";
import { api } from "@/lib/client";
import { Card, CardHeader, Button, Badge, Callout, PageHeader, EmptyState, Table, Td } from "@/components/ui/primitives";

interface Job {
  id: string;
  postId: string | null;
  state: string;
  attempt: number;
  errorClass: string | null;
  createdAt: string;
  completedAt: string | null;
  post: { finalText: string; status: string } | null;
}

const STATE_TONE: Record<string, "green" | "amber" | "red" | "neutral" | "violet"> = {
  PUBLISHED: "green",
  DRAFT: "neutral",
  VALIDATING: "neutral",
  APPROVED: "violet",
  SCHEDULED: "violet",
  CLAIMED: "violet",
  PUBLISHING: "amber",
  UNKNOWN_OUTCOME: "amber",
  FAILED_RETRYABLE: "amber",
  FAILED_FINAL: "red",
  BLOCKED: "red",
  NEEDS_REVIEW: "amber",
  CANCELLED: "neutral",
};

function when(iso: string): string {
  const d = new Date(iso);
  const mins = Math.round((Date.now() - d.getTime()) / 60000);
  if (mins < 1) return "baru saja";
  if (mins < 60) return `${mins} menit lalu`;
  if (mins < 1440) return `${Math.round(mins / 60)} jam lalu`;
  return `${Math.round(mins / 1440)} hari lalu`;
}

export default function ExecutionHistoryClient() {
  const [jobs, setJobs] = useState<Job[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function load() {
    try {
      const r = await api<{ jobs: Job[] }>("/api/jobs");
      setJobs(r.jobs);
    } catch (e) { setError((e as Error).message); }
  }

  useEffect(() => { void load(); }, []);

  return (
    <div className="space-y-5">
      <PageHeader
        title="Execution History"
        description="Setiap langkah publikasi tercatat dengan status eksplisit."
      />

      {error && <Callout tone="red" title="Gagal memuat">{error}</Callout>}

      <Card>
        <CardHeader
          title="Riwayat job publikasi"
          subtitle="Status diambil dari state machine, bukan tebakan."
          action={<Button size="sm" variant="ghost" onClick={() => void load()}>Muat ulang</Button>}
        />
        {jobs === null ? (
          <div className="p-5 text-sm text-ink-500">Memuat…</div>
        ) : jobs.length === 0 ? (
          <EmptyState
            title="Belum ada job"
            description="Job tercatat saat sebuah cerita masuk proses publikasi. Belum ada yang dipublikasikan."
          />
        ) : (
          <Table head={["Waktu", "Status", "Percobaan", "Konten", "Catatan"]}>
            {jobs.map((j) => (
              <tr key={j.id} className="border-t hairline">
                <Td><span className="whitespace-nowrap text-[12px] text-ink-600">{when(j.createdAt)}</span></Td>
                <Td><Badge tone={STATE_TONE[j.state] ?? "neutral"}>{j.state}</Badge></Td>
                <Td><span className="text-[12px]">{j.attempt}</span></Td>
                <Td><span className="line-clamp-2 text-[12px] text-ink-700">{j.post?.finalText ?? "—"}</span></Td>
                <Td><span className="text-[12px] text-ink-500">{j.errorClass ?? "—"}</span></Td>
              </tr>
            ))}
          </Table>
        )}
      </Card>

      <Callout tone="blue" title="UNKNOWN_OUTCOME bukan error biasa">
        Jika permintaan terkirim tetapi tidak ada balasan, status menjadi <code>UNKNOWN_OUTCOME</code>.
        Sistem tidak mengulang otomatis — periksa akun Threads dulu, karena pengulangan bisa membuat
        postingan ganda.
      </Callout>
    </div>
  );
}
