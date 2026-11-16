package main

import (
	"bytes"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"net/url"
	"os"
	"path/filepath"
	"strings"
	"time"
)

/* ---------------- ayarlar ---------------- */

type Ayarlar struct {
	GeminiAnahtar  string `json:"gemini_anahtar"`
	GeminiModel    string `json:"gemini_model"`
	GeminiSesModel string `json:"gemini_ses_model"`
	GeminiAcik     bool   `json:"gemini_acik"`
	MikrofonId     string `json:"mikrofon_id"`
	MikrofonAd     string `json:"mikrofon_ad"`
}

const varsayilanModel = "gemini-3.5-flash-lite"

func ayarDosyasi() string { return filepath.Join(klasor, "ayarlar.json") }

func ayarVarsayilan() Ayarlar {
	return Ayarlar{GeminiModel: varsayilanModel, GeminiSesModel: varsayilanSesModel}
}

func ayarOku() Ayarlar {
	a := ayarVarsayilan()
	ham, err := os.ReadFile(ayarDosyasi())
	if err != nil {
		return a
	}
	if err := json.Unmarshal(ham, &a); err != nil {
		return ayarVarsayilan()
	}
	if strings.TrimSpace(a.GeminiModel) == "" {
		a.GeminiModel = varsayilanModel
	}
	if strings.TrimSpace(a.GeminiSesModel) == "" {
		a.GeminiSesModel = varsayilanSesModel
	}
	return a
}

func ayarYaz(a Ayarlar) error {
	ham, err := json.MarshalIndent(a, "", "  ")
	if err != nil {
		return err
	}
	gecici := ayarDosyasi() + ".tmp"
	if err := os.WriteFile(gecici, ham, 0o600); err != nil {
		return err
	}
	return os.Rename(gecici, ayarDosyasi())
}

// Anahtarın yalnızca son 4 hanesi arayüzde gösterilir.
func anahtarMaskesi(k string) string {
	k = strings.TrimSpace(k)
	if k == "" {
		return ""
	}
	if len(k) <= 4 {
		return "••••"
	}
	return "••••••••" + k[len(k)-4:]
}

/* ---------------- Gemini çağrısı ---------------- */

const sistemYonergesi = `Sen bir ziraat mühendisinin müşteri defterini okuyan yardımcısısın.
Sana aşağıda o defterin tamamı verilecek; kullanıcının sorusunu YALNIZCA bu defterdeki bilgilere dayanarak cevapla.

Kurallar:
- Türkçe, kısa ve net konuş. Gereksiz giriş cümlesi kurma, doğrudan cevabı ver.
- Para tutarlarını "12.500 ₺" biçiminde yaz.
- Tarihleri "08.10.2026" biçiminde yaz.
- Defterde olmayan bir şey sorulursa "Bu bilgi kayıtlarda yok" de. Asla tahmin etme, uydurma.
- Birden fazla kişi listelenecekse madde madde yaz.
- Hesabı başkasının üstüne yazılı müşterilerde bunu mutlaka belirt.
- Hesap yaparken dikkatli ol: kalan borç = toplam alış - toplam ödeme.
- Kullanıcı defterde olmayan genel bir şey sorarsa (hava durumu, gübre tavsiyesi gibi)
  kısaca bunun bu defterle ilgili olmadığını söyle.`

type geminiIcerik struct {
	Parts []geminiParca `json:"parts"`
}
type geminiParca struct {
	Text string `json:"text"`
}
type geminiIstek struct {
	SystemInstruction *geminiIcerik      `json:"system_instruction,omitempty"`
	Contents          []geminiIcerik     `json:"contents"`
	GenerationConfig  map[string]any     `json:"generationConfig,omitempty"`
}
type geminiYanit struct {
	Candidates []struct {
		Content struct {
			Parts []geminiParca `json:"parts"`
		} `json:"content"`
		FinishReason string `json:"finishReason"`
	} `json:"candidates"`
	PromptFeedback struct {
		BlockReason string `json:"blockReason"`
	} `json:"promptFeedback"`
	Error struct {
		Code    int    `json:"code"`
		Message string `json:"message"`
		Status  string `json:"status"`
	} `json:"error"`
}

func geminiUcNokta() string {
	if u := os.Getenv("MACARZEKA_GEMINI_UC"); u != "" {
		return strings.TrimRight(u, "/")
	}
	return "https://generativelanguage.googleapis.com/v1beta"
}

