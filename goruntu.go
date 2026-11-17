package main

import (
	"bytes"
	"encoding/base64"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"net/url"
	"strings"
)

/* ============================================================
   Defter sayfasının fotoğrafından müşteri ve satırları okuma.
   Fotoğraf diske yazılmaz; yalnızca bellekte işlenip Gemini'ye gider.
   Bu komut tarayıcı sürümüne de birebir aktarılır (index.html).
   ============================================================ */

const goruntuYonerge = `Sen bir tarım marketinin elle doldurulmuş veresiye/müşteri hesap kartının fotoğrafını okuyan araçsın.
Kartta üstte müşteri bilgileri (Adı Soyadı, T.C. No, Adres, Tel), altta bir tablo vardır:
Tarih | ÜRÜN | Adet | Tutar | Tahsilat | Bakiye. Kartın altında bir sayfa numarası (No ...) olabilir.

Görevin bu kartı olduğu gibi okumak. ÇOK ÖNEMLİ KURALLAR:
- Sadece kartta YAZAN şeyleri yaz. Okuyamadığın bir şeyi tahmin etme, uydurma.
- Emin olmadığın her değeri "supheli" listesine ekle. Biçim: "ad", "tc", "tel", "koy" ya da
  satırlar için "satir3.tutar" gibi (satır numarası 1'den başlar). Elle yazı okunurken hata
  çok olur; dürüst ol, emin değilsen mutlaka supheli'ye koy.
- Para: 33000, 82500 gibi sadece sayı yaz. Nokta/virgül/₺ koyma.
- Tarih: kartta çoğu zaman yıl yazmaz (12.12, 07.11 gibi). Satırlar yukarıdan aşağıya
  zaman sırasıyla yazılmıştır ve en alttaki satır bugünden sonra olamaz. Buna göre her
  tarihe yıl ver ve YYYY-AA-GG biçiminde yaz. Örnek: bugün 2026-11-17 ise ve sıra
  12.12, 29.07, 06.11 ise yıllar 2025, 2026, 2026 olur.
- Her satır ya bir SATIŞ ya da bir TAHSİLAT'tır:
  * Ürün/Adet/Tutar doluysa tur = "satis".
  * Tahsilat sütunu doluysa ya da ürün yerine "tahsilat", "ödeme", "havale", "nakit" gibi
    bir şey yazıyorsa tur = "tahsilat"; tutar alanına tahsil edilen miktarı yaz.
- Adet sütununda sayının önünde "ℓ" ya da "l" işareti varsa bu litredir: miktar = "15 lt".
  İşaret yoksa sadece sayıyı yaz.
- Tahsilatlarda ödeme yöntemi yazıyorsa yontem şunlardan biri olsun:
  Nakit, Havale / EFT, Kredi kartı, Çek, Senet. Yazmıyorsa boş bırak.
- Bakiye sütununda bir rakam yazıyorsa o satırın bakiye alanına yaz (üstü çizilmiş
  olsa bile). Tablodaki en son yazılı bakiyeyi sonBakiye'ye yaz.
- Kartın üstünde "vadeli" gibi genel bir not varsa musteri.not alanına yaz.
- Adres genelde köy ya da mahalle adıdır, koy alanına yaz.
- Boş satırları atla.

Cevabını SADECE şu JSON biçiminde ver, başka hiçbir şey yazma, markdown kod bloğu kullanma:
{
  "musteri": { "ad": "", "tc": "", "tel": "", "koy": "", "not": "" },
  "sayfaNo": "",
  "satirlar": [
    { "tarih": "", "tur": "satis", "urun": "", "miktar": "", "tutar": 0, "yontem": "", "bakiye": null }
  ],
  "sonBakiye": null,
  "supheli": []
}`

