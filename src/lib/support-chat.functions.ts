import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

const messageSchema = z.object({
  role: z.enum(["user", "assistant"]),
  content: z.string().min(1).max(2000),
});

const inputSchema = z.object({
  messages: z.array(messageSchema).min(1).max(20),
});

const SITE_INFO = `
Firma: KasımOğulları Ltd. Şti. — market ve bakkallara toptan satış yapan depo.
Site bölümleri:
- Ana sayfa (/): kayan ürün tanıtımı, kategori filtreleri (Tümü, Gıda, Bakliyat, Temizlik) ve ürün arama.
- Ürün sayfası (/urun/{id}): ürün fotoğrafı, açıklama, birim, adet seçici ve sepete ekleme.
- Sepet (/sepet): sipariş formu. İsim soyisim, market/bakkal adı (zorunlu), ilçe (zorunlu), telefon, adres ve not istenir.
- Siparişlerim (/siparislerim): müşteri kendi aktif ve geçmiş siparişlerini görür.
- Giriş (/giris): müşteri girişi ve yönetici girişi sekmeleri.
- Yönetim (/yonetim): sadece yöneticiler; ürün ekleme/düzenleme, sipariş durumu, arşiv.
Kurallar:
- Sitede fiyat gösterilmez, online ödeme yoktur. Ödeme teslimat sırasında yapılır.
- Sipariş vermek için üyelik/giriş gerekir.
- Teslimat ilçeleri: Ahlat, Adilcevaz, Bitlis, Güroymak, Hizan, Tatvan.
- Sipariş durumları: Yeni, Hazırlanıyor, Yolda, Teslim edildi, İptal.
`;

export const askSupport = createServerFn({ method: "POST" })
  .inputValidator((data) => inputSchema.parse(data))
  .handler(async ({ data }) => {
    const apiKey = process.env["GEMINI_API_KEY"];
    if (!apiKey) {
      return { ok: false as const, reply: "Asistan şu anda kullanılamıyor." };
    }

    const supabaseUrl = process.env["SUPABASE_URL"] ?? process.env["VITE_SUPABASE_URL"];
    const publishableKey =
      process.env["SUPABASE_PUBLISHABLE_KEY"] ?? process.env["VITE_SUPABASE_PUBLISHABLE_KEY"];

    let productList = "";
    if (supabaseUrl && publishableKey) {
      try {
        const res = await fetch(
          `${supabaseUrl}/rest/v1/products?select=name,description,category,unit&is_active=eq.true&order=name&limit=200`,
          { headers: { apikey: publishableKey } },
        );
        if (res.ok) {
          const rows = (await res.json()) as Array<{
            name: string;
            description: string;
            category: string;
            unit: string;
          }>;
          productList = rows
            .map((p) => `- ${p.name} (kategori: ${p.category}, birim: ${p.unit}) ${p.description}`)
            .join("\n");
        }
      } catch {
        productList = "";
      }
    }

    const system = `Adın "Ko". KasımOğulları Ltd. Şti. toptan sipariş sitesinin destek asistanısın.
Her zaman Türkçe, kısa, samimi ve net cevap ver. Sadece aşağıdaki bilgilere dayan; bilmediğin bir şeyi uydurma, gerekirse firmayla iletişime geçmelerini söyle.
Fiyat sorulursa: sitede fiyat gösterilmediğini, fiyat için sipariş sonrası iletişime geçildiğini söyle.

${SITE_INFO}

Depodaki güncel ürünler:
${productList || "(ürün listesi şu an alınamadı)"}`;

    const res = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${apiKey}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          contents: [
            { role: "user", parts: [{ text: system }] },
            ...data.messages.map((m) => ({
              role: m.role === "assistant" ? "model" : "user",
              parts: [{ text: m.content }],
            })),
          ],
        }),
      },
    );

    if (res.status === 429) {
      return {
        ok: false as const,
        reply: "Çok fazla istek geldi, lütfen biraz sonra tekrar deneyin.",
      };
    }
    if (!res.ok) {
      return { ok: false as const, reply: "Şu an cevap veremiyorum, lütfen tekrar deneyin." };
    }

    const json = (await res.json()) as {
      candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }>;
    };
    const reply = json.candidates?.[0]?.content?.parts?.[0]?.text?.trim();
    return { ok: true as const, reply: reply || "Bunu tam anlayamadım, tekrar sorar mısınız?" };
  });