var geminiIstemci = &http.Client{Timeout: 60 * time.Second}

// Soruyu deftere dayanarak Gemini'ye sorar.
func geminiSor(a Ayarlar, soru, baglam string) (string, error) {
	anahtar := strings.TrimSpace(a.GeminiAnahtar)
	if anahtar == "" {
		return "", fmt.Errorf("Gemini anahtarı girilmemiş. Ayarlar ekranından anahtarı yapıştır.")
	}
	model := strings.TrimSpace(a.GeminiModel)
	if model == "" {
		model = varsayilanModel
	}

	kullanici := "=== MÜŞTERİ DEFTERİ ===\n" + baglam + "\n\n=== SORU ===\n" + soru
	govde, err := json.Marshal(geminiIstek{
		SystemInstruction: &geminiIcerik{Parts: []geminiParca{{Text: sistemYonergesi}}},
		Contents:          []geminiIcerik{{Parts: []geminiParca{{Text: kullanici}}}},
		GenerationConfig:  map[string]any{"temperature": 0.2, "maxOutputTokens": 1500},
	})
	if err != nil {
		return "", fmt.Errorf("istek hazırlanamadı: %v", err)
	}

	adres := geminiUcNokta() + "/models/" + url.PathEscape(model) + ":generateContent?key=" + url.QueryEscape(anahtar)
	istek, err := http.NewRequest("POST", adres, bytes.NewReader(govde))
	if err != nil {
		return "", fmt.Errorf("istek kurulamadı: %v", err)
	}
	istek.Header.Set("Content-Type", "application/json")

	yanit, err := geminiIstemci.Do(istek)
	if err != nil {
		return "", fmt.Errorf("Google'a bağlanılamadı. İnternet bağlantısını kontrol et. (%v)", err)
	}
	defer yanit.Body.Close()

	ham, err := io.ReadAll(io.LimitReader(yanit.Body, 8<<20))
	if err != nil {
		return "", fmt.Errorf("cevap okunamadı: %v", err)
	}

	var y geminiYanit
	_ = json.Unmarshal(ham, &y)

	if yanit.StatusCode != http.StatusOK {
		switch yanit.StatusCode {
		case 400:
			ek := y.Error.Message
			if strings.Contains(strings.ToLower(ek), "api key") {
				return "", fmt.Errorf("Anahtar geçersiz görünüyor. Ayarlar'dan tekrar kontrol et.")
			}
			return "", fmt.Errorf("İstek reddedildi (400). Model adı yanlış olabilir: %s. Google'ın mesajı: %s", model, kisalt(ek))
		case 401, 403:
			return "", fmt.Errorf("Anahtar kabul edilmedi (yetki hatası). Google AI Studio'dan yeni bir anahtar al ve Ayarlar'a yapıştır.")
		case 404:
			return "", fmt.Errorf("Model bulunamadı: %s. Ayarlar'dan başka bir model seç.", model)
		case 429:
			return "", fmt.Errorf("Google kotası doldu (429). Biraz bekleyip tekrar dene; ücretsiz kullanımda dakikalık sınır vardır.")
		case 500, 502, 503, 504:
			return "", fmt.Errorf("Google tarafında geçici sorun (%d). Birazdan tekrar dene.", yanit.StatusCode)
		default:
			return "", fmt.Errorf("Beklenmeyen cevap (%d): %s", yanit.StatusCode, kisalt(y.Error.Message))
		}
	}

	if y.PromptFeedback.BlockReason != "" {
		return "", fmt.Errorf("Google bu soruyu yanıtlamadı (%s).", y.PromptFeedback.BlockReason)
	}

	var b strings.Builder
	for _, a := range y.Candidates {
		for _, p := range a.Content.Parts {
			b.WriteString(p.Text)
		}
	}
	cevap := strings.TrimSpace(b.String())
	if cevap == "" {
		if len(y.Candidates) > 0 && y.Candidates[0].FinishReason != "" {
			return "", fmt.Errorf("Boş cevap geldi (%s). Soruyu biraz farklı yazıp dene.", y.Candidates[0].FinishReason)
		}
		return "", fmt.Errorf("Google boş cevap döndürdü. Birazdan tekrar dene.")
	}
	return cevap, nil
}

func kisalt(s string) string {
	s = strings.TrimSpace(s)
	if len(s) > 220 {
		return s[:220] + "…"
	}
	return s
}