// Gemini'ye defter sayfası fotoğrafını gönderir, yapılandırılmış sonucu döndürür.
func geminiGoruntu(a Ayarlar, tip, b64, bugun string) (map[string]any, error) {
	anahtar := strings.TrimSpace(a.GeminiAnahtar)
	if anahtar == "" {
		return nil, fmt.Errorf("Gemini anahtarı girilmemiş. Ayarlar ekranından anahtarı yapıştır.")
	}
	ham := base64.StdEncoding.DecodedLen(len(b64))
	if ham > enBuyukSesBayt {
		return nil, fmt.Errorf("Fotoğraf çok büyük (%d MB). Daha küçük bir fotoğraf dene.", ham>>20)
	}
	if ham < 2000 {
		return nil, fmt.Errorf("Fotoğraf boş ya da bozuk geldi.")
	}
	tip = strings.TrimSpace(tip)
	if i := strings.IndexByte(tip, ';'); i > 0 {
		tip = tip[:i]
	}
	if !strings.HasPrefix(tip, "image/") {
		tip = "image/jpeg"
	}
	model := strings.TrimSpace(a.GeminiSesModel)
	if model == "" {
		model = varsayilanSesModel
	}
	istem := "Bu müşteri hesap kartını oku. BUGÜNÜN TARİHİ: " + bugun

	cevap, kod, mesaj, err := geminiCok(anahtar, model, goruntuYonerge, istem, tip, b64, true)
	if err != nil {
		return nil, err
	}
	if kod == 400 && sesAlanHatasi(mesaj) {
		cevap, kod, mesaj, err = geminiCok(anahtar, model, goruntuYonerge, istem, tip, b64, false)
		if err != nil {
			return nil, err
		}
	}
	if kod != 200 {
		e := sesHataCevir(kod, mesaj, model)
		return nil, fmt.Errorf("%s", strings.ReplaceAll(e.Error(), "ses kaydını", "fotoğrafı"))
	}
	nesne, hata := jsonAyikla(cevap)
	if hata != nil {
		return nil, fmt.Errorf("Fotoğraf okunamadı. Daha net ve düz çekilmiş bir fotoğraf dene.")
	}
	return nesne, nil
}

// Metin + tek bir dosya (ses ya da görüntü) gönderen genel çağrı.
// Döndürür: modelin metni, HTTP kodu (bloklanırsa -1), Google'ın hata mesajı.
func geminiCok(anahtar, model, yonerge, istem, tip, b64 string, jsonIste bool) (string, int, string, error) {
	uretim := map[string]any{"temperature": 0.1, "maxOutputTokens": 4000}
	if jsonIste {
		uretim["response_mime_type"] = "application/json"
	}
	govde, err := json.Marshal(map[string]any{
		"system_instruction": map[string]any{"parts": []any{map[string]any{"text": yonerge}}},
		"contents": []any{map[string]any{"parts": []any{
			map[string]any{"text": istem},
			map[string]any{"inline_data": map[string]any{"mime_type": tip, "data": b64}},
		}}},
		"generationConfig": uretim,
	})
	if err != nil {
		return "", 0, "", fmt.Errorf("istek hazırlanamadı: %v", err)
	}
	adres := geminiUcNokta() + "/models/" + url.PathEscape(model) + ":generateContent?key=" + url.QueryEscape(anahtar)
	istek, err := http.NewRequest("POST", adres, bytes.NewReader(govde))
	if err != nil {
		return "", 0, "", fmt.Errorf("istek kurulamadı: %v", err)
	}
	istek.Header.Set("Content-Type", "application/json")
	yanit, err := sesIstemci.Do(istek)
	if err != nil {
		return "", 0, "", fmt.Errorf("Google'a bağlanılamadı. İnternet bağlantısını kontrol et.")
	}
	defer yanit.Body.Close()
	ham, err := io.ReadAll(io.LimitReader(yanit.Body, 8<<20))
	if err != nil {
		return "", 0, "", fmt.Errorf("cevap okunamadı: %v", err)
	}
	var y geminiYanit
	_ = json.Unmarshal(ham, &y)
	if yanit.StatusCode != http.StatusOK {
		return "", yanit.StatusCode, y.Error.Message, nil
	}
	if y.PromptFeedback.BlockReason != "" {
		return "", -1, y.PromptFeedback.BlockReason, nil
	}
	var b strings.Builder
	for _, c := range y.Candidates {
		for _, p := range c.Content.Parts {
			b.WriteString(p.Text)
		}
	}
	return strings.TrimSpace(b.String()), 200, "", nil
}
