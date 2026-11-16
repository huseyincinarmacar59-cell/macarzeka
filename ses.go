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
	"time"
)

/* ============================================================
   Sesi yazıya çevirme ve konuşmadan kayıt alanlarını çıkarma.
   Ses hiçbir zaman diske yazılmaz; yalnızca bellekte işlenir.
   ============================================================ */

const varsayilanSesModel = "gemini-3.8-flash"

// Gemini'nin satır içi istek sınırı 20 MB'tır; güvenli pay bırakıyoruz.
const enBuyukSesBayt = 13 << 20

var sesIstemci = &http.Client{Timeout: 180 * time.Second}

const sesYonergeMetin = `Sen Türkçe konuşmayı yazıya çeviren bir araçsın.
Duyduğun konuşmayı olduğu gibi, Türkçe yazım kurallarına uygun yaz.
Sadece yazıya çevrilmiş metni ver; açıklama, başlık, tırnak ekleme.
Konuşmada anlamadığın bir yer varsa oraya [anlaşılmadı] yaz.
Ses boşsa veya hiç konuşma yoksa yalnızca [ses yok] yaz.`

const sesYonergeForm = `Sen bir ziraat mühendisinin sesli notunu müşteri kayıt formuna çeviren araçsın.
Önce konuşmayı Türkçe olarak yazıya çevir, sonra içinden form alanlarını çıkar.

ÇOK ÖNEMLİ KURALLAR:
- Yalnızca konuşmada GEÇEN bilgileri doldur. Geçmeyen alanı boş bırak. ASLA tahmin etme, uydurma.
- Para: "sekiz bin lira" -> 8000, "on iki bin beş yüz" -> 12500. Sadece sayı yaz, "₺" yazma.
- Tarih: YYYY-AA-GG biçiminde. "bugün" -> bugünün tarihi, "dün" -> bir önceki gün,
  "geçen hafta" gibi belirsizse boş bırak.
- Ödeme yöntemi yalnızca şunlardan biri olabilir: Nakit, Havale / EFT, Kredi kartı, Çek, Senet.
  Konuşmada geçmiyorsa boş bırak.
- İlişki yalnızca şunlardan biri olabilir: Babası, Oğlu, Kardeşi, Eşi, Ortağı, Kiracısı, Akrabası.
- "falancanın hesabına yazılsın", "hesap babasının üstüne" gibi bir ifade geçerse,
  sana verilen MEVCUT MÜŞTERİLER listesinden o kişiyi bul ve hesapSahibiId alanına
  o kişinin id'sini yaz. Listede yoksa hesapSahibiId'yi boş bırak, adını hesapSahibiAd'a yaz.
- Konuşmada geçen ama forma girmeyen her şeyi (tarla durumu, hastalık, söz verilen şeyler)
  "not" alanına yaz.
- Net duyamadığın, emin olmadığın her alanın adını "supheli" listesine ekle. Dürüst ol:
  emin değilsen mutlaka supheli'ye koy. Bu liste kullanıcının kontrol edeceği alanları gösterir.

Cevabını SADECE şu JSON biçiminde ver, başka hiçbir şey yazma, markdown kod bloğu kullanma:
{
  "metin": "konuşmanın aynen yazıya çevrilmiş hali",
  "ad": "", "tel": "", "koy": "", "arazi": "",
  "urun": "", "miktar": "", "tarih": "", "tutar": 0,
  "odenen": 0, "yontem": "", "odemeTarihi": "", "vade": "", "vadeNot": "",
  "hesapSahibiId": "", "hesapSahibiAd": "", "iliski": "",
  "not": "",
  "supheli": []
}`

type sesGirdi struct {
	MimeTipi string
	VeriB64  string
	Amac     string // "metin" veya "form"
	Baglam   string
}

type sesCikti struct {
	Metin string         `json:"metin"`
	Veri  map[string]any `json:"veri,omitempty"`
	Ham   string         `json:"ham,omitempty"`
}

