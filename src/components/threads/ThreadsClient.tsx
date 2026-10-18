"use client";
import { useEffect, useState } from "react";
import { api } from "@/lib/client";
import { Card, CardHeader, Button, Field, Input, Textarea, Badge, Callout, PageHeader, EmptyState, Table, Td, type Tone } from "@/components/ui/primitives";
import { DT, threadsLength } from "@/lib/format";

interface Conn { configuredOnServer: boolean; status: string; accountName: string | null; scopes: string | null; expiresAt: string | null; lastRefreshAt: string | null; lastError: string | null }
interface DraftOpt { id: string; title: string | null; text: string; truthMode: string; factCheckStatus: string }
interface Post {
  id: string; finalText: string; status: string; remotePostId: string | null;
  publishedAt: string | null; scheduledAt: string | null; failedReason: string | null;
  disclosureIncluded: boolean; affiliateUrl: string | null; metrics: { views: number | null; likes: number | null; replies: number | null }[];
}

const stTone = (s: string): Tone => (s === "PUBLISHED" ? "green" : s === "FAILED" ? "red" : s === "WAITING_APPROVAL" ? "amber" : s === "APPROVED" || s === "SCHEDULED" ? "blue" : "neutral");

export function ThreadsClient() {
  const [conn, setConn] = useState<Conn | null>(null);
  // App credentials are pasted here and stored encrypted in the database — no .env editing.
  const [appCfg, setAppCfg] = useState<{ appIdMask: string | null; hasSecret: boolean; redirectUri: string | null; source: string } | null>(null);
  const [fAppId, setFAppId] = useState("");
  const [fSecret, setFSecret] = useState("");
  const [fRedirect, setFRedirect] = useState("");
  const [showCreds, setShowCreds] = useState(false);
  const [posts, setPosts] = useState<Post[]>([]);
  const [drafts, setDrafts] = useState<DraftOpt[]>([]);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [text, setText] = useState("");
  const [affUrl, setAffUrl] = useState("");
  const [disclosure, setDisclosure] = useState(true);
  const [truthMode, setTruthMode] = useState("HYPOTHETICAL");
  const [factStatus, setFactStatus] = useState("NOT_RUN");

  async function saveAppConfig() {
    setError(null); setBusy("savedApp");
    try {
      await api("/api/threads/app-config", {
        method: "POST",
        body: JSON.stringify({
          appId: fAppId.trim(),
          appSecret: fSecret.trim(),
          redirectUri: (fRedirect || appCfg?.redirectUri || "").trim(),
        }),
      });
      // Clear the secret from React state as soon as it is persisted.
      setFSecret(""); setFAppId(""); setFRedirect(""); setShowCreds(false);
      setNotice("Kredensial tersimpan. Lanjut klik Hubungkan akun Threads.");
      await load();
    } catch (e) { setError((e as Error).message); } finally { setBusy(null); }
  }

  async function load() {
    try {
      const [c, p, d] = await Promise.all([
        api<Conn>("/api/threads/connection"),
        api<Post[]>("/api/posts"),
        api<DraftOpt[]>("/api/stories?status=APPROVED"),
      ]);
      setConn(c); setPosts(p); setDrafts(d);
    } catch (e) { setError((e as Error).message); }
  }
  useEffect(() => { void load(); }, []);

  async function connect() {
    setError(null);
    try {
      const r = await api<{ configured: boolean; url: string | null; message?: string }>("/api/threads/authorize");
      if (!r.configured || !r.url) { setError(r.message ?? "Threads belum dikonfigurasi."); return; }
      window.location.href = r.url;
    } catch (e) { setError((e as Error).message); }
  }

  async function test() {
    setError(null); setBusy("test"); setNotice(null);
    try { const r = await api<{ username: string }>("/api/threads/test", { method: "POST" }); setNotice(`Token valid — akun ${r.username ?? "-"} bisa dibaca.`); }
    catch (e) { setError((e as Error).message); } finally { setBusy(null); }
  }

  async function prepare() {
    setError(null); setBusy("prep"); setNotice(null);
    try {
      const r = await api<{ prepared: boolean; guard?: { blocks: string[]; warnings: string[] }; post?: Post }>("/api/posts", {
        method: "POST",
        body: JSON.stringify({ finalText: text, affiliateUrl: affUrl || null, disclosureIncluded: disclosure, truthMode, factCheckStatus: factStatus }),
      });
      if (!r.prepared) { setError(r.guard?.blocks.join(" · ") ?? "Diblokir."); return; }
      setNotice("Postingan disiapkan (menunggu persetujuan)."); setText(""); await load();
    } catch (e) { setError((e as Error).message); } finally { setBusy(null); }
  }

  async function act(id: string, action: "approve" | "publish" | "metrics") {
    setError(null); setBusy(`${action}:${id}`); setNotice(null);
    try {
      if (action === "publish") {
        await api("/api/threads/publish", { method: "POST", body: JSON.stringify({ postId: id, confirm: true }) });
        setNotice("Terkirim. Periksa akun Threads Anda.");
      } else if (action === "approve") {
        await api(`/api/posts/${id}/approve`, { method: "POST", body: JSON.stringify({}) });
        setNotice("Disetujui. Belum terbit — publikasi tetap manual.");
      } else {
        const m = await api<{ views: number | null }>(`/api/posts/${id}/metrics`, { method: "POST" });
        setNotice(`Metrik diambil. Views: ${m.views ?? "tidak tersedia"}.`);
      }
      await load();
    } catch (e) { setError((e as Error).message); } finally { setBusy(null); }
  }

  const charCount = threadsLength(text);

  return (
    <>
      <PageHeader title="Threads Integration" description="Koneksi resmi via OAuth. Tidak ada publikasi tanpa persetujuan eksplisit Anda." />

      {error && <div className="mb-4"><Callout tone="red" title="Gagal">{error}</Callout></div>}
      {notice && <div className="mb-4"><Callout tone="green">{notice}</Callout></div>}

      <Card>
        <CardHeader title="Koneksi" subtitle={conn?.accountName ?? "Belum ada akun terhubung"}
          action={<Badge tone={conn?.status === "CONNECTED" ? "green" : conn?.status === "EXPIRED" ? "amber" : "neutral"}>{conn?.status === "CONNECTED" ? "terhubung" : conn?.status === "EXPIRED" ? "kedaluwarsa" : "belum terhubung"}</Badge>} />
        <div className="space-y-3 p-5">
          {/* Credentials are entered here and saved encrypted; no .env editing or restart. */}
          {(showCreds || !conn?.configuredOnServer || !appCfg?.hasSecret) && (
            <div className="rounded-lg border hairline bg-[#fbfcfd] p-4">
              <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
                <p className="text-[13px] font-medium text-ink-900">Kredensial App Meta</p>
                {appCfg?.hasSecret ? <Badge tone="green">tersimpan</Badge> : <Badge tone="amber">belum diisi</Badge>}
              </div>
              <p className="mb-3 text-[12px] leading-relaxed text-ink-500">
                Buat app dengan use case <span className="font-medium">Threads</span> di{" "}
                <a className="text-brand-700 underline" href="https://developers.facebook.com/apps" target="_blank" rel="noreferrer">Meta for Developers</a>,
                lalu tempel nilainya di sini. App Secret disimpan <span className="font-medium">terenkripsi</span> dan tidak pernah dikirim balik ke browser.
              </p>
              <div className="grid gap-3 sm:grid-cols-2">
                <Field label="App ID" required hint={appCfg?.appIdMask ? `tersimpan: ${appCfg.appIdMask}` : undefined}>
                  <Input value={fAppId} onChange={(e) => setFAppId(e.target.value)} placeholder="1234567890" autoComplete="off" />
                </Field>
                <Field label="App Secret" required hint={appCfg?.hasSecret ? "terenkripsi — isi ulang untuk mengganti" : undefined}>
                  <Input type="password" value={fSecret} onChange={(e) => setFSecret(e.target.value)} placeholder="••••••••" autoComplete="new-password" />
                </Field>
              </div>
              <div className="mt-3">
                <Field label="Redirect URI" required hint="Harus HTTPS dan berakhir /api/threads/callback — cocok persis dengan yang didaftarkan di Meta.">
                  <Input value={fRedirect || appCfg?.redirectUri || ""} onChange={(e) => setFRedirect(e.target.value)} placeholder="https://domain-anda/api/threads/callback" />
                </Field>
              </div>
              <div className="mt-3 flex flex-wrap items-center gap-2">
                <Button variant="primary" size="sm" loading={busy === "savedApp"} onClick={saveAppConfig}
                  disabled={!fAppId.trim() || !fSecret.trim() || !(fRedirect || appCfg?.redirectUri)}>
                  Simpan kredensial
                </Button>
                {appCfg?.hasSecret && (
                  <Button size="sm" variant="ghost" onClick={() => setShowCreds(!showCreds)}>
                    {showCreds ? "Tutup" : "Ganti kredensial"}
                  </Button>
                )}
              </div>
            </div>
          )}
          {conn?.configuredOnServer && conn.status !== "CONNECTED" && (
            <Button variant="primary" onClick={connect}>Hubungkan akun Threads</Button>
          )}
          {conn?.status === "CONNECTED" && (
            <div className="flex flex-wrap items-center gap-3">
              <span className="text-[13px] text-ink-600">Kedaluwarsa: {DT(conn.expiresAt)}</span>
              <Button size="sm" onClick={test} loading={busy === "test"}>Test Connection</Button>
              <Button size="sm" onClick={async () => { await api("/api/threads/refresh", { method: "POST" }); setNotice("Token diperbarui."); await load(); }}>Refresh token</Button>
              <Button size="sm" variant="danger" onClick={async () => { await api("/api/threads/disconnect", { method: "POST" }); setNotice("Terputus; token dihapus."); await load(); }}>Putuskan</Button>
            </div>
          )}
          <p className="text-xs leading-relaxed text-ink-500">Token disimpan terenkripsi (AES-256-GCM) dengan kunci dari <code className="mono">CERITALAB_SECRET</code>, tidak pernah dikirim ke browser.</p>
        </div>
      </Card>

      <div className="mt-4 grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader title="Siapkan postingan" subtitle="Tidak langsung terbit — masuk antrean persetujuan." />
          <div className="space-y-3 p-5">
            <Field label="Teks final" required hint={`${charCount}/500 karakter Threads`}>
              <Textarea rows={7} value={text} onChange={(e) => setText(e.target.value)} placeholder="Tempel atau tulis teks final di sini..." className={charCount > 500 ? "border-danger-500" : ""} />
            </Field>
            <Field label="Tautan affiliate"><Input value={affUrl} onChange={(e) => setAffUrl(e.target.value)} placeholder="https://shope.ee/..." /></Field>
            <div className="grid grid-cols-2 gap-3">
              <Field label="Mode kebenaran">
                <select className="w-full rounded-lg border hairline bg-white px-3 h-9.5 text-sm" value={truthMode} onChange={(e) => setTruthMode(e.target.value)}>
                  {["HYPOTHETICAL", "REAL_EXPERIENCE", "SOURCE_BASED", "OPINION", "PRODUCT_EXPLAINER"].map((m) => <option key={m} value={m}>{m}</option>)}
                </select>
              </Field>
              <Field label="Status fact-check">
                <select className="w-full rounded-lg border hairline bg-white px-3 h-9.5 text-sm" value={factStatus} onChange={(e) => setFactStatus(e.target.value)}>
                  {["NOT_RUN", "PASSED", "WARNINGS", "FAILED"].map((m) => <option key={m} value={m}>{m}</option>)}
                </select>
              </Field>
            </div>
            <label className="flex items-center gap-2 text-[13px] text-ink-700">
              <input type="checkbox" checked={disclosure} onChange={(e) => setDisclosure(e.target.checked)} className="h-4 w-4" />
              Sertakan disclosure affiliate
            </label>
            <Button variant="primary" onClick={prepare} loading={busy === "prep"} disabled={!text.trim() || charCount > 500}>Siapkan postingan</Button>
            {drafts.length > 0 && <p className="text-xs text-ink-500">{drafts.length} draft berstatus APPROVED siap dijadikan postingan.</p>}
          </div>
        </Card>

        <Card>
          <CardHeader title="Antrean publikasi" subtitle={`${posts.length} postingan`} />
          {posts.length === 0 ? (
            <EmptyState title="Belum ada postingan" description="Siapkan postingan di sebelah kiri. Setiap postingan harus disetujui sebelum bisa diterbitkan." />
          ) : (
            <Table head={["Teks", "Status", "Aksi"]}>
              {posts.map((p) => (
                <tr key={p.id}>
                  <Td><p className="max-w-[280px] truncate">{p.finalText.slice(0, 80)}</p></Td>
                  <Td>
                    <Badge tone={stTone(p.status)}>{p.status.toLowerCase().replace(/_/g, " ")}</Badge>
                    {p.failedReason && <p className="mt-1 max-w-[200px] text-[11px] text-danger-500">{p.failedReason.slice(0, 80)}</p>}
                  </Td>
                  <Td>
                    <div className="flex flex-wrap gap-1">
                      {p.status === "WAITING_APPROVAL" && <Button size="sm" onClick={() => act(p.id, "approve")} loading={busy === `approve:${p.id}`}>Setujui</Button>}
                      {p.status === "APPROVED" && <Button size="sm" variant="primary" onClick={() => act(p.id, "publish")} loading={busy === `publish:${p.id}`}>Terbitkan</Button>}
                      {p.status === "PUBLISHED" && <Button size="sm" variant="ghost" onClick={() => act(p.id, "metrics")} loading={busy === `metrics:${p.id}`}>Ambil metrik</Button>}
                    </div>
                  </Td>
                </tr>
              ))}
            </Table>
          )}
        </Card>
      </div>
    </>
  );
}
