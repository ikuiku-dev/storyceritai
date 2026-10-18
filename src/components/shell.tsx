"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";
import { NAV, NAV_GROUPS } from "@/lib/nav";

function Logo() {
  return (
    <Link href="/" className="flex items-center gap-2.5 px-3">
      <span className="grid h-7 w-7 place-items-center rounded-[8px] bg-ink-900 text-[13px] font-bold text-white">CL</span>
      <span className="text-[15px] font-semibold tracking-[-0.01em] text-ink-900">
        CeritaLab<span className="text-brand-600">.</span>ai
      </span>
    </Link>
  );
}

function NavLinks({ onNavigate }: { onNavigate?: () => void }) {
  const pathname = usePathname();
  return (
    <nav className="flex-1 space-y-5 px-3 py-4" aria-label="Navigasi utama">
      {NAV_GROUPS.map((group) => {
        const items = NAV.filter((n) => n.group === group);
        if (!items.length) return null;
        return (
          <div key={group}>
            <p className="px-2 pb-1.5 text-[11px] font-semibold uppercase tracking-[0.07em] text-ink-400">{group}</p>
            <ul className="space-y-0.5">
              {items.map((item) => {
                const active = pathname === item.href || (item.href !== "/" && pathname.startsWith(item.href));
                return (
                  <li key={item.href}>
                    <Link
                      href={item.href}
                      onClick={onNavigate}
                      aria-current={active ? "page" : undefined}
                      className={`block rounded-lg px-2.5 py-[7px] text-[13.5px] transition-colors ${
                        active ? "bg-white font-medium text-ink-900 shadow-[0_1px_2px_rgba(16,24,40,0.06)] ring-1 ring-[var(--border)]" : "text-ink-600 hover:bg-ink-100 hover:text-ink-900"
                      }`}
                    >
                      {item.label}
                    </Link>
                  </li>
                );
              })}
            </ul>
          </div>
        );
      })}
    </nav>
  );
}

export function Shell({ children }: { children: React.ReactNode }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="min-h-screen bg-[var(--bg)] lg:grid lg:grid-cols-[236px_1fr]">
      {/* Desktop sidebar */}
      <aside className="sticky top-0 hidden h-screen flex-col border-r hairline bg-[#f1f4f7] lg:flex">
        <div className="py-4">
          <Logo />
        </div>
        <NavLinks />
        <div className="border-t hairline px-4 py-3">
          <p className="text-[11px] leading-relaxed text-ink-400">Mode lokal · data tidak keluar mesin tanpa provider yang Anda aktifkan.</p>
        </div>
      </aside>

      {/* Mobile top bar */}
      <div className="sticky top-0 z-30 flex items-center justify-between border-b hairline bg-white/95 px-3 py-2 backdrop-blur lg:hidden">
        <Logo />
        <button onClick={() => setOpen((v) => !v)} aria-expanded={open} className="rounded-lg px-3 py-1.5 text-sm font-medium text-ink-700 hover:bg-ink-100">
          {open ? "Tutup" : "Menu"}
        </button>
      </div>
      {open && (
        <div className="border-b hairline bg-[#f1f4f7] lg:hidden">
          <NavLinks onNavigate={() => setOpen(false)} />
        </div>
      )}

      <main className="min-w-0 px-4 py-6 sm:px-7 sm:py-8">
        <div className="mx-auto max-w-[1180px]">{children}</div>
      </main>
    </div>
  );
}
