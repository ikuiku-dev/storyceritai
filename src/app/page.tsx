import { getOverview } from "@/lib/services/dashboard";
import { Card, CardHeader, Stat, PageHeader, Badge, Callout, EmptyState, LinkButton } from "@/components/ui/primitives";
import { USD, NUM } from "@/lib/format";

export default async function OverviewPage() {
  const o = await getOverview();
  const c = o.counts;
  const hasContent = c.storiesTotal > 0 || c.products > 0 || c.sources > 0;

  return (
    <>
      <PageHeader
        title="Overview"
        description="Semua angka di sini berasal dari data yang benar-benar tercatat. Yang belum ada ditampilkan sebagai “—”, bukan nol."
        action={<LinkButton href="/studio" variant="primary">Tulis cerita</LinkButton>}
      />

      {o.warnings.length > 0 && (
        <div className="mb-5 space-y-2">
          {o.warnings.map((w) => (
            <Callout key={w} tone="amber" title="Perlu perhatian">{w}</Callout>
          ))}
        </div>
      )}

      <section aria-label="Status pipeline" className="mb-5 grid grid-cols-2 gap-3 md:grid-cols-4">
        <Stat label="Draft" value={c.drafts} sub="Belum diajukan untuk disetujui" />
        <Stat label="Menunggu persetujuan" value={c.waitingApproval} tone={c.waitingApproval > 0 ? "amber" : "neutral"} sub="Perlu review Anda" />
        <Stat label="Terjadwal" value={c.scheduled} sub="Disetujui & masuk antrean" />
        <Stat label="Terbit" value={c.published} tone={c.published > 0 ? "green" : "neutral"} sub={c.failed > 0 ? `${c.failed} gagal — cek kalender` : "Tidak ada kegagalan tercatat"} />
      </section>

      <div className="grid gap-4 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader title="Metrik nyata" subtitle="Hanya dari snapshot yang diambil via Threads Insights atau input manual Anda." />
          {o.metrics.postsMeasured === 0 ? (
            <EmptyState
              title="Belum ada metrik"
              description="Likes bukan penjualan, dan angka kosong bukan nol. Metrik akan muncul setelah sebuah cerita diterbitkan dan insight diambil."
              action={<LinkButton href="/experiments">Buka Analytics</LinkButton>}
            />
          ) : (
            <div className="grid grid-cols-3 gap-3 p-5">
              <Stat label="Views" value={NUM(o.metrics.views)} hint="null = API tidak menyediakan" />
              <Stat label="Replies" value={NUM(o.metrics.replies)} />
              <Stat label="Likes" value={NUM(o.metrics.likes)} sub={`${o.metrics.postsMeasured} snapshot`} />
            </div>
          )}
        </Card>

        <Card>
          <CardHeader title="Konektor" subtitle="Status sebenarnya, bukan asumsi." />
          <ul className="divide-y divide-[var(--border)]">
            <li className="flex items-center justify-between px-5 py-3">
              <div>
                <p className="text-sm font-medium text-ink-800">Threads</p>
                <p className="text-xs text-ink-500">{o.threads?.accountName ?? "Belum ada akun terhubung"}</p>
              </div>
              <Badge tone={o.threads?.status === "CONNECTED" ? "green" : o.threads?.status === "EXPIRED" ? "amber" : "neutral"}>
                {o.threads?.status === "CONNECTED" ? "terhubung" : o.threads?.status === "EXPIRED" ? "kedaluwarsa" : "belum terhubung"}
              </Badge>
            </li>
            <li className="flex items-center justify-between px-5 py-3">
              <div>
                <p className="text-sm font-medium text-ink-800">Shopee</p>
                <p className="text-xs text-ink-500">API produk resmi / feed afiliasi</p>
              </div>
              <Badge tone={o.shopee?.status === "CONNECTED" ? "green" : "neutral"}>{o.shopee?.status === "CONNECTED" ? "terhubung" : "belum terhubung"}</Badge>
            </li>
            <li className="flex items-center justify-between px-5 py-3">
              <div>
                <p className="text-sm font-medium text-ink-800">Provider AI</p>
                <p className="text-xs text-ink-500">{o.providers.active} aktif dari {o.providers.total}</p>
              </div>
              <Badge tone={o.providers.active > 0 ? "green" : "red"}>{o.providers.active > 0 ? "siap" : "kosong"}</Badge>
            </li>
          </ul>
        </Card>
      </div>

      <div className="mt-4 grid gap-4 lg:grid-cols-3">
        <Card>
          <CardHeader title="Estimasi biaya AI" subtitle="Dihitung dari token tercatat × harga yang Anda isi." />
          <div className="space-y-3 p-5">
            <div className="flex items-baseline justify-between">
              <span className="text-[13px] text-ink-600">Hari ini</span>
              <span className="mono text-lg font-semibold">{USD(o.cost.today)}</span>
            </div>
            <div className="flex items-baseline justify-between">
              <span className="text-[13px] text-ink-600">Bulan ini</span>
              <span className="mono text-lg font-semibold">{USD(o.cost.month)}</span>
            </div>
            <p className="text-xs leading-relaxed text-ink-500">
              Batas: {o.cost.dailyCap != null ? `$${o.cost.dailyCap}/hari` : "belum diatur"} · {o.cost.monthlyCap != null ? `$${o.cost.monthlyCap}/bulan` : "belum diatur"}
            </p>
            {o.cost.unpricedCalls > 0 && <Badge tone="amber">{o.cost.unpricedCalls} panggilan tanpa harga</Badge>}
          </div>
        </Card>

        <Card>
          <CardHeader title="Riset & sumber" />
          <div className="grid grid-cols-2 gap-3 p-5">
            <Stat label="Produk" value={c.products} />
            <Stat label="Sumber" value={c.sources} sub={c.sourcesStale ? `${c.sourcesStale} kedaluwarsa` : undefined} />
            <Stat label="Eksperimen aktif" value={c.experimentsActive} />
            <Stat label="Total cerita" value={c.storiesTotal} />
          </div>
        </Card>

        <Card>
          <CardHeader title="Mulai dari sini" subtitle="Alur 5 langkah" />
          <ol className="space-y-2.5 p-5 text-[13.5px]">
            {[
              ["Riset produk", "/products"],
              ["Pelajari cerita manusia", "/sources"],
              ["Adu kandidat cerita", "/arena"],
              ["Periksa & setujui", "/studio"],
              ["Publikasikan & pelajari", "/threads"],
            ].map(([label, href], i) => (
              <li key={href} className="flex items-center gap-3">
                <span className="mono grid h-5 w-5 shrink-0 place-items-center rounded-md bg-ink-100 text-[11px] font-semibold text-ink-600">{i + 1}</span>
                <a href={href} className="text-ink-700 underline-offset-2 hover:text-brand-700 hover:underline">{label}</a>
              </li>
            ))}
          </ol>
        </Card>
      </div>

      {!hasContent && (
        <div className="mt-4">
          <Callout tone="blue" title="Aplikasi masih kosong — dan itu memang begitu seharusnya.">
            Tidak ada data sintetis yang disajikan seolah nyata. Tambahkan provider AI (atau aktifkan Mock), lalu buat cerita pertama Anda.
            Seeder opsional tersedia: <code className="mono text-[12px]">npm run seed:demo</code> menandai semua barisnya sebagai DEMO.
          </Callout>
        </div>
      )}
    </>
  );
}
