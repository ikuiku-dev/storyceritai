"use client";
import { useEffect, useState, useTransition } from "react";
import { api } from "@/lib/client";
import { Card, CardHeader, Button, Field, Input, Select, Textarea, Badge, Callout, Switch, PageHeader, Spinner, EmptyState, type Tone } from "@/components/ui/primitives";
import { threadsLength, ago } from "@/lib/format";
import { SendToQueue } from "@/components/publishing/SendToQueue";

interface Product { id: string; name: string }
interface Draft {
  id: string; title: string | null; text: string; truthMode: string; status: string;
  factCheckStatus: string; similarityScore: number | null; currentRevision: number;
  concept?: { title: string; angle: string };
  scores?: { weightedScore: number | null }[];
  lintIssues?: { code: string; severity: string; message: string }[];
  duplicates?: { id: string; title: string | null; score: number }[];
}

const STYLES = [
  ["santai", "Santai & natural"], ["threads", "Seperti di Threads"], ["ringkas", "Ringkas & lugas"],
  ["humor", "Sedikit humor"], ["observasional", "Observasional"], ["reflektif", "Reflektif"],
  ["informatif", "Informatif santai"], ["sudut_pengguna", "Sudut pandang pengguna"], ["softsell", "Soft-selling transparan"],
];

const TRUTH_MODES = [
  ["HYPOTHETICAL", "Hipotetis (ilustrasi)", "Skenario/ilustrasi. Tidak ada klaim pengalaman."],
  ["REAL_EXPERIENCE", "Pengalaman nyata saya", "Butuh tulisan pengalaman Anda. AI tidak boleh mengarang."],
  ["SOURCE_BASED", "Berbasis sumber", "Dirangkum dari sumber yang diimpor."],
  ["OPINION", "Opini", "Penilaian dengan alasan."],
  ["PRODUCT_EXPLAINER", "Penjelasan produk", "Fakta produk yang terverifikasi saja."],
] as const;

const statusTone = (s: string): Tone =>
  s === "APPROVED" ? "green" : s === "NEEDS_REVIEW" ? "amber" : s === "REJECTED" ? "red" : "neutral";
const factTone = (s: string): Tone => (s === "PASSED" ? "green" : s === "FAILED" ? "red" : s === "WARNINGS" ? "amber" : "neutral");

