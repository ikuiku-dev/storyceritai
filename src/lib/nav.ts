export interface NavItem {
  href: string;
  label: string;
  group: string;
  description: string;
}

export const NAV: NavItem[] = [
  { href: "/", label: "Overview", group: "Kerja", description: "Ringkasan status, draft, dan metrik nyata" },
  { href: "/studio", label: "Story Studio", group: "Kerja", description: "Tulis & edit cerita" },
  { href: "/arena", label: "Story Arena", group: "Kerja", description: "Adu kandidat cerita" },
  { href: "/calendar", label: "Publishing Calendar", group: "Kerja", description: "Jadwal & status publikasi" },

  { href: "/products", label: "Product Research", group: "Riset", description: "Kandidat produk & skor peluang" },
  { href: "/sources", label: "Source Library", group: "Riset", description: "Referensi publik & catatan" },
  { href: "/insights", label: "Audience Insights", group: "Riset", description: "Masalah, bahasa, keberatan" },
  { href: "/knowledge", label: "Knowledge Base", group: "Riset", description: "Pelajaran dari eksperimen" },

  { href: "/affiliate", label: "Affiliate Links", group: "Distribusi", description: "Tautan & validasi" },
  { href: "/threads", label: "Threads Integration", group: "Distribusi", description: "OAuth, test, publish" },

  { href: "/experiments", label: "Experiments & Analytics", group: "Analitik", description: "Hasil & biaya AI" },
  { href: "/providers", label: "AI Providers", group: "Sistem", description: "Provider, model, peran" },
  { href: "/settings", label: "Settings", group: "Sistem", description: "Publikasi, disclosure, anggaran" },
  { href: "/audit", label: "Audit Logs", group: "Sistem", description: "Jejak setiap tindakan" },
];

export const NAV_GROUPS = ["Kerja", "Riset", "Distribusi", "Analitik", "Sistem"];
