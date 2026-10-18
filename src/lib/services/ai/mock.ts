// src/lib/services/ai/mock.ts — deterministic provider for tests and key-less operation.
// It is clearly labeled MOCK in the UI. Its output is realistic-shaped JSON so every
// downstream parser is exercised for real, but it never pretends to be a real model.
import type { AIAdapter, CompletionRequest, CompletionResult, ProviderConfig } from "./types";

function stableHash(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

/** Read the [TASK:x] marker the caller embeds in the system prompt. */
function detectTask(messages: { role: string; content: string }[]): string {
  const sys = messages.find((m) => m.role === "system")?.content ?? "";
  const m = sys.match(/\[TASK:([a-z_]+)\]/);
  return m?.[1] ?? "generic";
}

export function mockResponse(task: string, prompt: string): string {
  const seed = stableHash(prompt);
  const pick = <T,>(arr: T[]) => arr[seed % arr.length];

  switch (task) {
    case "concepts":
      return JSON.stringify({
        concepts: Array.from({ length: 8 }, (_, i) => ({
          title: pick(["Meja kerja yang berantakan", "Kabel yang selalu kusut", "Cari HP saat malam", "Satu kebiasaan kecil", "Kenapa saya berhenti beli aksesori murah", "Sudut meja yang tidak terpakai", "Kabel charger yang cepat rusak", "Menata itu membosankan"]) + ` #${i + 1}`,
          angle: ["problem_observation", "discovery_story", "mistake", "before_after", "dilemma", "tips", "comparison", "question"][i % 8],
          premise: [
            "Meja sempit membuat HP tidak punya tempat tetap, jadi selalu berpindah.",
            "Kabel charger kusut karena tidak ada titik tetap untuk menggantungnya.",
            "Lampu kamar yang salah arah membuat mata cepat lelah saat kerja malam.",
            "Kebiasaan menaruh barang sembarangan lebih kuat dari niat merapikan.",
            "Aksesori murah sering dibeli sebelum masalahnya dipahami.",
            "Sudut meja jadi tempat menumpuk karena tidak punya fungsi jelas.",
            "Kabel yang cepat rusak karena selalu dilipat sembarangan.",
            "Menata barang terasa membosankan sehingga ditunda terus.",
          ][i % 8],
        })),
      });
    case "story": {
      // Vary the opening line by prompt seed so multi-candidate flows (Arena) produce
      // genuinely distinct texts instead of exact duplicates.
      const openings = [
        "Meja kerja saya cuma 60cm.",
        "Setiap pagi ritualnya sama: mengurai kabel yang kusut.",
        "Saya kerja sampai malam beberapa kali minggu ini.",
        "Ada satu sudut meja yang selalu jadi tempat menumpuk barang.",
        "Dulu saya pikir masalahnya kurang alat.",
        "Barang paling sering hilang di meja saya: HP.",
      ];
      const opening = pick(openings);
      // Add a rotating scene detail so repeated identical prompts still yield distinct drafts
      // (real models vary naturally; the mock must simulate that).
      const details = [
        "Gelas kopi selalu jadi korban pertama.",
        "Mouse dan charger berebut tempat yang sama.",
        "Notebook menumpuk di sudut kiri.",
        "Tisu dan remot ikut hilang entah ke mana.",
        "Kabel earphone melingkar di dekat keyboard.",
        "Ada tumpukan struk yang tak pernah dibuang.",
      ];
      // Independent bit-rotation so the two picks don't collide when seed % 6 repeats.
      const rot = (n: number, k: number) => (((n << k) | (n >>> (32 - k))) >>> 0);
      const detail = details[rot(seed, 11) % details.length];
      return JSON.stringify({
        versions: [
          {
            title: "Meja kerja 60cm",
            text:
              opening + " " + detail + " Awalnya saya pikir cukup: laptop, mouse, gelas.\n\nTernyata HP selalu jadi masalah. Ditaruh di samping laptop, layarnya kepentok. Ditaruh di laci, lupa. Akhirnya HP duduk di atas tumpukan buku.\n\nYang saya pelajari: bukan mejanya yang sempit, tapi tidak ada tempat tetap buat HP. Solusinya sederhana — satu stand kecil supaya HP punya 'rumah'.\n\nKalau meja kamu juga sempit, coba cek dulu: HP kamu taruh di mana?",
            truthMode: "HYPOTHETICAL",
            promotionLevel: 1,
          },
          {
            title: "Kabel yang kusut tiap pagi",
            text:
              "Setiap pagi ritualnya sama: mengurai kabel charger yang kusut.\n\nBukan karena kabelnya nakal. Cuma karena tidak ada yang menahannya, jadi ya dia melingkar sendiri.\n\nCara paling gampang yang saya temukan bukan beli barang baru, tapi memberi satu titik tetap. Bisa pakai klip, bisa pakai organizer kecil.\n\nKadang masalahnya bukan 'kurang alat', tapi 'tidak ada tempat'.",
            truthMode: "HYPOTHETICAL",
            promotionLevel: 0,
          },
          {
            title: "Lampu meja dan mata yang capek",
            text:
              "Saya kerja sampai malam beberapa kali minggu ini. Yang paling terasa bukan ngantuk, tapi mata perih.\n\nTernyata sumbernya sepele: lampu kamar cuma satu, di belakang, jadi layar lebih terang daripada sekitarnya.\n\nKalau kamu sering begini, coba cek arah cahayanya dulu sebelum beli apa pun.",
            truthMode: "HYPOTHETICAL",
            promotionLevel: 0,
          },
        ],
      });
    }
    case "insights":
      return JSON.stringify({
        insights: [
          { category: "PROBLEM", statement: "Meja kerja kecil membuat barang mudah berantakan.", evidenceQuote: null, confidence: 55, limitation: "Sampel kecil, hanya ilustrasi.", evidenceType: "INTERPRETATION" },
          { category: "LANGUAGE", statement: "Orang menyebut 'kusut', 'kepentok', 'berantakan'.", evidenceQuote: null, confidence: 50, limitation: "Belum diverifikasi lintas sumber.", evidenceType: "HYPOTHESIS" },
        ],
      });
    case "summary":
      return JSON.stringify({
        summary: "Ringkasan mock: teks membahas masalah kecil di meja kerja dan solusi sederhana tanpa klaim berlebihan.",
        context: "Konteks: pengguna kasual, ruang terbatas.",
        facts: [],
      });
    case "score":
      return JSON.stringify({
        scores: {
          naturalness: 7.5,
          relevance: 8,
          clarity: 7,
          originality: 6.5,
          trustTransparency: 7,
          productFit: 7,
          endingQuality: 6.5,
        },
        reasons: {
          naturalness: "Kalimat pendek dan wajar, tapi beberapa frasa agak umum.",
          relevance: "Langsung menyentuh masalah meja sempit.",
          clarity: "Alur jelas dari masalah ke pelajaran.",
          originality: "Sudut pandang cukup personal.",
          trustTransparency: "Tidak ada klaim berlebihan.",
          productFit: "Produk relevan tapi tidak disebut dulu.",
          endingQuality: "Penutup berupa pertanyaan reflektif.",
        },
        penalties: [],
      });
    case "factcheck":
      return JSON.stringify({
        verdict: "WARNINGS",
        claims: [{ claim: "Meja kerja 60cm", supported: false, note: "Tidak ada sumber; ditandai sebagai hipotetis." }],
        notes: "Tidak ada klaim angka, harga, atau rating.",
      });
    case "naturalness":
      return JSON.stringify({ issues: [], revised: null, slopFlags: [] });
    default:
      return JSON.stringify({ ok: true, note: "mock provider", echoTask: task });
  }
}

export const mockAdapter: AIAdapter = {
  async complete(req: CompletionRequest): Promise<CompletionResult> {
    const prompt = req.messages.map((m) => m.content).join("\n");
    const task = detectTask(req.messages);
    const text = mockResponse(task, prompt);
    const inTok = Math.ceil(prompt.length / 4);
    const outTok = Math.ceil(text.length / 4);
    // Artificial latency so async UI states are exercised.
    await new Promise((r) => setTimeout(r, process.env.NODE_ENV === "test" ? 0 : 120));
    return { text, inputTokens: inTok, outputTokens: outTok };
  },
  async listModels() {
    return ["mock-fast", "mock-thorough"];
  },
  async testConnection() {
    return { ok: true as const, message: "Mock provider aktif (tidak memanggil jaringan)." };
  },
};