export function StudioClient({
  products,
  initialProductId = "",
  initialProblem = "",
}: {
  products: Product[];
  initialProductId?: string;
  initialProblem?: string;
}) {
  const [mode, setMode] = useState<"simple" | "research">("simple");
  const [problem, setProblem] = useState(initialProblem);
  const [style, setStyle] = useState("santai");
  const [truthMode, setTruthMode] = useState<string>("HYPOTHETICAL");
  const [experience, setExperience] = useState("");
  const [productId, setProductId] = useState(initialProductId);
  const [versions, setVersions] = useState(2);
  const [promotion, setPromotion] = useState(1);
  const [length, setLength] = useState(2);
  const [slang, setSlang] = useState(1);
  const [endingQuestion, setEndingQuestion] = useState(false);

  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [results, setResults] = useState<Draft[]>([]);
  const [recent, setRecent] = useState<Draft[]>([]);
  const [selected, setSelected] = useState<Draft | null>(null);
  const [editText, setEditText] = useState("");
  const [, start] = useTransition();

  const loadRecent = async () => {
    try {
      const rows = await api<Draft[]>("/api/stories");
      setRecent(rows);
    } catch { /* list is non-critical */ }
  };
  useEffect(() => { start(() => { void loadRecent(); }); }, []); // eslint-disable-line

  async function generate() {
    setError(null); setBusy("generate");
    try {
      const res = await api<{ drafts: Draft[] }>("/api/stories/generate", {
        method: "POST",
        body: JSON.stringify({
          audienceProblem: problem,
          productId: productId || null,
          stylePreset: style,
          truthMode,
          personalExperience: truthMode === "REAL_EXPERIENCE" ? experience : null,
          versions,
          controls: { formality: 1, length, promotion, humor: 1, detail: 2, slang, endingQuestion },
        }),
      });
      setResults(res.drafts);
      await loadRecent();
    } catch (e) { setError((e as Error).message); }
    finally { setBusy(null); }
  }

  async function act(id: string, action: "score" | "fact-check" | "naturalize" | "approve") {
    setError(null); setBusy(`${action}:${id}`);
    try {
      await api(`/api/stories/${id}/${action}`, { method: "POST" });
      const fresh = await api<Draft>(`/api/stories/${id}`);
      setResults((prev) => prev.map((d) => (d.id === id ? { ...d, ...fresh } : d)));
      if (selected?.id === id) setSelected({ ...selected, ...fresh });
      await loadRecent();
    } catch (e) { setError((e as Error).message); }
    finally { setBusy(null); }
  }

  async function saveEdit(id: string) {
    setError(null); setBusy(`save:${id}`);
    try {
      await api(`/api/stories/${id}/revision`, { method: "POST", body: JSON.stringify({ text: editText, changeNote: "Diedit manual" }) });
      const fresh = await api<Draft>(`/api/stories/${id}`);
      setResults((prev) => prev.map((d) => (d.id === id ? { ...d, ...fresh } : d)));
      if (selected?.id === id) setSelected({ ...selected, ...fresh });
      await loadRecent();
    } catch (e) { setError((e as Error).message); }
    finally { setBusy(null); }
  }

  const charCount = threadsLength(editText);

  return (
    <>
      <PageHeader
        title="Story Studio"
        description="Tulis cerita yang terasa seperti percakapan manusia. Setiap draft punya label mode kebenaran yang ditegakkan, bukan sekadar hiasan."
        action={
          <div className="inline-flex rounded-lg border hairline bg-white p-0.5">
            {(["simple", "research"] as const).map((m) => (
              <button key={m} onClick={() => setMode(m)} className={`rounded-md px-3 py-1.5 text-[13px] font-medium transition-colors ${mode === m ? "bg-ink-900 text-white" : "text-ink-600 hover:text-ink-900"}`}>
                {m === "simple" ? "Simple" : "Research"}
              </button>
            ))}
          </div>
        }
      />

      <div className="grid gap-4 lg:grid-cols-[380px_1fr]">
        <div className="space-y-4">
          <Card>
            <CardHeader title="Brief cerita" subtitle="Masalah dulu, produk belakangan." />
            <div className="space-y-4 p-5">
              <Field label="Masalah audiens" required hint="Contoh: meja kerja kecil jadi berantakan karena HP dan kabel tidak punya tempat tetap.">
                <Textarea rows={3} value={problem} onChange={(e) => setProblem(e.target.value)} placeholder="Apa masalah yang benar-benar dialami orang?" />
              </Field>

              <Field label="Mode kebenaran" hint={TRUTH_MODES.find((t) => t[0] === truthMode)?.[2]}>
                <Select value={truthMode} onChange={(e) => setTruthMode(e.target.value)}>
                  {TRUTH_MODES.map(([v, label]) => <option key={v} value={v}>{label}</option>)}
                </Select>
              </Field>

              {truthMode === "REAL_EXPERIENCE" && (
                <Field label="Pengalaman nyata Anda" required hint="Tulis apa yang benar-benar terjadi. AI tidak akan menambah detail.">
                  <Textarea rows={4} value={experience} onChange={(e) => setExperience(e.target.value)} placeholder="Yang sebenarnya saya alami..." />
                </Field>
              )}

              <Field label="Gaya bahasa">
                <Select value={style} onChange={(e) => setStyle(e.target.value)}>
                  {STYLES.map(([v, label]) => <option key={v} value={v}>{label}</option>)}
                </Select>
              </Field>

              <Field label="Produk (opsional)" hint="Cerita tetap berguna walau tanpa produk.">
                <Select value={productId} onChange={(e) => setProductId(e.target.value)}>
                  <option value="">— tanpa produk —</option>
                  {products.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
                </Select>
              </Field>

              <div className="grid grid-cols-2 gap-3">
                <Field label="Versi" hint="Jumlah variasi">
                  <Input type="number" min={1} max={4} value={versions} onChange={(e) => setVersions(Number(e.target.value))} />
                </Field>
                <Field label="Panjang">
                  <Select value={length} onChange={(e) => setLength(Number(e.target.value))}>
                    {["Sangat pendek", "Pendek", "Sedang", "Agak panjang", "Panjang"].map((l, i) => <option key={i} value={i}>{l}</option>)}
                  </Select>
                </Field>
                <Field label="Promosi">
                  <Select value={promotion} onChange={(e) => setPromotion(Number(e.target.value))}>
                    {["Tanpa produk", "Sekilas", "Manfaat konkret", "Cukup promosional", "Fokus produk"].map((l, i) => <option key={i} value={i}>{l}</option>)}
                  </Select>
                </Field>
                <Field label="Bahasa gaul">
                  <Select value={slang} onChange={(e) => setSlang(Number(e.target.value))}>
                    {["Tanpa", "Tipis", "Wajar", "Banyak", "Sangat"].map((l, i) => <option key={i} value={i}>{l}</option>)}
                  </Select>
                </Field>
              </div>

              <Switch checked={endingQuestion} onChange={setEndingQuestion} label="Akhiri dengan pertanyaan" />

              <Button variant="primary" className="w-full" onClick={generate} loading={busy === "generate"} disabled={problem.trim().length < 5}>
                Buat cerita
              </Button>
            </div>
          </Card>

          <Card>
            <CardHeader title="Draft terbaru" subtitle={`${recent.length} draft`} />
            <div className="max-h-[420px] overflow-y-auto">
              {recent.length === 0 ? (
                <EmptyState title="Belum ada draft" description="Draft pertama Anda akan muncul di sini." />
              ) : (
                <ul className="divide-y divide-[var(--border)]">
                  {recent.map((d) => (
                    <li key={d.id}>
                      <button
                        onClick={async () => { const full = await api<Draft>(`/api/stories/${d.id}`); setSelected(full); setEditText(full.text); }}
                        className="w-full px-4 py-2.5 text-left hover:bg-ink-100"
                      >
                        <div className="flex items-center justify-between gap-2">
                          <span className="truncate text-[13px] font-medium text-ink-800">{d.title ?? "(tanpa judul)"}</span>
                          <Badge tone={statusTone(d.status)}>{d.status.toLowerCase()}</Badge>
                        </div>
                        <p className="mt-0.5 truncate text-xs text-ink-500">{d.text.slice(0, 70)}…</p>
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </Card>
        </div>

        <div className="space-y-4">
          {error && <Callout tone="red" title="Gagal">{error}</Callout>}

          {selected ? (
            <DraftEditor
              draft={selected}
              editText={editText}
              setEditText={setEditText}
              charCount={charCount}
              busy={busy}
              onSave={() => saveEdit(selected.id)}
              onAct={(a) => act(selected.id, a)}
              onClose={() => setSelected(null)}
            />
          ) : results.length === 0 ? (
            <Card>
              <EmptyState
                title="Belum ada cerita yang dibuat"
                description="Isi masalah audiens di sebelah kiri. Sistem akan membuat beberapa versi dengan sudut berbeda, lalu memeriksa klaim dan kemiripan secara otomatis."
                icon={<span className="text-3xl">✎</span>}
              />
            </Card>
          ) : (
            <div className="space-y-3">
              <p className="text-[13px] text-ink-500">{results.length} kandidat dibuat. Bandingkan lalu pilih satu untuk diedit.</p>
              {results.map((d) => (
                <Card key={d.id} className="p-5">
                  <div className="mb-2 flex flex-wrap items-center gap-2">
                    <h3 className="text-[15px] font-semibold text-ink-900">{d.title ?? "(tanpa judul)"}</h3>
                    <Badge tone={statusTone(d.status)}>{d.status.toLowerCase()}</Badge>
                    <Badge tone="blue">{d.truthMode}</Badge>
                    <Badge tone={factTone(d.factCheckStatus)}>fact: {d.factCheckStatus.toLowerCase()}</Badge>
                    <span className="mono ml-auto text-xs text-ink-500">{threadsLength(d.text)}/500</span>
                  </div>
                  <p className="prose-story">{d.text}</p>

                  {(d.lintIssues?.length ?? 0) > 0 && (
                    <div className="mt-3 space-y-1.5">
                      {d.lintIssues!.map((i, k) => (
                        <p key={k} className={`text-xs ${i.severity === "block" ? "text-danger-500" : "text-amber-soft"}`}>• {i.message}</p>
                      ))}
                    </div>
                  )}
                  {(d.duplicates?.length ?? 0) > 0 && (
                    <p className="mt-2 text-xs text-amber-soft">Mirip dengan draft lain ({Math.round((d.duplicates![0].score ?? 0) * 100)}%) — pertimbangkan variasi.</p>
                  )}

                  <div className="mt-4 flex flex-wrap gap-2">
                    <Button size="sm" onClick={() => { setSelected(d); setEditText(d.text); }}>Edit & review</Button>
                  </div>
                </Card>
              ))}
            </div>
          )}
        </div>
      </div>
    </>
  );
}

function DraftEditor({
  draft, editText, setEditText, charCount, busy, onSave, onAct, onClose,
}: {
  draft: Draft; editText: string; setEditText: (v: string) => void; charCount: number;
  busy: string | null; onSave: () => void; onAct: (a: "score" | "fact-check" | "naturalize" | "approve") => void; onClose: () => void;
}) {
  const over = charCount > 500;
  return (
    <Card>
      <CardHeader
        title={draft.title ?? "Draft"}
        subtitle={`Mode ${draft.truthMode} · revisi ${draft.currentRevision}`}
        action={<Button size="sm" variant="ghost" onClick={onClose}>Tutup</Button>}
      />
      <div className="space-y-4 p-5">
        <div className="flex flex-wrap gap-2">
          <Badge tone={statusTone(draft.status)}>{draft.status === "APPROVED" ? "disetujui" : draft.status.toLowerCase()}</Badge>
          <Badge tone={factTone(draft.factCheckStatus)}>fact-check: {draft.factCheckStatus.toLowerCase()}</Badge>
          {draft.scores?.[0]?.weightedScore != null && <Badge tone="violet">skor {draft.scores[0].weightedScore}/10</Badge>}
        </div>

        <Textarea rows={14} value={editText} onChange={(e) => setEditText(e.target.value)} className="font-[inherit] text-[15px] leading-relaxed" />
        <div className="flex items-center justify-between">
          <span className={`mono text-xs ${over ? "font-semibold text-danger-500" : "text-ink-500"}`}>{charCount}/500 karakter Threads</span>
          {over && <span className="text-xs text-danger-500">Terlalu panjang untuk satu post.</span>}
        </div>

        <div className="flex flex-wrap gap-2 border-t hairline pt-4">
          <Button size="sm" onClick={onSave} loading={busy === `save:${draft.id}`} disabled={editText === draft.text}>Simpan revisi</Button>
          <Button size="sm" onClick={() => onAct("naturalize")} loading={busy === `naturalize:${draft.id}`}>Perhalus bahasa (AI)</Button>
          <Button size="sm" onClick={() => onAct("fact-check")} loading={busy === `fact-check:${draft.id}`}>Periksa fakta</Button>
          <Button size="sm" onClick={() => onAct("score")} loading={busy === `score:${draft.id}`}>Nilai dengan rubrik</Button>
          <Button size="sm" variant="primary" onClick={() => onAct("approve")} loading={busy === `approve:${draft.id}`} disabled={draft.status === "APPROVED"}>
            {draft.status === "APPROVED" ? "Sudah disetujui" : "Setujui draft"}
          </Button>
        </div>

        {draft.status === "APPROVED" && (
          <div className="border-t hairline pt-4">
            <p className="mb-2 text-[13px] text-ink-700">
              Draft ini sudah disetujui. Kirim ke antrean untuk diperiksa dan diterbitkan;
              tautan affiliate produknya ikut terbawa otomatis.
            </p>
            <SendToQueue draftId={draft.id} />
          </div>
        )}

        <Callout tone="blue">
          Skor rubrik dipakai untuk menyaring kandidat, <strong>bukan</strong> memprediksi viralitas. Likes bukan penjualan, dan data belum cukup bukan berarti “tidak ada pemenang”.
        </Callout>
      </div>
    </Card>
  );
}
