"use client";
import { useEffect, useState } from "react";
import { api } from "@/lib/client";
import { Card, CardHeader, Button, Field, Input, Select, Textarea, Badge, Callout, PageHeader, EmptyState, Table, Td, type Tone } from "@/components/ui/primitives";
import { ago } from "@/lib/format";

interface SourceRow {
  id: string; title: string | null; kind: string; url: string | null; domain: string | null;
  accessStatus: string; permissionStatus: string; summary: string | null; wordCount: number | null;
  fetchedAt: string | null; staleAfter: string | null; createdAt: string;
  _count?: { insights: number; excerpts: number };
}
interface Insight { id: string; category: string; statement: string; evidenceType: string; confidence: number; limitation: string | null; evidenceQuote: string | null }

const accessTone = (s: string): Tone => (s === "EXTRACTED" ? "green" : s === "FAILED" ? "red" : s === "BLOCKED" ? "amber" : "neutral");
const evTone = (s: string): Tone => (s === "OBSERVATION" ? "green" : s === "PATTERN" ? "blue" : s === "INTERPRETATION" ? "violet" : "amber");

export function SourcesClient() {
  const [rows, setRows] = useState<SourceRow[]>([]);
  const [url, setUrl] = useState("");
  const [kind, setKind] = useState("ARTICLE");
  const [text, setText] = useState("");
  const [title, setTitle] = useState("");
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [detail, setDetail] = useState<{ source: SourceRow & { rawText?: string | null }; insights: Insight[] } | null>(null);

  async function load() {
    try { setRows(await api<SourceRow[]>("/api/sources")); } catch (e) { setError((e as Error).message); }
  }
  useEffect(() => { void load(); }, []);

  async function addUrl() {
    setError(null); setNotice(null); setBusy("url");
    try {
      const r = await api<{ ok: boolean; error?: string; duplicate?: boolean }>("/api/sources/url", { method: "POST", body: JSON.stringify({ url, kind }) });
      if (!r.ok) setError(r.error ?? "Gagal mengambil URL");
      else setNotice(r.duplicate ? "Sumber ini sudah ada di perpustakaan (duplikat terdeteksi)." : "Sumber berhasil diambil.");
      setUrl(""); await load();
    } catch (e) { setError((e as Error).message); } finally { setBusy(null); }
  }

  async function addText() {
    setError(null); setNotice(null); setBusy("text");
    try {
      const r = await api<{ duplicate: boolean }>("/api/sources/text", { method: "POST", body: JSON.stringify({ title: title || undefined, text, kind: "USER_NOTE", permissionStatus: "USER_PROVIDED" }) });
      setNotice(r.duplicate ? "Duplikat: teks identik sudah ada." : "Catatan tersimpan.");
      setText(""); setTitle(""); await load();
    } catch (e) { setError((e as Error).message); } finally { setBusy(null); }
  }

  async function open(id: string) {
    setBusy(`open:${id}`);
    try {
      const full = await api<SourceRow & { rawText?: string | null; insights: Insight[] }>(`/api/sources/${id}`);
      setDetail({ source: full, insights: full.insights ?? [] });
    } catch (e) { setError((e as Error).message); } finally { setBusy(null); }
  }

  async function act(id: string, action: "summarize" | "insights") {
    setError(null); setBusy(`${action}:${id}`);
    try {
      await api(`/api/sources/${id}/${action}`, { method: "POST" });
      await load();
      if (detail?.source.id === id) await open(id);
    } catch (e) { setError((e as Error).message); } finally { setBusy(null); }
  }

  return (
    <>
      <PageHeader
        title="Source Library"
        description="Kumpulkan referensi publik yang boleh diakses. Isi sumber diperlakukan sebagai data tak tepercaya — instruksi di dalamnya diabaikan."
      />

      {error && <div className="mb-4"><Callout tone="red" title="Gagal">{error}</Callout></div>}
      {notice && <div className="mb-4"><Callout tone="green">{notice}</Callout></div>}

      <div className="grid gap-4 lg:grid-cols-3">
        <Card>
          <CardHeader title="Tambah dari URL" subtitle="Hanya halaman publik. Tanpa login, tanpa CAPTCHA." />
          <div className="space-y-3 p-5">
            <Field label="URL" required>
              <Input value={url} onChange={(e) => setUrl(e.target.value)} placeholder="https://..." type="url" />
            </Field>
            <Field label="Jenis">
              <Select value={kind} onChange={(e) => setKind(e.target.value)}>
                {["ARTICLE", "FORUM", "REVIEW", "COMMENT", "THREADS_POST"].map((k) => <option key={k} value={k}>{k}</option>)}
              </Select>
            </Field>
            <Button variant="primary" className="w-full" onClick={addUrl} loading={busy === "url"} disabled={!url.trim()}>Ambil halaman</Button>
            <p className="text-xs leading-relaxed text-ink-500">Ditolak otomatis: localhost, IP privat, metadata cloud, port non-standar, redirect ke jaringan internal.</p>
          </div>
        </Card>

        <Card className="lg:col-span-2">
          <CardHeader title="Catatan / transkrip milik Anda" subtitle="Pengalaman sendiri adalah sumber terbaik — dan satu-satunya yang boleh ditulis sebagai pengalaman pribadi." />
          <div className="space-y-3 p-5">
            <Field label="Judul (opsional)"><Input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Catatan wawancara, transkrip, dsb." /></Field>
            <Field label="Teks" required hint="Minimal 20 karakter. Disimpan lokal, tidak dikirim ke mana pun kecuali Anda menjalankan ekstraksi AI.">
              <Textarea rows={5} value={text} onChange={(e) => setText(e.target.value)} placeholder="Tempel catatan di sini..." />
            </Field>
            <Button onClick={addText} loading={busy === "text"} disabled={text.trim().length < 20}>Simpan catatan</Button>
          </div>
        </Card>
      </div>

      <Card className="mt-4">
        <CardHeader title="Perpustakaan" subtitle={`${rows.length} sumber`} />
        {rows.length === 0 ? (
          <EmptyState title="Belum ada sumber" description="Tambahkan URL publik atau catatan Anda sendiri untuk mulai memahami bahasa dan masalah audiens." />
        ) : (
          <Table head={["Sumber", "Status", "Insight", "Diambil", ""]}>
            {rows.map((r) => {
              const stale = r.staleAfter && new Date(r.staleAfter) < new Date();
              return (
                <tr key={r.id} className="hover:bg-ink-100/40">
                  <Td>
                    <div className="max-w-[380px]">
                      <p className="truncate font-medium text-ink-900">{r.title ?? "(tanpa judul)"}</p>
                      <p className="truncate text-xs text-ink-500">{r.domain ?? r.kind}{r.wordCount ? ` · ${r.wordCount} kata` : ""}</p>
                    </div>
                  </Td>
                  <Td>
                    <div className="flex flex-wrap gap-1">
                      <Badge tone={accessTone(r.accessStatus)}>{r.accessStatus.toLowerCase()}</Badge>
                      {stale && <Badge tone="amber">kedaluwarsa</Badge>}
                    </div>
                  </Td>
                  <Td><span className="mono">{r._count?.insights ?? 0}</span></Td>
                  <Td><span className="text-xs text-ink-500">{ago(r.fetchedAt ?? r.createdAt)}</span></Td>
                  <Td>
                    <div className="flex gap-1.5">
                      <Button size="sm" onClick={() => open(r.id)} loading={busy === `open:${r.id}`}>Lihat</Button>
                    </div>
                  </Td>
                </tr>
              );
            })}
          </Table>
        )}
      </Card>

      {detail && (
        <Card className="mt-4">
          <CardHeader
            title={detail.source.title ?? "(tanpa judul)"}
            subtitle={detail.source.domain ?? detail.source.kind}
            action={<Button size="sm" variant="ghost" onClick={() => setDetail(null)}>Tutup</Button>}
          />
          <div className="space-y-4 p-5">
            {detail.source.summary && <Callout tone="blue" title="Ringkasan">{detail.source.summary}</Callout>}
            <div className="flex flex-wrap gap-2">
              <Button size="sm" onClick={() => act(detail.source.id, "summarize")} loading={busy === `summarize:${detail.source.id}`}>Ringkas (AI)</Button>
              <Button size="sm" onClick={() => act(detail.source.id, "insights")} loading={busy === `insights:${detail.source.id}`}>Ekstrak insight</Button>
            </div>

            {detail.insights.length > 0 && (
              <div>
                <h4 className="mb-2 text-[13px] font-semibold text-ink-800">Insight ({detail.insights.length})</h4>
                <ul className="space-y-2">
                  {detail.insights.map((i) => (
                    <li key={i.id} className="rounded-lg border hairline p-3">
                      <div className="mb-1 flex flex-wrap items-center gap-1.5">
                        <Badge tone="neutral">{i.category}</Badge>
                        <Badge tone={evTone(i.evidenceType)}>{i.evidenceType.toLowerCase()}</Badge>
                        <span className="mono text-[11px] text-ink-500">keyakinan {i.confidence}%</span>
                      </div>
                      <p className="text-[13.5px] text-ink-800">{i.statement}</p>
                      {i.limitation && <p className="mt-1 text-xs text-ink-500">Keterbatasan: {i.limitation}</p>}
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {detail.source.rawText && (
              <details className="rounded-lg border hairline">
                <summary className="cursor-pointer px-3 py-2 text-[13px] font-medium text-ink-700">Teks sumber</summary>
                <pre className="max-h-72 overflow-auto whitespace-pre-wrap px-3 pb-3 text-[12.5px] leading-relaxed text-ink-600">{detail.source.rawText}</pre>
              </details>
            )}
          </div>
        </Card>
      )}
    </>
  );
}
