"use client";
import { useEffect, useState } from "react";
import { api } from "@/lib/client";
import { Card, CardHeader, Button, Field, Input, Select, Textarea, Badge, Callout, PageHeader, EmptyState, Spinner } from "@/components/ui/primitives";

interface Step { step: number; name: string; detail: string; aiCalls: number }
interface CandidateResult {
  draftId: string; title: string | null; text: string; weightedScore: number | null;
  lintBlocked: boolean; lintCodes: string[]; similarity: number; eliminatedReason?: string;
}
interface RunResult { steps: Step[]; results: CandidateResult[]; explanation: string; aiCalls: number; elapsedMs: number; capped: boolean }
interface Product { id: string; name: string }

export function ArenaClient({ products }: { products: Product[] }) {
  const [problem, setProblem] = useState("");
  const [hypothesis, setHypothesis] = useState("");
  const [truthMode, setTruthMode] = useState("HYPOTHETICAL");
  const [experience, setExperience] = useState("");
  const [productId, setProductId] = useState("");
  const [maxConcepts, setMaxConcepts] = useState(10);
  const [finalists, setFinalists] = useState(4);
  const [versions, setVersions] = useState(2);
  const [maxAiCalls, setMaxAiCalls] = useState(20);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [run, setRun] = useState<RunResult | null>(null);
  const [expName, setExpName] = useState("");
  const [notice, setNotice] = useState<string | null>(null);
  const [showCompare, setShowCompare] = useState(false);
  const [acting, setActing] = useState<string | null>(null);

  async function regenerate(draftId: string) {
    if (!run) return;
    setError(null); setNotice(null); setActing(`regen:${draftId}`);
    try {
      const r = await api<{ draft: { text: string; title: string | null }; angle: string }>("/api/arena/regenerate", {
        method: "POST",
        body: JSON.stringify({
          draftId, audienceProblem: problem, truthMode,
          avoidTexts: run.results.filter((x) => x.draftId !== draftId && x.draftId).map((x) => x.text),
        }),
      });
      setRun({
        ...run,
        results: run.results.map((c) => (c.draftId === draftId ? { ...c, text: r.draft.text, title: r.draft.title } : c)),
      });
      setNotice(`Kandidat ditulis ulang dengan sudut "${r.angle}".`);
    } catch (e) { setError((e as Error).message); } finally { setActing(null); }
  }

  async function factCheck(draftId: string) {
    setError(null); setNotice(null); setActing(`fact:${draftId}`);
    try {
      const r = await api<{ status: string }>(`/api/stories/${draftId}/fact-check`, { method: "POST" });
      setNotice(`Fact-check selesai: ${r.status}.`);
    } catch (e) { setError((e as Error).message); } finally { setActing(null); }
  }

  async function approve(draftId: string) {
    setError(null); setNotice(null); setActing(`approve:${draftId}`);
    try {
      await api(`/api/stories/${draftId}/approve`, { method: "POST", body: JSON.stringify({}) });
      setNotice("Draft disetujui. Belum terbit — publikasi tetap manual di Threads Integration.");
    } catch (e) { setError((e as Error).message); } finally { setActing(null); }
  }

  async function reject(draftId: string) {
    setError(null); setNotice(null); setActing(`reject:${draftId}`);
    try {
      await api(`/api/stories/${draftId}`, { method: "PATCH", body: JSON.stringify({ status: "REJECTED" }) });
      setRun(run ? { ...run, results: run.results.filter((c) => c.draftId !== draftId) } : run);
      setNotice("Kandidat ditolak dan dikeluarkan dari daftar.");
    } catch (e) { setError((e as Error).message); } finally { setActing(null); }
  }

  function exportResults() {
    if (!run) return;
    const payload = {
      exportedAt: new Date().toISOString(),
      brief: { audienceProblem: problem, hypothesis, truthMode, productId: productId || null },
      steps: run.steps, aiCalls: run.aiCalls, elapsedMs: run.elapsedMs,
      candidates: run.results.map((c, i) => ({ rank: i + 1, ...c })),
      explanation: run.explanation,
    };
    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `ceritalab-arena-${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    URL.revokeObjectURL(a.href);
    setNotice("Hasil turnamen diekspor.");
  }

  async function start() {
    setError(null); setNotice(null); setBusy(true); setRun(null);
    try {
      const r = await api<RunResult>("/api/arena/run", {
        method: "POST",
        body: JSON.stringify({
          audienceProblem: problem, hypothesis: hypothesis || undefined, truthMode,
          personalExperience: truthMode === "REAL_EXPERIENCE" ? experience : null,
          productId: productId || null, maxConcepts, finalists, versionsPerConcept: versions, maxAiCalls,
        }),
      });
      setRun(r);
    } catch (e) { setError((e as Error).message); } finally { setBusy(false); }
  }

  async function saveExperiment() {
    if (!run) return;
    setError(null);
    try {
      const ids = run.results.filter((r) => r.draftId).map((r) => r.draftId);
      await api("/api/experiments", {
        method: "POST",
        body: JSON.stringify({
          name: expName || `Eksperimen ${new Date().toLocaleDateString("id-ID")}`,
          hypothesis: hypothesis || problem,
          draftIds: ids, productId: productId || null, observationDays: 7,
        }),
      });
      setNotice("Eksperimen disimpan. Buka Experiments & Analytics untuk memantau hasilnya.");
    } catch (e) { setError((e as Error).message); }
  }

  const saved = run?.results.filter((r) => r.draftId) ?? [];
  const eliminated = run?.results.filter((r) => !r.draftId) ?? [];

  return (
    <>
      <PageHeader title="Story Arena" description="Adu kandidat cerita dengan kriteria konsisten. Semua proses dibatasi jumlah panggilan AI dan waktu — tidak ada loop tanpa akhir." />

      {error && <div className="mb-4"><Callout tone="red" title="Turnamen gagal">{error}</Callout></div>}
      {notice && <div className="mb-4"><Callout tone="green">{notice}</Callout></div>}

      <div className="grid gap-4 lg:grid-cols-[360px_1fr]">
        <Card>
          <CardHeader title="Pengaturan turnamen" />
          <div className="space-y-3 p-5">
            <Field label="Masalah audiens" required>
              <Textarea rows={3} value={problem} onChange={(e) => setProblem(e.target.value)} placeholder="Meja kerja kecil jadi berantakan..." />
            </Field>
            <Field label="Hipotesis" hint="Apa yang ingin Anda uji?">
              <Textarea rows={2} value={hypothesis} onChange={(e) => setHypothesis(e.target.value)} placeholder="Cerita yang mulai dari masalah sehari-hari..." />
            </Field>
            <Field label="Mode kebenaran">
              <Select value={truthMode} onChange={(e) => setTruthMode(e.target.value)}>
                <option value="HYPOTHETICAL">Hipotetis</option>
                <option value="REAL_EXPERIENCE">Pengalaman nyata saya</option>
                <option value="OPINION">Opini</option>
                <option value="PRODUCT_EXPLAINER">Penjelasan produk</option>
              </Select>
            </Field>
            {truthMode === "REAL_EXPERIENCE" && (
              <Field label="Pengalaman nyata" required>
                <Textarea rows={3} value={experience} onChange={(e) => setExperience(e.target.value)} />
              </Field>
            )}
            <Field label="Produk (opsional)">
              <Select value={productId} onChange={(e) => setProductId(e.target.value)}>
                <option value="">— tanpa produk —</option>
                {products.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
              </Select>
            </Field>
            <div className="grid grid-cols-2 gap-3">
              <Field label="Konsep"><Input type="number" min={4} max={14} value={maxConcepts} onChange={(e) => setMaxConcepts(Number(e.target.value))} /></Field>
              <Field label="Finalis"><Input type="number" min={2} max={6} value={finalists} onChange={(e) => setFinalists(Number(e.target.value))} /></Field>
              <Field label="Versi/konsep"><Input type="number" min={1} max={3} value={versions} onChange={(e) => setVersions(Number(e.target.value))} /></Field>
              <Field label="Maks panggilan AI"><Input type="number" min={4} max={60} value={maxAiCalls} onChange={(e) => setMaxAiCalls(Number(e.target.value))} /></Field>
            </div>
            <Button variant="primary" className="w-full" onClick={start} loading={busy} disabled={problem.trim().length < 5}>
              Generate Tournament
            </Button>
            <p className="text-xs leading-relaxed text-ink-500">Batas keras: {maxAiCalls} panggilan AI dan 180 detik. Turnamen berhenti otomatis jika salah satu tercapai.</p>
          </div>
        </Card>

        <div className="space-y-4">
          {busy && (
            <Card><div className="flex items-center gap-3 p-6 text-sm text-ink-600"><Spinner /> Menjalankan turnamen — membuat konsep, menulis versi, menyaring, menilai…</div></Card>
          )}

          {!busy && !run && (
            <Card><EmptyState title="Belum ada turnamen" description="Isi masalah audiens lalu jalankan turnamen. Sistem akan membuat beberapa konsep, menyaring klaim terlarang dan duplikat, lalu menyimpan 3 kandidat teratas." /></Card>
          )}

          {run && (
            <>
              <Card>
                <CardHeader title="Rekap proses" subtitle={`${run.aiCalls} panggilan AI · ${(run.elapsedMs / 1000).toFixed(1)}s${run.capped ? " · dihentikan oleh batas" : ""}`} />
                <ol className="space-y-2 p-5">
                  {run.steps.map((s) => (
                    <li key={s.step} className="flex items-start gap-3">
                      <span className="mono grid h-5 w-5 shrink-0 place-items-center rounded-md bg-ink-100 text-[11px] font-semibold text-ink-600">{s.step}</span>
                      <div>
                        <p className="text-[13.5px] font-medium text-ink-800">{s.name}</p>
                        <p className="text-xs text-ink-500">{s.detail}</p>
                      </div>
                    </li>
                  ))}
                </ol>
              </Card>

              <div className="grid gap-3 md:grid-cols-3">
                {saved.map((c, i) => (
                  <Card key={c.draftId} className="p-4">
                    <div className="mb-2 flex items-center justify-between gap-2">
                      <span className="text-[12px] font-semibold uppercase tracking-wide text-ink-500">Peringkat {i + 1}</span>
                      <Badge tone="violet">{c.weightedScore}/10</Badge>
                    </div>
                    <h3 className="mb-1 text-[14px] font-semibold text-ink-900">{c.title ?? "(tanpa judul)"}</h3>
                    <p className="prose-story line-clamp-6 text-[13px]">{c.text}</p>
                    <div className="mt-3 flex flex-wrap gap-1.5">
                      <Button size="sm" variant="ghost" onClick={() => regenerate(c.draftId)}
                        loading={acting === `regen:${c.draftId}`}>Regenerate</Button>
                      <Button size="sm" variant="ghost" onClick={() => factCheck(c.draftId)}
                        loading={acting === `fact:${c.draftId}`}>Fact Check</Button>
                      <Button size="sm" onClick={() => approve(c.draftId)}
                        loading={acting === `approve:${c.draftId}`}>Approve</Button>
                      <Button size="sm" variant="danger" onClick={() => reject(c.draftId)}
                        loading={acting === `reject:${c.draftId}`}>Reject</Button>
                      <a href="/studio" className="inline-flex items-center px-2 text-xs font-medium text-brand-700 hover:underline">Edit →</a>
                    </div>
                  </Card>
                ))}
              </div>

              <Callout tone="blue" title="Explain Winner — kenapa kandidat ini menang?">{run.explanation}</Callout>

              {eliminated.length > 0 && (
                <Card>
                  <CardHeader title="Gugur" subtitle={`${eliminated.length} kandidat disaring otomatis`} />
                  <ul className="divide-y divide-[var(--border)]">
                    {eliminated.map((e, i) => (
                      <li key={i} className="px-5 py-2.5">
                        <div className="flex items-center gap-2">
                          <span className="text-[13px] font-medium text-ink-700">{e.title ?? "(tanpa judul)"}</span>
                          <Badge tone="red">{e.eliminatedReason}</Badge>
                        </div>
                        <p className="mt-0.5 truncate text-xs text-ink-500">{e.text.slice(0, 110)}…</p>
                      </li>
                    ))}
                  </ul>
                </Card>
              )}

              {saved.length >= 2 && (
                <Card>
                  <CardHeader title="Simpan sebagai eksperimen" subtitle="Lacak performa nyata setelah dipublikasikan." />
                  <div className="flex flex-wrap items-end gap-3 p-5">
                    <div className="min-w-[260px] flex-1">
                      <Field label="Nama eksperimen"><Input value={expName} onChange={(e) => setExpName(e.target.value)} placeholder="Pembukaan masalah vs produk" /></Field>
                    </div>
                    <Button onClick={saveExperiment}>Save as Experiment</Button>
                  </div>
                </Card>
              )}

              <Card>
                <CardHeader
                  title="Bandingkan kandidat"
                  subtitle="Baca berdampingan sebelum memilih."
                  action={
                    <div className="flex gap-2">
                      <Button size="sm" onClick={() => setShowCompare((v) => !v)}>
                        {showCompare ? "Tutup perbandingan" : "Compare Candidates"}
                      </Button>
                      <Button size="sm" variant="ghost" onClick={exportResults}>Export Results</Button>
                    </div>
                  }
                />
                {showCompare && (
                  <div className="grid gap-3 p-5 md:grid-cols-3">
                    {saved.map((c, i) => (
                      <div key={c.draftId} className="rounded-lg border hairline p-3">
                        <div className="mb-1 flex items-center justify-between">
                          <span className="text-[11px] font-semibold uppercase text-ink-500">Peringkat {i + 1}</span>
                          <Badge tone="violet">{c.weightedScore ?? "—"}/10</Badge>
                        </div>
                        <p className="prose-story whitespace-pre-wrap text-[12.5px]">{c.text}</p>
                      </div>
                    ))}
                  </div>
                )}
              </Card>

              <Callout tone="amber" title="Ingat">
                Skor rubrik hanya menyaring kandidat. Ini bukan prediksi viralitas, dan likes bukan penjualan.
              </Callout>
            </>
          )}
        </div>
      </div>
    </>
  );
}
