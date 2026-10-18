"use client";

import { useState } from "react";
import { api } from "@/lib/client";
import { Card, CardHeader, Button, Field, Input, Badge, Callout, PageHeader, EmptyState } from "@/components/ui/primitives";

interface LinkResult {
  verdict: string;
  valid: boolean;
  reason: string;
  resolvedTo?: string;
  httpStatus?: number;
}

const VERDICT_TONE: Record<string, "green" | "amber" | "red" | "neutral" | "violet"> = {
  VALID_AFFILIATE: "green",
  PRODUCT_URL_NOT_AFFILIATE: "amber",
  SHORT_LINK_UNVERIFIED: "violet",
  NOT_SHOPEE: "red",
  MALFORMED: "red",
};

const VERDICT_LABEL: Record<string, string> = {
  VALID_AFFILIATE: "Tautan afiliasi valid",
  PRODUCT_URL_NOT_AFFILIATE: "URL produk, bukan afiliasi",
  SHORT_LINK_UNVERIFIED: "Tautan pendek — belum terverifikasi",
  NOT_SHOPEE: "Bukan domain Shopee",
  MALFORMED: "URL tidak valid",
};

export default function LinkManagerClient() {
  const [url, setUrl] = useState("");
  const [result, setResult] = useState<LinkResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function check() {
    setBusy(true); setError(null); setResult(null);
    try {
      const r = await api<LinkResult>("/api/shopee/link", {
        method: "POST", body: JSON.stringify({ url }),
      });
      setResult(r);
    } catch (e) { setError((e as Error).message); } finally { setBusy(false); }
  }

  return (
    <div className="space-y-5">
      <PageHeader
        title="Affiliate Link Manager"
        description="Validasi tautan yang Anda buat sendiri. Aplikasi tidak pernah mengarang parameter tracking."
      />

      {error && <Callout tone="red" title="Gagal">{error}</Callout>}

      <Card>
        <CardHeader title="Periksa tautan" subtitle="Tempel tautan afiliasi dari dasbor Shopee Affiliate Anda." />
        <div className="space-y-3 p-5">
          <Field label="URL">
            <Input value={url} onChange={(e) => setUrl(e.target.value)} placeholder="https://shopee.co.id/...?affiliate_id=..." />
          </Field>
          <Button variant="primary" onClick={check} loading={busy} disabled={url.trim().length < 8}>
            Periksa
          </Button>

          {result && (
            <div className="mt-2 space-y-2 rounded-lg border hairline p-4">
              <Badge tone={VERDICT_TONE[result.verdict] ?? "neutral"}>
                {VERDICT_LABEL[result.verdict] ?? result.verdict}
              </Badge>
              <p className="text-[13px] text-ink-700">{result.reason}</p>
              {result.resolvedTo && (
                <p className="break-all text-[12px] text-ink-500">Tujuan: {result.resolvedTo}</p>
              )}
            </div>
          )}
        </div>
      </Card>

      <Callout tone="amber" title="Kenapa URL produk biasa ditolak">
        URL produk tanpa parameter afiliasi tidak akan menghasilkan komisi. Aplikasi sengaja
        tidak menambahkan parameter sendiri — itu akan membuat tautan palsu yang terlihat sah.
        Buat tautan afiliasi di dasbor resmi, lalu tempel di sini.
      </Callout>

      <Card>
        <CardHeader title="Daftar tautan tersimpan" subtitle="Dikelola dari halaman Affiliate." />
        <EmptyState
          title="Belum ada tautan di halaman ini"
          description="Tautan yang terhubung ke produk dikelola di halaman Affiliate. Validasi di sini tidak mengubah data produk."
        />
      </Card>
    </div>
  );
}
