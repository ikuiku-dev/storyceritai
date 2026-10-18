"use client";

import { useEffect, useState } from "react";
import { api } from "@/lib/client";
import { Card, CardHeader, Button, Badge, Callout, PageHeader, Spinner, EmptyState } from "@/components/ui/primitives";

interface ConnectorHealth {
  status: string;
  checkedAt: string;
  lastSuccessAt: string | null;
  lastErrorAt: string | null;
  lastError: string | null;
  consecutiveFailures: number;
}

interface Capabilities {
  supported: string[];
  unsupported: { name: string; reason: string }[];
}

interface Connector {
  id: string;
  name: string;
  kind: string;
  accessMethod: string;
  status: string;
  configured: boolean;
  account?: string | null;
  tokenExpiresAt?: string | null;
  mode?: string;
  modeReason?: string;
  capabilities?: Capabilities;
  note?: string;
  health: ConnectorHealth | null;
}

// Status colours reflect meaning, not optimism: green only for CONNECTED.
const TONE: Record<string, "green" | "amber" | "red" | "neutral" | "violet"> = {
  CONNECTED: "green",
  LIMITED_ACCESS: "violet",
  NEEDS_AUTHORIZATION: "amber",
  RATE_LIMITED: "amber",
  TEMPORARILY_UNAVAILABLE: "amber",
  NOT_CONFIGURED: "neutral",
  PERMISSION_DENIED: "red",
  ERROR: "red",
};

const LABEL: Record<string, string> = {
  CONNECTED: "Terhubung",
  LIMITED_ACCESS: "Akses terbatas",
  NEEDS_AUTHORIZATION: "Perlu otorisasi",
  RATE_LIMITED: "Dibatasi rate",
  TEMPORARILY_UNAVAILABLE: "Sementara tidak tersedia",
  NOT_CONFIGURED: "Belum dikonfigurasi",
  PERMISSION_DENIED: "Izin ditolak",
  ERROR: "Error",
};

function rel(iso: string | null): string {
  if (!iso) return "belum pernah";
  const d = new Date(iso);
  if (d.getTime() === 0) return "belum pernah";
  const mins = Math.round((Date.now() - d.getTime()) / 60000);
  if (mins < 1) return "baru saja";
  if (mins < 60) return `${mins} menit lalu`;
  if (mins < 1440) return `${Math.round(mins / 60)} jam lalu`;
  return `${Math.round(mins / 1440)} hari lalu`;
}

export default function IntegrationsClient() {
  const [rows, setRows] = useState<Connector[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [testing, setTesting] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  async function load() {
    try {
      const r = await api<{ connectors: Connector[] }>("/api/connectors");
      setRows(r.connectors);
    } catch (e) {
      setError((e as Error).message);
    }
  }

  useEffect(() => { void load(); }, []);

  async function test(id: string) {
    setTesting(id); setError(null); setNotice(null);
    try {
      if (id === "threads") {
        const r = await api<{ status: string; detail?: string }>("/api/threads/test", { method: "POST", body: JSON.stringify({}) });
        setNotice(`Threads: ${r.status}${r.detail ? ` — ${r.detail}` : ""}`);
      } else if (id === "shopee") {
        const r = await api<{ status: string; detail: string }>("/api/shopee/test", { method: "POST", body: JSON.stringify({}) });
        setNotice(`Shopee: ${r.status} — ${r.detail}`);
      } else {
        setNotice("Konektor ini tidak punya uji koneksi jarak jauh — statusnya berasal dari data lokal.");
      }
      await load();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setTesting(null);
    }
  }

  return (
    <div className="space-y-5">
      <PageHeader
        title="Integrations Center"
        description="Status nyata setiap konektor. Hijau hanya jika panggilan API benar-benar berhasil."
      />

      {error && <Callout tone="red" title="Gagal memuat">{error}</Callout>}
      {notice && <Callout tone="blue" title="Hasil uji">{notice}</Callout>}

      {rows === null && !error && <div className="flex items-center gap-2 text-sm text-ink-500"><Spinner /> Memuat…</div>}

      {rows?.map((c) => (
        <Card key={c.id}>
          <CardHeader
            title={c.name}
            subtitle={`${c.kind} · ${c.accessMethod}`}
            action={
              <div className="flex items-center gap-2">
                <Badge tone={TONE[c.status] ?? "neutral"}>{LABEL[c.status] ?? c.status}</Badge>
                {c.id === "threads" || c.id === "shopee" ? (
                  <Button size="sm" variant="ghost" onClick={() => test(c.id)} loading={testing === c.id}>
                    Test connection
                  </Button>
                ) : null}
              </div>
            }
          />

          <div className="space-y-3 p-5 text-sm">
            <dl className="grid gap-2 text-[13px] sm:grid-cols-2">
              <div><dt className="text-ink-500">Terkonfigurasi</dt><dd>{c.configured ? "ya" : "belum"}</dd></div>
              <div><dt className="text-ink-500">Terakhir dicek</dt><dd>{rel(c.health?.checkedAt ?? null)}</dd></div>
              <div><dt className="text-ink-500">Sukses terakhir</dt><dd>{rel(c.health?.lastSuccessAt ?? null)}</dd></div>
              <div><dt className="text-ink-500">Gagal berturut-turut</dt><dd>{c.health?.consecutiveFailures ?? 0}</dd></div>
              {c.account && <div><dt className="text-ink-500">Akun</dt><dd>{c.account}</dd></div>}
              {c.mode && <div><dt className="text-ink-500">Mode</dt><dd>{c.mode}</dd></div>}
              {c.tokenExpiresAt && <div><dt className="text-ink-500">Token kedaluwarsa</dt><dd>{rel(c.tokenExpiresAt)}</dd></div>}
            </dl>

            {c.modeReason && <p className="text-[13px] text-ink-600">{c.modeReason}</p>}
            {c.note && <p className="text-[13px] text-ink-600">{c.note}</p>}
            {c.health?.lastError && (
              <Callout tone="amber" title="Error terakhir">
                {c.health.lastError}
              </Callout>
            )}

            {c.capabilities && (
              <div className="rounded-lg border hairline p-3">
                <p className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-ink-500">Kemampuan</p>
                <ul className="space-y-1 text-[13px]">
                  {c.capabilities.supported.map((s) => (
                    <li key={s} className="flex items-start gap-2">
                      <span className="text-emerald-600">✓</span>
                      <span>{s}</span>
                    </li>
                  ))}
                  {c.capabilities.unsupported.map((u) => (
                    <li key={u.name} className="flex items-start gap-2 text-ink-500">
                      <span className="text-ink-400">✕</span>
                      <span><span className="font-medium text-ink-700">{u.name}</span> — {u.reason}</span>
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        </Card>
      ))}

      {rows && rows.length === 0 && <EmptyState title="Belum ada konektor" description="Tambahkan provider AI atau hubungkan Threads untuk melihat statusnya di sini." />}

      <Callout tone="blue" title="Kenapa status bisa tetap abu-abu">
        Konektor hanya berstatus Terhubung setelah panggilan API yang benar-benar berhasil.
        Mengisi URL atau API key saja tidak mengubah status — itu memang disengaja.
      </Callout>
    </div>
  );
}