// Gemini'ye sesi gönderir. amac "form" ise yapılandırılmış alanları da çıkarır.
func geminiSes(a Ayarlar, g sesGirdi) (sesCikti, error) {
	var bos sesCikti

	anahtar := strings.TrimSpace(a.GeminiAnahtar)
	if anahtar == "" {
		return bos, fmt.Errorf("Gemini anahtarı girilmemiş. Ayarlar ekranından anahtarı yapıştır.")
	}

	hamBoyut := base64.StdEncoding.DecodedLen(len(g.VeriB64))
	if hamBoyut > enBuyukSesBayt {
		return bos, fmt.Errorf("Kayıt çok uzun (%d MB). En fazla 3 dakika konuş, sonra kaydet.", hamBoyut>>20)
	}
	if hamBoyut < 1200 {
		return bos, fmt.Errorf("Ses kaydı boş geldi. Mikrofon çalışmıyor olabilir; Ayarlar'dan mikrofonu dene.")
	}

	model := strings.TrimSpace(a.GeminiSesModel)
	if model == "" {
		model = varsayilanSesModel
	}

	yonerge := sesYonergeMetin
	istem := "Bu ses kaydını Türkçe yazıya çevir."
	if g.Amac == "form" {
		yonerge = sesYonergeForm
		istem = "Bu sesli notu yazıya çevir ve form alanlarını çıkar."
	}
	if strings.TrimSpace(g.Baglam) != "" {
		istem += "\n\n" + g.Baglam
	}

	tip := strings.TrimSpace(g.MimeTipi)
	if tip == "" {
		tip = "audio/webm"
	}
	// "audio/webm;codecs=opus" -> "audio/webm" (Gemini ana tipi bekler)
	if i := strings.IndexByte(tip, ';'); i > 0 {
		tip = strings.TrimSpace(tip[:i])
	}

	govdeKur := func(jsonIste bool) ([]byte, error) {
		icerik := map[string]any{
			"parts": []any{
				map[string]any{"text": istem},
				map[string]any{"inline_data": map[string]any{"mime_type": tip, "data": g.VeriB64}},
			},
		}
		uretim := map[string]any{"temperature": 0.1, "maxOutputTokens": 3000}
		if jsonIste {
			uretim["response_mime_type"] = "application/json"
		}
		return json.Marshal(map[string]any{
			"system_instruction": map[string]any{"parts": []any{map[string]any{"text": yonerge}}},
			"contents":           []any{icerik},
			"generationConfig":   uretim,
		})
	}

	cagir := func(jsonIste bool) (string, int, string, error) {
		govde, err := govdeKur(jsonIste)
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
			return "", 0, "", fmt.Errorf("Google'a bağlanılamadı. İnternet bağlantısını kontrol et. (%v)", err)
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
		return b.String(), 200, "", nil
	}

	jsonIste := g.Amac == "form"
	cevap, kod, mesaj, err := cagir(jsonIste)
	if err != nil {
		return bos, err
	}
	// Bazı modeller response_mime_type alanını tanımaz; o alan olmadan bir kez daha dene.
	if kod == 400 && jsonIste && sesAlanHatasi(mesaj) {
		cevap, kod, mesaj, err = cagir(false)
		if err != nil {
			return bos, err
		}
	}
	if kod != 200 {
		return bos, sesHataCevir(kod, mesaj, model)
	}

	cevap = strings.TrimSpace(cevap)
	if cevap == "" {
		return bos, fmt.Errorf("Google boş cevap döndürdü. Tekrar konuşmayı dene.")
	}

	if g.Amac != "form" {
		metin := temizMetin(cevap)
		if metin == "" || strings.Contains(strings.ToLower(metin), "[ses yok]") {
			return bos, fmt.Errorf("Konuşma duyulmadı. Mikrofona daha yakın ve yüksek sesle konuş.")
		}
		return sesCikti{Metin: metin}, nil
	}

	nesne, hata := jsonAyikla(cevap)
	if hata != nil {
		// JSON gelmediyse en azından metni kurtar — ama boş kaydı metin sanmayalım
		kurtarilan := temizMetin(cevap)
		if kurtarilan == "" || strings.Contains(strings.ToLower(kurtarilan), "[ses yok]") {
			return bos, fmt.Errorf("Konuşma duyulmadı. Mikrofona daha yakın ve yüksek sesle konuş.")
		}
		return sesCikti{Metin: kurtarilan, Ham: cevap}, nil
	}
	metin, _ := nesne["metin"].(string)
	metin = temizMetin(metin)
	if metin == "" || strings.Contains(strings.ToLower(metin), "[ses yok]") {
		return bos, fmt.Errorf("Konuşma duyulmadı. Mikrofona daha yakın ve yüksek sesle konuş.")
	}
	return sesCikti{Metin: metin, Veri: nesne}, nil
}

