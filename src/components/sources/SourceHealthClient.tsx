"use client";

import { useEffect, useState } from "react";
import { api } from "@/lib/client";
import { Card, CardHeader, Button, Badge, Callout, PageHeader, EmptyState, Table, Td, Stat } from "@/components/ui/primitives";

interface Doc {
  id: string;
  url: string;
  title: string | null;
  sourceType: string;
  origin: string;
  extractionStatus: string;
  permissionStatus: string;
  qualityNote: string | null;
  fetchedAt: string;
  expiresAt: string | null;
}

interface Payload {
  documents: Doc[];
  summary: { total: number; fetched: number; imported: number; flagged: number; stale: number };
}

export default function SourceHealthClient() {
  const [data, setData] = useState<Payload | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function load() {
    try { setData(await api<Payload>("/api/sources/health")); }
    catch (e) { setError((e as Error).message); }
  }
  useEffect(() => { void load(); }, []);

  return (
    <div className="space-y-5">
      <PageHeader
        title="Source Health"
        description="Kesegaran data, status ekstraksi, dan peringatan kualitas — termasuk konten yang ditandai."
      />

      {error && <Callout tone="red" title="Gagal">{error}</Callout>}

      {data && (
        <div className="grid gap-3 sm:grid-cols-4">
          <Stat label="Total dokumen" value={String(data.summary.total)} />
          <Stat label="Diambil" value={String(data.summary.fetched)} />
          <Stat label="Impor pengguna" value={String(data.summary.imported)} />
          <Stat label="Ditandai" value={String(data.summary.flagged)} />
        </div>
      )}

      {data && data.summary.stale > 0 && (
        <Callout tone="amber" title={`${data.summary.stale} dokumen kedaluwarsa`}>
          Data lama tetap ditampilkan tetapi ditandai basi. Lakukan pengumpulan ulang sebelum memakainya
          sebagai dasar keputusan.
        </Callout>
      )}

      <Card>
        <CardHeader
          title="Dokumen tersimpan"
          subtitle="Hanya metadata, ringkasan, dan kutipan pendek — bukan seluruh halaman."
          action={<Button size="sm" variant="ghost" onClick={() => void load()}>Muat ulang</Button>}
        />
        {data === null ? (
          <div className="p-5 text-sm text-ink-500">Memuat…</div>
        ) : data.documents.length === 0 ? (
          <EmptyState title="Belum ada dokumen" description="Kumpulkan data lewat Source Collector atau impor berkas Anda sendiri." />
        ) : (
          <Table head={["Sumber", "Asal", "Izin", "Kualitas", "Diambil"]}>
            {data.documents.map((d) => {
              const stale = d.expiresAt ? new Date(d.expiresAt) < new Date() : false;
              return (
                <tr key={d.id} className="border-t hairline">
                  <Td>
                    <span className="block max-w-[26rem] truncate text-[13px] text-ink-800">{d.title ?? d.url}</span>
                    <span className="block max-w-[26rem] truncate text-[11px] text-ink-500">{d.url}</span>
                  </Td>
                  <Td><Badge tone={d.origin === "imported" ? "violet" : "neutral"}>{d.origin}</Badge></Td>
                  <Td><span className="text-[12px] text-ink-600">{d.permissionStatus}</span></Td>
                  <Td>
                    {d.qualityNote ? <Badge tone="amber">ditandai</Badge> : <span className="text-[12px] text-ink-500">—</span>}
                    {stale && <Badge tone="red">basi</Badge>}
                  </Td>
                  <Td><span className="whitespace-nowrap text-[12px] text-ink-600">{new Date(d.fetchedAt).toLocaleDateString("id-ID")}</span></Td>
                </tr>
              );
            })}
          </Table>
        )}
      </Card>

      <Callout tone="blue" title="Tentang tanda “ditandai”">
        Dokumen ditandai bila teksnya mengandung pola instruksi mencurigakan (mis. “abaikan instruksi
        sebelumnya”). Konten seperti itu diperlakukan sebagai data, tidak pernah dijalankan.
      </Callout>
    </div>
  );
}
