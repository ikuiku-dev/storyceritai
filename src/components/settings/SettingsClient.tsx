"use client";
import { useEffect, useState } from "react";
import { api } from "@/lib/client";
import { Card, CardHeader, Button, Field, Input, Textarea, Select, Badge, Callout, PageHeader, Switch, Spinner } from "@/components/ui/primitives";
import { BackupPanel } from "@/components/settings/BackupPanel";

interface Settings {
  publishingMode: string; autoPublishEnabled: boolean; maxPostsPerDay: number; minGapMinutes: number;
  requireAffiliateLink: boolean; requireFactCheckPass: boolean; disclosureText: string; disclosureEnabled: boolean;
  aiContentLabelEnabled: boolean; timezone: string; dailyBudgetUsd: number | null; monthlyBudgetUsd: number | null;
}

const MODES: [string, string, string][] = [
  ["DRAFT_ONLY", "Draft saja", "Semua publikasi diblokir. Paling aman untuk eksplorasi."],
  ["MANUAL_APPROVAL", "Persetujuan manual", "Setiap posting harus Anda setujui dan terbitkan sendiri."],
  ["SCHEDULED_APPROVAL", "Jadwal setelah disetujui", "Disetujui lalu terbit sesuai jadwal."],
  ["AUTO_PUBLISH", "Auto-publish", "Menerbitkan otomatis. Butuh pengaktifan eksplisit."],
];

