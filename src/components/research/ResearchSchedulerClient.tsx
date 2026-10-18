"use client";

import { useEffect, useState } from "react";
import { api } from "@/lib/client";
import { Card, CardHeader, Button, Field, Input, Select, Textarea, Badge, Callout, PageHeader, EmptyState, Table, Td } from "@/components/ui/primitives";

interface Run {
  id: string;
  keywords: string;
  language: string;
  status: string;
  foundCount: number;
  fetchedCount: number;
  storedCount: number;
  skippedCount: number;
  maxDocuments: number;
  stopReason: string | null;
  startedAt: string | null;
  completedAt: string | null;
  createdAt: string;
}

const TONE: Record<string, "green" | "amber" | "red" | "neutral" | "violet"> = {
  DONE: "green", RUNNING: "violet", QUEUED: "neutral", FAILED: "red", CANCELLED: "neutral",
};

export default function ResearchSchedulerClient() {
  const [runs, setRuns] = useState<Run[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | false>(false);

  const [keywords, setKeywords] = useState("");
  const [question, setQuestion] = useState("");
  const [language, setLanguage] = useState("id");
  const [sourceType, setSourceType] = useState("import");
  const [maxDocs, setMaxDocs] = useState(10);

  async function load() {
    try {
      const r = await api<{ runs: Run[] }>("/api/research/runs");
      setRuns(r.runs);
    } catch (e) { setError((e as Error).message); }
  }
  useEffect(() => { void load(); }, []);

  async function start() {
    setBusy("start"); setError(null); setNotice(null);
    try {
      const r = await api<{ run: Run }>("/api/research/runs", {
        method: "POST",
        body: JSON.stringify({ keywords, question: question || undefined, language, sourceTypes: [sourceType], maxDocuments: maxDocs }),
      });
      setNotice(`Run dibuat (${r.run.status}). Kumpulkan dokumen lewat Source Collector, lalu jalankan.`);
      setKeywords(""); setQuestion("");
      await load();
    } catch (e) { setError((e as Error).message); } finally { setBusy(false); }
  }

  async function act(id: string, action: "run" | "cancel") {
    setBusy(`${action}:${id}`); setError(null);
    try {
      await api(`/api/research/runs/${id}/${action}`, { method: "POST", body: JSON.stringify({}) });
      setNotice(action === "run" ? "Run dijalankan." : "Run dibatalkan.");
      await load();
    } catch (e) { setError((e as Error).message); } finally { setBusy(false); }
  }

  return (
    <div className="space-y-5">
      <PageHeader
        title="Research Scheduler"
        description="Rencanakan riset. Hasil tetap ditelusuri ke sumbernya — tidak ada ringkasan yang tidak punya bukti."
      />

      {error && <Callout tone="red" title="Gagal">{error}</Callout>}
      {notice && <Callout tone="green" title="Status">{notice}</Callout>}

      <Card>
        <CardHeader title="Riset baru" subtitle="Tentukan pertanyaan dan batas pengumpulan." />
        <div className="space-y-3 p-5">
          <Field label="Kata kunci">
            <Input value={keywords} onChange={(e) => setKeywords(e.target.value)} placeholder="meja kerja berantakan, kabel charger kusut" />
          </Field>
          <Field label="Pertanyaan riset (opsional)">
            <Textarea rows={2} value={question} onChange={(e) => setQuestion(e.target.value)} placeholder="Masalah apa yang paling sering muncul saat bekerja dari rumah?" />
          </Field>
          <div className="grid gap-3 sm:grid-cols-3">
            <Field label="Bahasa">
              <Select value={language} onChange={(e) => setLanguage(e.target.value)}>
                <option value="id">Indonesia</option>
                <option value="en">English</option>
              </Select>
            </Field>
            <Field label="Jenis sumber">
              <Select value={sourceType} onChange={(e) => setSourceType(e.target.value)}>
                <option value="import">Impor pengguna</option>
                <option value="rss">RSS feed</option>
                <option value="public_api">API publik</option>
              </Select>
            </Field>
            <Field label="Maks dokumen">
              <Input type="number" min={1} max={100} value={maxDocs} onChange={(e) => setMaxDocs(Number(e.target.value))} />
            </Field>
          </div>
          <Button variant="primary" onClick={start} loading={busy === "start"} disabled={keywords.trim().length < 3}>
            Buat run riset
          </Button>
          <p className="text-xs leading-relaxed text-ink-500">
            Run tidak mengambil data sendiri. Dokumen dikumpulkan lewat Source Collector atau impor,
            lalu dijalankan di sini — supaya izin setiap sumber tetap diperiksa.
          </p>
        </div>
      </Card>

      <Card>
        <CardHeader title="Riwayat run" action={<Button size="sm" variant="ghost" onClick={() => void load()}>Muat ulang</Button>} />
        {runs === null ? (
          <div className="p-5 text-sm text-ink-500">Memuat…</div>
        ) : runs.length === 0 ? (
          <EmptyState title="Belum ada run riset" description="Buat run pertama di atas untuk mulai merencanakan pengumpulan data." />
        ) : (
          <Table head={["Kata kunci", "Status", "Dokumen", "Jalan", "Aksi"]}>
            {runs.map((r) => (
              <tr key={r.id} className="border-t hairline">
                <Td><span className="text-[13px] font-medium text-ink-900">{r.keywords}</span></Td>
                <Td><Badge tone={TONE[r.status] ?? "neutral"}>{r.status}</Badge></Td>
                <Td><span className="text-[12px] text-ink-600">{r.storedCount}/{r.maxDocuments}</span></Td>
                <Td>
                  <div className="flex gap-1">
                    <Button size="sm" variant="ghost" onClick={() => act(r.id, "run")} loading={busy === `run:${r.id}`} disabled={r.status === "RUNNING" || r.status === "CANCELLED"}>Run now</Button>
                    <Button size="sm" variant="ghost" onClick={() => act(r.id, "cancel")} loading={busy === `cancel:${r.id}`} disabled={r.status === "CANCELLED" || r.status === "DONE"}>Cancel</Button>
                  </div>
                </Td>
              </tr>
            ))}
          </Table>
        )}
      </Card>

      <Callout tone="amber" title="Batas atas">
        Setiap run punya batas waktu, jumlah dokumen, dan retry. Jika tidak ada sumber yang berhasil,
        run ditandai gagal — bukan dilaporkan seolah riset baru berhasil.
      </Callout>
    </div>
  );
}
