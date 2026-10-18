"use client";
import { ModelPicker } from "@/components/providers/ModelPicker";
import { useEffect, useState } from "react";
import { api } from "@/lib/client";
import { Card, CardHeader, Button, Field, Input, Textarea, Select, Badge, Callout, PageHeader, Switch, Spinner } from "@/components/ui/primitives";

interface Provider {
  id: string; name: string; protocol: string; baseUrl: string; model: string; apiKeyMask: string | null;
  active: boolean; isFallback: boolean; timeoutMs: number; maxOutputTokens: number; maxRetries: number;
  priceInputPer1M: number | null; priceOutputPer1M: number | null;
  lastTestOk: boolean | null; lastTestError: string | null; lastTestedAt: string | null;
}
interface RoleConfig { role: string; providerId: string; provider: { name: string; model: string } }

const ROLES: [string, string][] = [
  ["research_extractor", "Research Extractor"],
  ["audience_analyst", "Audience Analyst"],
  ["story_writer", "Story Writer"],
  ["naturalness_editor", "Naturalness Editor"],
  ["critical_reviewer", "Critical Reviewer"],
  ["product_matcher", "Product Matcher"],
  ["experiment_analyzer", "Experiment Analyzer"],
  ["final_validator", "Final Validator"],
];

export function ProvidersClient() {
  const [providers, setProviders] = useState<Provider[]>([]);
  const [roles, setRoles] = useState<RoleConfig[]>([]);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const [name, setName] = useState("");
  const [baseUrl, setBaseUrl] = useState("https://api.openai.com/v1");
  const [model, setModel] = useState("");
  const [apiKey, setApiKey] = useState("");
  const [protocol, setProtocol] = useState("openai_compatible");
  // Which saved provider is having its model changed, and the catalogue for it.
  const [editing, setEditing] = useState<string | null>(null);
  const [cat, setCat] = useState<{ loading: boolean; models: string[]; error: string | null }>({ loading: false, models: [], error: null });

  async function openModels(p: Provider) {
    setEditing(p.id); setCat({ loading: true, models: [], error: null });
    try {
      const r = await api<{ models: string[] }>(`/api/providers/${p.id}/models`);
      setCat({ loading: false, models: r.models ?? [], error: null });
    } catch (e) {
      setCat({ loading: false, models: [], error: (e as Error).message });
    }
  }

  async function setModelFor(p: Provider, model: string) {
    try {
      await api(`/api/providers/${p.id}`, { method: "PATCH", body: JSON.stringify({ model }) });
      setEditing(null);
      setNotice(`Model ${p.name} diganti ke ${model}. Jalankan Test Model.`);
      await load();
    } catch (e) { setError((e as Error).message); }
  }

  async function load() {
    try {
      const [p, r] = await Promise.all([api<Provider[]>("/api/providers"), api<RoleConfig[]>("/api/provider-roles")]);
      setProviders(p); setRoles(r);
    } catch (e) { setError((e as Error).message); }
  }
  useEffect(() => { void load(); }, []);

  async function add() {
    setError(null); setBusy("add");
    try {
      await api("/api/providers", {
        method: "POST",
        body: JSON.stringify({ name, protocol, baseUrl, model, apiKey: apiKey || undefined, active: true }),
      });
      setName(""); setModel(""); setApiKey("");
      setNotice("Provider ditambahkan. Jalankan Test Connection.");
      await load();
    } catch (e) { setError((e as Error).message); } finally { setBusy(null); }
  }

  async function act(id: string, action: "conn" | "model", url: string) {
    setError(null); setBusy(`${action}:${id}`); setNotice(null);
    try {
      const r = await api<{ ok: boolean; message?: string; reply?: string; latencyMs?: number }>(url, { method: "POST" });
      if (r.ok) setNotice(`Berhasil (${r.latencyMs}ms)${r.reply ? `: ${r.reply.slice(0, 60)}` : ""}`);
      else setError(r.message ?? "Gagal");
      await load();
    } catch (e) { setError((e as Error).message); } finally { setBusy(null); }
  }

  async function assign(role: string, providerId: string) {
    if (!providerId) return;
    setError(null);
    try { await api("/api/provider-roles", { method: "POST", body: JSON.stringify({ role, providerId }) }); setNotice(`Model untuk ${role} diatur.`); await load(); }
    catch (e) { setError((e as Error).message); }
  }

  return (
    <>
      <PageHeader title="AI Providers" description="Provider netral: OpenAI-compatible, lokal (Ollama/LM Studio), atau mock. Kunci dienkripsi dan tidak pernah dikirim ke browser." />

      {error && <div className="mb-4"><Callout tone="red" title="Gagal">{error}</Callout></div>}
      {notice && <div className="mb-4"><Callout tone="green">{notice}</Callout></div>}

      <div className="grid gap-4 lg:grid-cols-[360px_1fr]">
        <Card>
          <CardHeader title="Tambah provider" />
          <div className="space-y-3 p-5">
            <Field label="Nama" required><Input value={name} onChange={(e) => setName(e.target.value)} placeholder="OpenAI / Ollama lokal" /></Field>
            <Field label="Protokol">
              <Select value={protocol} onChange={(e) => setProtocol(e.target.value)}>
                <option value="openai_compatible">OpenAI-compatible</option>
                <option value="mock">Mock (tanpa jaringan)</option>
              </Select>
            </Field>
            <Field label="Base URL" required hint="Contoh: https://api.openai.com/v1 atau http://localhost:11434/v1">
              <Input value={baseUrl} onChange={(e) => setBaseUrl(e.target.value)} />
            </Field>
            <Field label="Model" required hint="Daftar diambil dari Base URL + API key di atas, jadi hanya model yang bisa dipakai kunci Anda yang muncul.">
              <ModelPicker
                baseUrl={baseUrl}
                apiKey={apiKey}
                protocol={protocol}
                value={model}
                onChange={setModel}
              />
            </Field>
            <Field label="API key" hint="Disimpan terenkripsi. Kosongkan untuk provider lokal tanpa auth.">
              <Input type="password" value={apiKey} onChange={(e) => setApiKey(e.target.value)} autoComplete="off" />
            </Field>
            <Button variant="primary" onClick={add} loading={busy === "add"} disabled={!name.trim() || !model.trim()}>Tambah provider</Button>
          </div>
        </Card>

        <div className="space-y-4">
          <Card>
            <CardHeader title="Provider terdaftar" subtitle={`${providers.length} provider`} />
            {providers.length === 0 ? (
              <p className="px-5 py-8 text-center text-sm text-ink-500">Belum ada provider. Tambahkan mock provider untuk mencoba tanpa kunci.</p>
            ) : (
              <ul className="divide-y divide-[var(--border)]">
                {providers.map((p) => (
                  <li key={p.id} className="px-5 py-3">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="text-[14px] font-medium text-ink-900">{p.name}</span>
                      <Badge tone={p.active ? "green" : "neutral"}>{p.active ? "aktif" : "nonaktif"}</Badge>
                      {p.isFallback && <Badge tone="blue">fallback</Badge>}
                      {p.lastTestOk === true && <Badge tone="green">tes ok</Badge>}
                      {p.lastTestOk === false && <Badge tone="red">tes gagal</Badge>}
                    </div>
                    <p className="mono mt-0.5 text-[11.5px] text-ink-500">{p.protocol} · {p.model} · {p.baseUrl}</p>
                    {p.apiKeyMask && <p className="mono text-[11px] text-ink-400">kunci: {p.apiKeyMask}</p>}
                    {p.lastTestError && <p className="mt-1 text-[11px] text-danger-500">{p.lastTestError.slice(0, 120)}</p>}
                    <div className="mt-2 flex flex-wrap gap-1.5">
                      <Button size="sm" onClick={() => act(p.id, "conn", `/api/providers/${p.id}/test-connection`)} loading={busy === `conn:${p.id}`}>Test Connection</Button>
                      <Button size="sm" onClick={() => act(p.id, "model", `/api/providers/${p.id}/test-model`)} loading={busy === `model:${p.id}`}>Test Model</Button>
                      <Button size="sm" variant="ghost" onClick={() => (editing === p.id ? setEditing(null) : void openModels(p))}>
                        {editing === p.id ? "Tutup" : "Ganti model"}
                      </Button>
                      <Button size="sm" variant="ghost" onClick={async () => { await api(`/api/providers/${p.id}`, { method: "PATCH", body: JSON.stringify({ active: !p.active }) }); await load(); }}>
                        {p.active ? "Nonaktifkan" : "Aktifkan"}
                      </Button>
                      <Button size="sm" variant="ghost" onClick={async () => { if (confirm(`Hapus ${p.name}?`)) { await api(`/api/providers/${p.id}`, { method: "DELETE" }); await load(); } }}>Hapus</Button>
                    </div>
                    {editing === p.id && (
                      <div className="mt-2 rounded-lg border hairline bg-[var(--surface-2,theme(colors.slate.50))] p-2">
                        {cat.loading ? (
                          <p className="px-1 py-2 text-[12px] text-ink-500">Memuat model dari {p.baseUrl}…</p>
                        ) : cat.error ? (
                          <p className="px-1 py-2 text-[12px] text-danger-500">{cat.error}</p>
                        ) : (
                          <>
                            <p className="px-1 pb-1 text-[11.5px] text-ink-500">{cat.models.length} model tersedia untuk kunci ini · saat ini <span className="mono">{p.model}</span></p>
                            <p className="px-1 pb-1.5 text-[11px] text-ink-400">
                              Pipeline cerita memerlukan keluaran JSON terstruktur. Model yang tidak mendukungnya akan ditolak saat membuat konsep — uji dengan <span className="font-medium">Test Model</span> setelah mengganti.
                            </p>
                            <select
                              className="mono w-full rounded-lg border hairline bg-white px-2 py-1.5 text-[12.5px]"
                              value={p.model}
                              onChange={(e) => void setModelFor(p, e.target.value)}
                            >
                              {!cat.models.includes(p.model) && <option value={p.model}>{p.model} (tersimpan, tidak ada di daftar)</option>}
                              {cat.models.map((m) => <option key={m} value={m}>{m}</option>)}
                            </select>
                          </>
                        )}
                      </div>
                    )}
                  </li>
                ))}
              </ul>
            )}
          </Card>

          <Card>
            <CardHeader title="Peran model" subtitle="Kosongkan untuk memakai provider aktif pertama." />
            <div className="grid gap-3 p-5 md:grid-cols-2">
              {ROLES.map(([key, label]) => {
                const current = roles.find((r) => r.role === key);
                return (
                  <Field key={key} label={label} hint={current ? `${current.provider.name} · ${current.provider.model}` : "default"}>
                    <Select value={current?.providerId ?? ""} onChange={(e) => assign(key, e.target.value)}>
                      <option value="">— default —</option>
                      {providers.filter((p) => p.active).map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
                    </Select>
                  </Field>
                );
              })}
            </div>
          </Card>
        </div>
      </div>
    </>
  );
}