func sesAlanHatasi(m string) bool {
	m = strings.ToLower(m)
	return strings.Contains(m, "response_mime_type") || strings.Contains(m, "responsemimetype") ||
		strings.Contains(m, "unknown name") || strings.Contains(m, "invalid json payload")
}

func sesHataCevir(kod int, mesaj, model string) error {
	alt := strings.ToLower(mesaj)
	switch {
	case kod == -1:
		return fmt.Errorf("Google bu kaydı işlemedi (%s).", mesaj)
	case kod == 400 && (strings.Contains(alt, "audio") || strings.Contains(alt, "modalit") ||
		strings.Contains(alt, "mime") || strings.Contains(alt, "not supported")):
		return fmt.Errorf("Seçili ses modeli (%s) ses kaydını kabul etmedi. Ayarlar'dan başka bir ses modeli seç. Google'ın mesajı: %s", model, kisalt(mesaj))
	case kod == 400 && strings.Contains(alt, "api key"):
		return fmt.Errorf("Anahtar geçersiz görünüyor. Ayarlar'dan kontrol et.")
	case kod == 400:
		return fmt.Errorf("İstek reddedildi (400). Model adı yanlış olabilir: %s. Google'ın mesajı: %s", model, kisalt(mesaj))
	case kod == 401 || kod == 403:
		return fmt.Errorf("Anahtar kabul edilmedi. Google AI Studio'dan yeni anahtar al ve Ayarlar'a yapıştır.")
	case kod == 404:
		return fmt.Errorf("Ses modeli bulunamadı: %s. Ayarlar'dan başka bir model seç.", model)
	case kod == 413:
		return fmt.Errorf("Kayıt çok uzun geldi. Daha kısa konuşup dene.")
	case kod == 429:
		return fmt.Errorf("Google kotası doldu. Biraz bekleyip tekrar dene; ücretsiz kullanımda dakikalık sınır vardır.")
	case kod >= 500:
		return fmt.Errorf("Google tarafında geçici sorun (%d). Birazdan tekrar dene.", kod)
	}
	return fmt.Errorf("Beklenmeyen cevap (%d): %s", kod, kisalt(mesaj))
}

// Modelin eklediği kod bloğu işaretlerini ve tırnakları temizler.
func temizMetin(s string) string {
	s = strings.TrimSpace(s)
	if strings.HasPrefix(s, "```") {
		if i := strings.IndexByte(s, '\n'); i >= 0 {
			s = s[i+1:]
		}
		s = strings.TrimSuffix(strings.TrimSpace(s), "```")
	}
	s = strings.TrimSpace(s)
	if len(s) >= 2 && s[0] == '"' && s[len(s)-1] == '"' {
		var c string
		if json.Unmarshal([]byte(s), &c) == nil {
			s = c
		}
	}
	return strings.TrimSpace(s)
}

// Cevabın içinden JSON nesnesini çıkarır (kod bloğu veya fazladan metin olsa bile).
func jsonAyikla(s string) (map[string]any, error) {
	s = strings.TrimSpace(s)
	if strings.HasPrefix(s, "```") {
		if i := strings.IndexByte(s, '\n'); i >= 0 {
			s = s[i+1:]
		}
		s = strings.TrimSuffix(strings.TrimSpace(s), "```")
		s = strings.TrimSpace(s)
	}
	bas := strings.IndexByte(s, '{')
	son := strings.LastIndexByte(s, '}')
	if bas < 0 || son <= bas {
		return nil, fmt.Errorf("json bulunamadi")
	}
	var m map[string]any
	if err := json.Unmarshal([]byte(s[bas:son+1]), &m); err != nil {
		return nil, err
	}
	return m, nil
}
