"use client";
import { useEffect, useRef, useState } from "react";

/**
 * Model picker that discovers the models a provider's own API key can actually use.
 *
 * Every provider exposes a different catalogue (OpenAI, OneAPI, Ollama, OpenRouter...), so a
 * hardcoded list would be wrong everywhere. We ask the provider's /models endpoint with the
 * user's own base URL + key and let them pick. Free-text stays available because some
 * providers support models they do not list.
 */
export type ModelOption = string;

export function ModelPicker({
  baseUrl,
  apiKey,
  protocol,
  value,
  onChange,
  onError,
}: {
  baseUrl: string;
  apiKey: string;
  protocol: string;
  value: string;
  onChange: (v: string) => void;
  onError?: (msg: string | null) => void;
}) {
  const [options, setOptions] = useState<ModelOption[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [manual, setManual] = useState(false);
  const [query, setQuery] = useState("");
  const lastKey = useRef<string>("");

  // Auto-discover as soon as we have enough to make a request.
  const canFetch = protocol === "mock" || (baseUrl.trim().length > 7 && apiKey.trim().length > 0);

  async function discover() {
    if (!canFetch) return;
    setLoading(true); setError(null); onError?.(null);
    try {
      const res = await fetch("/api/providers/discover-models", {
        method: "POST",
        headers: { "content-type": "application/json" },
        // The key is sent once to the server, which encrypts/uses it and never echoes it back.
        body: JSON.stringify({ baseUrl, apiKey, protocol }),
      });
      const j = await res.json();
      if (!j.ok) throw new Error(j.error?.message ?? "Gagal mengambil daftar model");
      const list: ModelOption[] = j.data.models ?? [];
      setOptions(list);
      if (!list.length) setError("Provider tidak mengembalikan model. Isi manual.");
      else if (!value) onChange(list[0]);
    } catch (e) {
      setError((e as Error).message);
      onError?.((e as Error).message);
    } finally { setLoading(false); }
  }

  // Re-discover when the endpoint/key changes, debounced so typing a URL does not spam.
  useEffect(() => {
    const sig = `${baseUrl}|${apiKey ? "k" : ""}|${protocol}`;
    if (sig === lastKey.current) return;
    const t = setTimeout(() => { lastKey.current = sig; if (canFetch) void discover(); }, 700);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [baseUrl, apiKey, protocol]);

  const filtered = options.filter((o) => o.toLowerCase().includes(query.toLowerCase()));

  if (protocol === "mock") {
    return <Input value={value || "mock-fast"} onChange={(e) => onChange(e.target.value)} placeholder="mock-fast" />;
  }

  if (manual || (!loading && !options.length && error)) {
    return (
      <div className="space-y-1.5">
        <Input value={value} onChange={(e) => onChange(e.target.value)} placeholder="mis. gpt-4o-mini" />
        <div className="flex items-center gap-3">
          <button type="button" className="text-[11.5px] text-brand-700 hover:underline" onClick={() => { setManual(false); void discover(); }}>
            {loading ? "Memuat…" : "Muat daftar dari provider"}
          </button>
          {error ? <span className="text-[11.5px] text-ink-500">{error}</span> : null}
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-1.5">
      <div className="flex gap-2">
        <input
          className="w-full rounded-lg border hairline bg-white px-2.5 py-[7px] text-[13px] text-ink-800 placeholder:text-ink-400 focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-100"
          placeholder={options.length ? `Cari di ${options.length} model…` : "Memuat model…"}
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
        <button type="button" onClick={() => void discover()} disabled={loading}
          className="shrink-0 rounded-lg border hairline bg-white px-2.5 py-[7px] text-[12px] text-ink-700 hover:bg-ink-100 disabled:opacity-50">
          {loading ? "…" : "Muat ulang"}
        </button>
      </div>
      <select
        size={6}
        className="mono w-full rounded-lg border hairline bg-white px-1 py-1 text-[12.5px] text-ink-800 focus:border-brand-500 focus:outline-none"
        value={value}
        onChange={(e) => onChange(e.target.value)}
      >
        {filtered.length === 0 ? <option value="" disabled>Tidak ada model cocok</option> : null}
        {filtered.map((o) => (
          <option key={o} value={o}>{o}</option>
        ))}
      </select>
      <div className="flex items-center justify-between gap-2">
        <span className="text-[11px] text-ink-400">
          {options.length ? `${options.length} model tersedia untuk kunci ini` : "Belum ada daftar"}
        </span>
        <button type="button" className="text-[11.5px] text-brand-700 hover:underline" onClick={() => setManual(true)}>
          Isi manual
        </button>
      </div>
      {error ? <p className="text-[11.5px] text-ink-500">{error}</p> : null}
    </div>
  );
}

function Input({ value, onChange, placeholder }: { value: string; onChange: (e: React.ChangeEvent<HTMLInputElement>) => void; placeholder?: string }) {
  return (
    <input
      className="w-full rounded-lg border hairline bg-white px-2.5 py-[7px] text-[13px] text-ink-800 placeholder:text-ink-400 focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-100"
      value={value} onChange={onChange} placeholder={placeholder}
    />
  );
}