export function SettingsClient() {
  const [s, setS] = useState<Settings | null>(null);
  // string when a specific action is in flight, false otherwise — lets each button
  // show its own spinner without a second state variable.
  const [busy, setBusy] = useState<string | false>(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      try { setS(await api<Settings>("/api/settings")); } catch (e) { setError((e as Error).message); }
    })();
  }, []);

  function update<K extends keyof Settings>(k: K, v: Settings[K]) {
    setS((prev) => (prev ? { ...prev, [k]: v } : prev));
  }

  async function emergency(action: "pause_all" | "resume" | "cancel_scheduled") {
    setBusy(action); setError(null); setNotice(null);
    try {
      const r = await api<{ message?: string; cancelled?: number; mode?: string }>("/api/publishing/pause", {
        method: "POST", body: JSON.stringify({ action }),
      });
      if (action === "pause_all") setNotice(r.message ?? "Auto-publish dihentikan.");
      else if (action === "cancel_scheduled") setNotice(`${r.cancelled ?? 0} postingan dibatalkan.`);
      else setNotice("Mode persetujuan manual aktif.");
      setS(await api<Settings>("/api/settings"));
    } catch (e) { setError((e as Error).message); } finally { setBusy(false); }
  }

  async function save() {
    if (!s) return;
    setBusy("save"); setError(null); setNotice(null);
    try {
      const payload: Record<string, unknown> = { ...s };
      if (s.publishingMode === "AUTO_PUBLISH" && !s.autoPublishEnabled) {
        payload.autoPublishEnabled = false;
      }
      setS(await api<Settings>("/api/settings", { method: "PATCH", body: JSON.stringify(payload) }));
      setNotice("Pengaturan disimpan.");
    } catch (e) { setError((e as Error).message); } finally { setBusy(false); }
  }

  if (!s) {
    return (
      <div className="flex items-center gap-2 p-8 text-sm text-ink-500">
        <Spinner /> Memuat pengaturan…
      </div>
    );
  }

  return (
    <>
      <PageHeader title="Settings" description="Kontrol publikasi, pengungkapan, dan anggaran. Perubahan dicatat di audit log." />

      {error && <div className="mb-4"><Callout tone="red" title="Gagal menyimpan">{error}</Callout></div>}
      {notice && <div className="mb-4"><Callout tone="green">{notice}</Callout></div>}

      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader title="Mode publikasi" subtitle={MODES.find((m) => m[0] === s.publishingMode)?.[2]} />
          <div className="space-y-3 p-5">
            <Field label="Mode">
              <Select value={s.publishingMode} onChange={(e) => update("publishingMode", e.target.value)}>
                {MODES.map(([v, label]) => <option key={v} value={v}>{label}</option>)}
              </Select>
            </Field>
            <Switch checked={s.autoPublishEnabled} onChange={(v) => update("autoPublishEnabled", v)} label="Aktifkan auto-publish (berisiko)" />
            {s.autoPublishEnabled && (
              <Callout tone="amber" title="Auto-publish aktif">
                Postingan akan terbit tanpa Anda menekan tombol. Pastikan guardrail faktual sudah Anda percaya.
              </Callout>
            )}
            <div className="grid grid-cols-2 gap-3">
              <Field label="Maks posting/hari"><Input type="number" min={1} max={50} value={s.maxPostsPerDay} onChange={(e) => update("maxPostsPerDay", Number(e.target.value))} /></Field>
              <Field label="Jarak minimal (menit)"><Input type="number" min={5} max={1440} value={s.minGapMinutes} onChange={(e) => update("minGapMinutes", Number(e.target.value))} /></Field>
            </div>
            <div className="space-y-2 border-t hairline pt-3">
              <Switch checked={s.requireFactCheckPass} onChange={(v) => update("requireFactCheckPass", v)} label="Wajib fact-check sebelum terbit" />
              <Switch checked={s.requireAffiliateLink} onChange={(v) => update("requireAffiliateLink", v)} label="Wajib ada tautan affiliate" />
            </div>
          </div>
        </Card>

        <Card>
          <CardHeader title="Pengungkapan & label" subtitle="Kewajiban transparansi kepada pembaca." />
          <div className="space-y-3 p-5">
            <Switch checked={s.disclosureEnabled} onChange={(v) => update("disclosureEnabled", v)} label="Sertakan teks pengungkapan affiliate" />
            <Field label="Teks pengungkapan" hint="Ditempel ke postingan yang memuat tautan affiliate.">
              <Textarea rows={3} value={s.disclosureText} onChange={(e) => update("disclosureText", e.target.value)} />
            </Field>
            <Switch checked={s.aiContentLabelEnabled} onChange={(v) => update("aiContentLabelEnabled", v)} label="Tandai konten yang dibantu AI (opsional)" />
            <Field label="Zona waktu"><Input value={s.timezone} onChange={(e) => update("timezone", e.target.value)} /></Field>
          </div>
        </Card>

        <Card>
          <CardHeader title="Anggaran AI" subtitle="Kosongkan untuk tanpa batas. Nilai kosong berarti tidak diketahui, bukan nol." />
          <div className="grid grid-cols-2 gap-3 p-5">
            <Field label="Batas harian (USD)">
              <Input type="number" min={0} step="0.01" value={s.dailyBudgetUsd ?? ""} onChange={(e) => update("dailyBudgetUsd", e.target.value === "" ? null : Number(e.target.value))} placeholder="tanpa batas" />
            </Field>
            <Field label="Batas bulanan (USD)">
              <Input type="number" min={0} step="0.01" value={s.monthlyBudgetUsd ?? ""} onChange={(e) => update("monthlyBudgetUsd", e.target.value === "" ? null : Number(e.target.value))} placeholder="tanpa batas" />
            </Field>
          </div>
        </Card>

        <Card>
          <CardHeader title="Ringkasan" />
          <div className="space-y-2 p-5 text-[13px] text-ink-700">
            <p>Mode: <Badge tone={s.publishingMode === "AUTO_PUBLISH" ? "amber" : "green"}>{s.publishingMode}</Badge></p>
            <p>Batas: {s.maxPostsPerDay}/hari · jarak {s.minGapMinutes} menit</p>
            <p>Fact-check wajib: {s.requireFactCheckPass ? "ya" : "tidak"}</p>
            <p>Anggaran: {s.dailyBudgetUsd != null ? `$${s.dailyBudgetUsd}/hari` : "tanpa batas"} · {s.monthlyBudgetUsd != null ? `$${s.monthlyBudgetUsd}/bulan` : "tanpa batas"}</p>
            <Button variant="primary" onClick={save} loading={busy === "save"} className="mt-2 w-full">Simpan pengaturan</Button>
          </div>
        </Card>

        <Card>
          <CardHeader title="Kontrol darurat" subtitle="Menghentikan publikasi otomatis seketika. Dicatat di audit log." />
          <div className="space-y-3 p-5">
            <Callout tone="amber" title="Kenapa ini ada">
              Jika sesuatu terasa salah, hentikan dulu. Pause All mematikan auto-publish dan
              mengembalikan postingan terjadwal ke antrean persetujuan — tidak ada yang terbit tanpa Anda.
            </Callout>
            <div className="flex flex-wrap gap-2">
              <Button variant="danger" onClick={() => emergency("pause_all")} loading={busy === "pause_all"}>Pause All</Button>
              <Button variant="ghost" onClick={() => emergency("cancel_scheduled")} loading={busy === "cancel_scheduled"}>Cancel Scheduled Posts</Button>
              <Button variant="ghost" onClick={() => emergency("resume")} loading={busy === "resume"}>Lanjutkan (manual)</Button>
            </div>
            <p className="text-xs leading-relaxed text-ink-500">
              &quot;Lanjutkan&quot; hanya mengembalikan mode ke persetujuan manual — tidak pernah menyalakan auto-publish kembali.
            </p>
          </div>
        </Card>

        <BackupPanel />
      </div>
    </>
  );
}
