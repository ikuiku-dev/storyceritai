"use client";

import { useEffect, useState } from "react";
import { api } from "@/lib/client";
import { Card, CardHeader, Button, Field, Input, Switch, Badge, Callout, PageHeader } from "@/components/ui/primitives";

interface Policy {
  maxPostsPerDay: number;
  minGapMinutes: number;
  maxQueuedPosts: number;
  requireFactCheck: boolean;
  requireValidLink: boolean;
  budgetLimitUsd: number | null;
  killSwitch: boolean;
  autoPublishEnabled: boolean;
}

export default function AutomationRulesClient() {
  const [p, setP] = useState<Policy | null>(null);
  const [missing, setMissing] = useState<string[]>([]);
  const [ready, setReady] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | false>(false);
  const [confirmAuto, setConfirmAuto] = useState(false);

  async function load() {
    try {
      const r = await api<{ policy: Policy; autoPublishReady: boolean; autoPublishMissing: string[] }>("/api/policy");
      setP(r.policy);
      setReady(r.autoPublishReady);
      setMissing(r.autoPublishMissing);
    } catch (e) { setError((e as Error).message); }
  }

  useEffect(() => { void load(); }, []);

  async function save(patch: Partial<Policy> & { confirm?: boolean }) {
    setBusy("save"); setError(null); setNotice(null);
    try {
      await api("/api/policy", { method: "PATCH", body: JSON.stringify(patch) });
      setNotice("Kebijakan tersimpan.");
      await load();
    } catch (e) { setError((e as Error).message); } finally { setBusy(false); }
  }

  async function killSwitch(on: boolean) {
    setBusy("kill"); setError(null); setNotice(null);
    try {
      if (on) {
        await api("/api/publishing/pause", { method: "POST", body: JSON.stringify({ action: "pause_all" }) });
        setNotice("PAUSE ALL AUTOMATION aktif. Tidak ada publikasi baru.");
      } else {
        const r = await api<{ missing?: string[] }>("/api/policy/resume", { method: "POST", body: JSON.stringify({}) });
        setNotice(r.missing?.length ? `Belum bisa dilanjutkan: ${r.missing.join(" ")}` : "Automation dilanjutkan.");
      }
      await load();
    } catch (e) { setError((e as Error).message); } finally { setBusy(false); }
  }

  if (!p) return <div className="p-5 text-sm text-ink-500">Memuat…</div>;

  return (
    <div className="space-y-5">
      <PageHeader
        title="Automation Rules"
        description="Default konservatif. Auto-publish tidak pernah aktif sendiri."
      />

      {error && <Callout tone="red" title="Gagal">{error}</Callout>}
      {notice && <Callout tone="blue" title="Status">{notice}</Callout>}

      <Card>
        <CardHeader
          title="Kill switch"
          subtitle="Menghentikan seluruh publikasi seketika."
          action={<Badge tone={p.killSwitch ? "red" : "green"}>{p.killSwitch ? "AKTIF — semua berhenti" : "nonaktif"}</Badge>}
        />
        <div className="flex flex-wrap gap-2 p-5">
          <Button variant="danger" onClick={() => killSwitch(true)} loading={busy === "kill"} disabled={p.killSwitch}>
            PAUSE ALL AUTOMATION
          </Button>
          <Button variant="ghost" onClick={() => killSwitch(false)} loading={busy === "kill"} disabled={!p.killSwitch}>
            Resume automation
          </Button>
        </div>
      </Card>

      <Card>
        <CardHeader title="Batas konservatif" subtitle="Angka ini batas aplikasi, bukan batas resmi Threads." />
        <div className="grid gap-4 p-5 sm:grid-cols-3">
          <Field label="Maks posting/hari">
            <Input type="number" min={1} max={10} defaultValue={p.maxPostsPerDay}
              onBlur={(e) => save({ maxPostsPerDay: Number(e.target.value) })} />
          </Field>
          <Field label="Jarak minimum (menit)">
            <Input type="number" min={60} max={1440} defaultValue={p.minGapMinutes}
              onBlur={(e) => save({ minGapMinutes: Number(e.target.value) })} />
          </Field>
          <Field label="Maks antrean">
            <Input type="number" min={1} max={20} defaultValue={p.maxQueuedPosts}
              onBlur={(e) => save({ maxQueuedPosts: Number(e.target.value) })} />
          </Field>
        </div>
        <div className="space-y-3 border-t hairline p-5">
          <Switch checked={p.requireFactCheck} onChange={(v) => save({ requireFactCheck: v })} label="Wajib fact-check lulus sebelum terbit" />
          <Switch checked={p.requireValidLink} onChange={(v) => save({ requireValidLink: v })} label="Wajib tautan afiliasi valid" />
        </div>
      </Card>

      <Card>
        <CardHeader
          title="Controlled Auto-Publish"
          subtitle="Hanya aktif setelah prasyarat terpenuhi dan Anda mengonfirmasi."
          action={<Badge tone={p.autoPublishEnabled ? "red" : "neutral"}>{p.autoPublishEnabled ? "AKTIF" : "nonaktif"}</Badge>}
        />
        <div className="space-y-3 p-5">
          {!ready && (
            <Callout tone="amber" title="Prasyarat belum terpenuhi">
              <ul className="ml-4 list-disc space-y-1">
                {missing.map((m) => <li key={m}>{m}</li>)}
              </ul>
            </Callout>
          )}

          <Switch
            checked={confirmAuto}
            onChange={setConfirmAuto}
            label="Saya sudah membaca aturan dan ingin mengaktifkan publikasi otomatis"
            disabled={!ready || p.autoPublishEnabled}
          />

          <Button
            variant="danger"
            disabled={!ready || !confirmAuto || p.autoPublishEnabled}
            loading={busy === "save"}
            onClick={() => save({ autoPublishEnabled: true, confirm: true })}
          >
            Aktifkan auto-publish
          </Button>

          {p.autoPublishEnabled && (
            <Button variant="ghost" onClick={() => save({ autoPublishEnabled: false })} loading={busy === "save"}>
              Matikan auto-publish
            </Button>
          )}

          <p className="text-xs leading-relaxed text-ink-500">
            Server tetap menolak permintaan tanpa <code>confirm: true</code> dan tanpa prasyarat nyata.
            Tombol yang nonaktif di sini mencerminkan keputusan server, bukan sekadar tampilan.
          </p>
        </div>
      </Card>

      <Callout tone="blue" title="Mode saat ini">
        Selama auto-publish nonaktif, setiap cerita tetap harus disetujui manual. Kebijakan
        diperiksa ulang tepat sebelum terbit — persetujuan bukan kata terakhir.
      </Callout>
    </div>
  );
}
