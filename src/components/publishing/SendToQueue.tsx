"use client";

import { useState } from "react";
import { Button, Callout } from "@/components/ui/primitives";
import { api } from "@/lib/client";

/**
 * The step between approving a draft and it appearing in the queue did not exist, so a story
 * could be approved and then go nowhere. This pulls the draft's own context (product,
 * affiliate link, disclosure) from the server rather than asking the user to retype it, then
 * POSTs to /api/posts, which runs the guardrails.
 */
export function SendToQueue({ draftId, disabled }: { draftId: string; disabled?: boolean }) {
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<{ ok: boolean; lines: string[] } | null>(null);

  async function send() {
    setBusy(true);
    setResult(null);
    try {
      const ctx = await api<{
        finalText: string;
        affiliateUrl: string | null;
        affiliateStatus: string | null;
        truthMode: string;
        factCheckStatus: string;
        disclosureText: string | null;
        requireAffiliateLink: boolean;
      }>(`/api/stories/${draftId}/publish-context`);

      const notes: string[] = [];
      if (ctx.requireAffiliateLink && !ctx.affiliateUrl) {
        setResult({
          ok: false,
          lines: ["Pengaturan mewajibkan tautan affiliate, tetapi produk cerita ini belum punya tautan aktif."],
        });
        return;
      }
      if (!ctx.affiliateUrl) notes.push("Produk ini belum punya tautan affiliate aktif — cerita akan masuk antrean tanpa tautan.");
      else if (!/(tautan|link)\s+afili|komisi|#ad|#aff|sponsored/i.test(ctx.finalText)) {
        // Same rule the server applies. Telling the user now beats a silent compliance gap.
        notes.push("Teks cerita belum menyebut tautan ini sebagai affiliate. Tambahkan disclosure sebelum menerbitkan.");
      }
      else if (ctx.affiliateStatus !== "VALID") notes.push(`Tautan affiliate belum berstatus VALID (status: ${ctx.affiliateStatus ?? "tidak diketahui"}).`);

      // Guardrails run server-side; a block returns a message we show verbatim.
      const res = await api<{
        prepared?: boolean;
        post?: { id: string; status: string };
        guard?: { ok: boolean; blocks: string[]; warnings: string[] };
      }>("/api/posts", {
        method: "POST",
        body: JSON.stringify({
          draftId,
          finalText: ctx.finalText,
          affiliateUrl: ctx.affiliateUrl,
          truthMode: ctx.truthMode,
          factCheckStatus: ctx.factCheckStatus,
        }),
      });

      // The route answers 200 with guard.ok === false when a guardrail blocks. Treating that
      // as success would tell the user their story was queued when it was not.
      if (res.guard && !res.guard.ok) {
        setResult({ ok: false, lines: res.guard.blocks });
        return;
      }
      if (!res.post) {
        setResult({ ok: false, lines: ["Server tidak mengembalikan item antrean."] });
        return;
      }
      setResult({
        ok: true,
        lines: [
          `Masuk antrean (status ${res.post.status}). Setujui di Publishing Queue untuk menerbitkan.`,
          ...notes,
          ...(res.guard?.warnings ?? []),
        ],
      });
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Gagal mengirim ke antrean.";
      setResult({ ok: false, lines: [msg] });
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-2">
      <Button size="sm" variant="primary" onClick={send} loading={busy} disabled={disabled}>
        Kirim ke antrean
      </Button>
      {result && (
        <Callout tone={result.ok ? "green" : "amber"} title={result.ok ? "Terkirim" : "Tidak terkirim"}>
          <ul className="list-disc space-y-1 pl-4">
            {result.lines.map((l, i) => (
              <li key={i}>{l}</li>
            ))}
          </ul>
        </Callout>
      )}
    </div>
  );
}
