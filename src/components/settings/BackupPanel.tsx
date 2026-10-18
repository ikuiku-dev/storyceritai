"use client";

import { useRef, useState } from "react";
import { Button, Card, CardHeader, Callout } from "@/components/ui/primitives";

/**
 * Export/import existed only as API routes, so a user had no way to back up their data
 * without curl. This gives those routes the button they were missing.
 */
export function BackupPanel() {
  const [busy, setBusy] = useState<"export" | "import" | null>(null);
  const [msg, setMsg] = useState<{ tone: "ok" | "err"; text: string } | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  async function doExport(scope: "full" | "content" | "settings") {
    setBusy("export");
    setMsg(null);
    try {
      // A normal navigation lets the browser handle the file download and its filename.
      window.location.href = `/api/export?scope=${scope}`;
      setMsg({ tone: "ok", text: "Berkas backup sedang diunduh." });
    } catch (e) {
      setMsg({ tone: "err", text: e instanceof Error ? e.message : "Gagal mengunduh." });
    } finally {
      setBusy(null);
    }
  }

  async function doImport(file: File) {
    setBusy("import");
    setMsg(null);
    try {
      const text = await file.text();
      const res = await fetch("/api/import", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: text,
      });
      const json = await res.json();
      if (!res.ok || !json.ok) throw new Error(json?.error?.message ?? "Impor gagal.");
      setMsg({ tone: "ok", text: "Data berhasil dipulihkan dari backup." });
    } catch (e) {
      setMsg({ tone: "err", text: e instanceof Error ? e.message : "Impor gagal." });
    } finally {
      setBusy(null);
      if (fileRef.current) fileRef.current.value = "";
    }
  }

  return (
    <Card>
      <CardHeader title="Backup & Restore" subtitle="Unduh seluruh data sebagai JSON, atau pulihkan dari berkas backup." />
      <div className="space-y-3 p-5">
        <Callout tone="neutral" title="Kapan ini dipakai">
          Sebelum mengubah pengaturan besar atau memindahkan aplikasi, unduh backup dulu.
          Berkas berisi cerita, produk, tautan affiliate, dan pengaturan. Kredensial tersimpan
          dalam bentuk terenkripsi.
        </Callout>

        <div className="flex flex-wrap gap-2">
          <Button variant="primary" onClick={() => doExport("full")} loading={busy === "export"}>
            Unduh backup lengkap
          </Button>
          <Button variant="ghost" onClick={() => doExport("content")} loading={busy === "export"}>
            Hanya konten
          </Button>
          <Button variant="ghost" onClick={() => doExport("settings")} loading={busy === "export"}>
            Hanya pengaturan
          </Button>
        </div>

        <div className="border-t border-ink-200/60 pt-3">
          <p className="mb-2 text-[13px] text-ink-700">
            Pulihkan dari berkas backup (.json). Maks 20 MB.
          </p>
          <input
            ref={fileRef}
            type="file"
            accept="application/json,.json"
            className="hidden"
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) void doImport(f);
            }}
          />
          <Button variant="ghost" onClick={() => fileRef.current?.click()} loading={busy === "import"}>
            Pilih berkas backup
          </Button>
        </div>

        {msg && (
          <p className={`text-[13px] ${msg.tone === "ok" ? "text-emerald-700" : "text-rose-700"}`}>
            {msg.text}
          </p>
        )}
      </div>
    </Card>
  );
}
