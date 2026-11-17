// MacarZeka — müşteri, satış, ödeme ve bağlantı takibi.
// Tek dosyalık program: arayüzü kendi içinde taşır, veriyi kendi klasöründeki
// veriler.json dosyasında tutar, pencereyi bilgisayarda kurulu Edge/Chrome ile açar.
package main

import (
	"crypto/rand"
	"encoding/hex"
	"encoding/json"
	"fmt"
	"io"
	"net"
	"net/http"
	"os"
	"os/exec"
	"path/filepath"
	"runtime"
	"sort"
	"strings"
	"sync"
	"time"

	"embed"
)

//go:embed index.html
var arayuz []byte

// Ana ekran ikonu ve manifest: hem tarayıcı sürümünde hem programda aynı dosyalar.
//
//go:embed icon-180.png icon-192.png icon-512.png manifest.json
var varliklar embed.FS

const surum = "1.3"

var (
	klasor     string
	veriDosya  string
	yedekDizin string
	jeton      string

	kilit     sync.Mutex
	sonNabiz  time.Time
	nabizGeldi bool
	kapat     = make(chan struct{})
	kapatBir  sync.Once
)

/* ---------------- veri biçimi ---------------- */

type Veri struct {
	Surum     int               `json:"surum"`
	Musteriler []json.RawMessage `json:"musteriler"`
	Satislar   []json.RawMessage `json:"satislar"`
	Odemeler   []json.RawMessage `json:"odemeler"`
}

func bosVeri() Veri {
	return Veri{Surum: 1, Musteriler: []json.RawMessage{}, Satislar: []json.RawMessage{}, Odemeler: []json.RawMessage{}}
}

// Gelen JSON'un beklenen üç diziyi taşıdığını doğrular.
func gecerliMi(ham []byte) bool {
	var k struct {
		Musteriler *[]json.RawMessage `json:"musteriler"`
		Satislar   *[]json.RawMessage `json:"satislar"`
		Odemeler   *[]json.RawMessage `json:"odemeler"`
	}
	if err := json.Unmarshal(ham, &k); err != nil {
		return false
	}
	return k.Musteriler != nil && k.Satislar != nil && k.Odemeler != nil
}

/* ---------------- klasör ---------------- */

func yazilabilirMi(d string) bool {
	t := filepath.Join(d, ".macarzeka-yazma-testi")
	if err := os.WriteFile(t, []byte("ok"), 0o644); err != nil {
		return false
	}
	os.Remove(t)
	return true
}

func klasorBelirle() string {
	if exe, err := os.Executable(); err == nil {
		d := filepath.Dir(exe)
		if yazilabilirMi(d) {
			return d
		}
	}
	if c, err := os.UserConfigDir(); err == nil {
		d := filepath.Join(c, "MacarZeka")
		if os.MkdirAll(d, 0o755) == nil && yazilabilirMi(d) {
			return d
		}
	}
	d, _ := os.Getwd()
	return d
}

func hazirla() {
	klasor = klasorBelirle()
	veriDosya = filepath.Join(klasor, "veriler.json")
	yedekDizin = filepath.Join(klasor, "yedekler")
	os.MkdirAll(yedekDizin, 0o755)
}

/* ---------------- okuma / yazma ---------------- */

func enYeniYedek() string {
	girisler, err := os.ReadDir(yedekDizin)
	if err != nil {
		return ""
	}
	var adlar []string
	for _, g := range girisler {
		ad := g.Name()
		if strings.HasPrefix(ad, "veriler-") && strings.HasSuffix(ad, ".json") {
			adlar = append(adlar, ad)
		}
	}
	if len(adlar) == 0 {
		return ""
	}
	sort.Strings(adlar)
	return filepath.Join(yedekDizin, adlar[len(adlar)-1])
}

type okumaSonucu struct {
	Veri   json.RawMessage `json:"veri"`
	Dosya  string          `json:"dosya"`
	Klasor string          `json:"klasor"`
	Uyari  string          `json:"uyari,omitempty"`
}

func oku() okumaSonucu {
	bos, _ := json.Marshal(bosVeri())
	sonuc := okumaSonucu{Veri: bos, Dosya: veriDosya, Klasor: klasor}

	ham, err := os.ReadFile(veriDosya)
	if err != nil {
		return sonuc // dosya yok: temiz başlangıç
	}
	if gecerliMi(ham) {
		sonuc.Veri = json.RawMessage(ham)
		return sonuc
	}

	// bozuk: kopyasını sakla, yedeğe dön
	os.WriteFile(fmt.Sprintf("%s.bozuk-%d", veriDosya, time.Now().Unix()), ham, 0o644)
	if y := enYeniYedek(); y != "" {
		if yham, err := os.ReadFile(y); err == nil && gecerliMi(yham) {
			sonuc.Veri = json.RawMessage(yham)
			sonuc.Uyari = "veriler.json okunamadı. Son yedek yüklendi: " + filepath.Base(y)
			return sonuc
		}
	}
	sonuc.Uyari = "veriler.json okunamadı ve kullanılabilir yedek bulunamadı. Boş başlatıldı; eski dosya .bozuk uzantısıyla klasörde duruyor."
	return sonuc
}

func yaz(ham []byte) error {
	if !gecerliMi(ham) {
		return fmt.Errorf("veri bicimi taninmadi, yazilmadi")
	}
	gecici := veriDosya + ".tmp"
	f, err := os.OpenFile(gecici, os.O_CREATE|os.O_WRONLY|os.O_TRUNC, 0o644)
	if err != nil {
		return err
	}
	if _, err := f.Write(ham); err != nil {
		f.Close()
		os.Remove(gecici)
		return err
	}
	if err := f.Sync(); err != nil { // diske gerçekten yazıldığından emin ol
		f.Close()
		os.Remove(gecici)
		return err
	}
	if err := f.Close(); err != nil {
		os.Remove(gecici)
		return err
	}
	if err := os.Rename(gecici, veriDosya); err != nil {
		os.Remove(gecici)
		return err
	}
	return nil
}

func gunlukYedek() {
	ham, err := os.ReadFile(veriDosya)
	if err != nil || !gecerliMi(ham) {
		return
	}
	ad := "veriler-" + time.Now().Format("2006-01-02") + ".json"
	hedef := filepath.Join(yedekDizin, ad)
	if _, err := os.Stat(hedef); err == nil {
		return // bugünün yedeği zaten var
	}
	os.WriteFile(hedef, ham, 0o644)

	girisler, _ := os.ReadDir(yedekDizin)
	var adlar []string
	for _, g := range girisler {
		n := g.Name()
		if strings.HasPrefix(n, "veriler-") && strings.HasSuffix(n, ".json") {
			adlar = append(adlar, n)
		}
	}
	sort.Strings(adlar)
	for len(adlar) > 60 {
		os.Remove(filepath.Join(yedekDizin, adlar[0]))
		adlar = adlar[1:]
	}
}

/* ---------------- http ---------------- */

func jetonTamam(r *http.Request) bool {
	if c, err := r.Cookie("mz"); err == nil && c.Value == jeton {
		return true
	}
	return r.URL.Query().Get("t") == jeton
}

func jsonYaz(w http.ResponseWriter, kod int, govde any) {
	w.Header().Set("Content-Type", "application/json; charset=utf-8")
	w.Header().Set("Cache-Control", "no-store")
	w.WriteHeader(kod)
	json.NewEncoder(w).Encode(govde)
}

func nabizAt() {
	kilit.Lock()
	sonNabiz = time.Now()
	nabizGeldi = true
	kilit.Unlock()
}

func sunucuKur() *http.ServeMux {
	m := http.NewServeMux()

	m.HandleFunc("/", func(w http.ResponseWriter, r *http.Request) {
		if r.URL.Path != "/" {
			http.NotFound(w, r)
			return
		}
		if !jetonTamam(r) {
			http.Error(w, "yetkisiz", http.StatusForbidden)
			return
		}
		http.SetCookie(w, &http.Cookie{
			Name: "mz", Value: jeton, Path: "/",
			HttpOnly: true, SameSite: http.SameSiteStrictMode,
		})
		nabizAt()
		w.Header().Set("Content-Type", "text/html; charset=utf-8")
		w.Header().Set("Cache-Control", "no-store")
		w.Write(arayuz)
	})

	// İkonlar ve manifest (jeton istemez; gizli bir şey değiller).
	for _, ad := range []string{"icon-180.png", "icon-192.png", "icon-512.png", "manifest.json"} {
		dosya := ad
		m.HandleFunc("/"+dosya, func(w http.ResponseWriter, r *http.Request) {
			ham, err := varliklar.ReadFile(dosya)
			if err != nil {
				http.NotFound(w, r)
				return
			}
			if strings.HasSuffix(dosya, ".png") {
				w.Header().Set("Content-Type", "image/png")
			} else {
				w.Header().Set("Content-Type", "application/manifest+json; charset=utf-8")
			}
			w.Header().Set("Cache-Control", "public, max-age=86400")
			w.Write(ham)
		})
	}

	api := func(fn func(http.ResponseWriter, *http.Request)) http.HandlerFunc {
		return func(w http.ResponseWriter, r *http.Request) {
			if !jetonTamam(r) {
				jsonYaz(w, http.StatusForbidden, map[string]any{"ok": false, "hata": "yetkisiz"})
				return
			}
			fn(w, r)
		}
	}

	m.HandleFunc("/api/oku", api(func(w http.ResponseWriter, r *http.Request) {
		nabizAt()
		jsonYaz(w, http.StatusOK, oku())
	}))

	m.HandleFunc("/api/yaz", api(func(w http.ResponseWriter, r *http.Request) {
		nabizAt()
		ham, err := io.ReadAll(http.MaxBytesReader(w, r.Body, 200<<20))
		if err != nil {
			jsonYaz(w, http.StatusOK, map[string]any{"ok": false, "hata": "veri alinamadi: " + err.Error()})
			return
		}
		if err := yaz(ham); err != nil {
			jsonYaz(w, http.StatusOK, map[string]any{"ok": false, "hata": err.Error()})
			return
		}
		jsonYaz(w, http.StatusOK, map[string]any{"ok": true, "dosya": veriDosya})
	}))

	m.HandleFunc("/api/nabiz", api(func(w http.ResponseWriter, r *http.Request) {
		nabizAt()
		jsonYaz(w, http.StatusOK, map[string]any{"ok": true})
	}))

	m.HandleFunc("/api/bilgi", api(func(w http.ResponseWriter, r *http.Request) {
		nabizAt()
		jsonYaz(w, http.StatusOK, map[string]any{
			"ok": true, "surum": surum, "klasor": klasor, "dosya": veriDosya, "uygulama": "macarzeka",
		})
	}))

	m.HandleFunc("/api/ayarlar", api(func(w http.ResponseWriter, r *http.Request) {
		nabizAt()
		a := ayarOku()
		if r.Method == "POST" {
			var g struct {
				Anahtar    *string `json:"anahtar"`
				Model      *string `json:"model"`
				SesModel   *string `json:"sesModel"`
				Acik       *bool   `json:"acik"`
				MikrofonId *string `json:"mikrofonId"`
				MikrofonAd *string `json:"mikrofonAd"`
			}
			ham, _ := io.ReadAll(http.MaxBytesReader(w, r.Body, 1<<20))
			if err := json.Unmarshal(ham, &g); err != nil {
				jsonYaz(w, http.StatusOK, map[string]any{"ok": false, "hata": "ayarlar okunamadi"})
				return
			}
			// Anahtar alanı yalnızca gönderildiyse değişir; boş gönderilirse silinir.
			if g.Anahtar != nil {
				a.GeminiAnahtar = strings.TrimSpace(*g.Anahtar)
			}
			if g.Model != nil && strings.TrimSpace(*g.Model) != "" {
				a.GeminiModel = strings.TrimSpace(*g.Model)
			}
			if g.SesModel != nil && strings.TrimSpace(*g.SesModel) != "" {
				a.GeminiSesModel = strings.TrimSpace(*g.SesModel)
			}
			if g.Acik != nil {
				a.GeminiAcik = *g.Acik
			}
			if g.MikrofonId != nil {
				a.MikrofonId = strings.TrimSpace(*g.MikrofonId)
			}
			if g.MikrofonAd != nil {
				a.MikrofonAd = strings.TrimSpace(*g.MikrofonAd)
			}
			if a.GeminiAnahtar == "" {
				a.GeminiAcik = false
			}
			if err := ayarYaz(a); err != nil {
				jsonYaz(w, http.StatusOK, map[string]any{"ok": false, "hata": err.Error()})
				return
			}
		}
		jsonYaz(w, http.StatusOK, map[string]any{
			"ok": true, "model": a.GeminiModel, "sesModel": a.GeminiSesModel, "acik": a.GeminiAcik,
			"anahtarVar": a.GeminiAnahtar != "", "anahtarMaske": anahtarMaskesi(a.GeminiAnahtar),
			"mikrofonId": a.MikrofonId, "mikrofonAd": a.MikrofonAd,
		})
	}))

	m.HandleFunc("/api/dinle", api(func(w http.ResponseWriter, r *http.Request) {
		nabizAt()
		var g struct {
			Ses    string `json:"ses"`
			Tip    string `json:"tip"`
			Amac   string `json:"amac"`
			Baglam string `json:"baglam"`
		}
		ham, err := io.ReadAll(http.MaxBytesReader(w, r.Body, 48<<20))
		if err != nil {
			jsonYaz(w, http.StatusOK, map[string]any{"ok": false, "hata": "Kayıt alınamadı: çok uzun olabilir."})
			return
		}
		if err := json.Unmarshal(ham, &g); err != nil {
			jsonYaz(w, http.StatusOK, map[string]any{"ok": false, "hata": "ses bicimi hatali"})
			return
		}
		a := ayarOku()
		cikti, err := geminiSes(a, sesGirdi{MimeTipi: g.Tip, VeriB64: g.Ses, Amac: g.Amac, Baglam: g.Baglam})
		if err != nil {
			jsonYaz(w, http.StatusOK, map[string]any{"ok": false, "hata": err.Error()})
			return
		}
		jsonYaz(w, http.StatusOK, map[string]any{
			"ok": true, "metin": cikti.Metin, "veri": cikti.Veri, "model": a.GeminiSesModel,
		})
	}))

	m.HandleFunc("/api/sor", api(func(w http.ResponseWriter, r *http.Request) {
		nabizAt()
		var g struct {
			Soru   string `json:"soru"`
			Baglam string `json:"baglam"`
			Deneme bool   `json:"deneme"`
		}
		ham, err := io.ReadAll(http.MaxBytesReader(w, r.Body, 64<<20))
		if err != nil {
			jsonYaz(w, http.StatusOK, map[string]any{"ok": false, "hata": "soru alinamadi"})
			return
		}
		if err := json.Unmarshal(ham, &g); err != nil {
			jsonYaz(w, http.StatusOK, map[string]any{"ok": false, "hata": "soru bicimi hatali"})
			return
		}
		a := ayarOku()
		if !g.Deneme && !a.GeminiAcik {
			jsonYaz(w, http.StatusOK, map[string]any{"ok": false, "hata": "Gemini kapali"})
			return
		}
		cevap, err := geminiSor(a, g.Soru, g.Baglam)
		if err != nil {
			jsonYaz(w, http.StatusOK, map[string]any{"ok": false, "hata": err.Error()})
			return
		}
		jsonYaz(w, http.StatusOK, map[string]any{"ok": true, "cevap": cevap, "model": a.GeminiModel})
	}))

	m.HandleFunc("/api/guncelleme/bak", api(func(w http.ResponseWriter, r *http.Request) {
		nabizAt()
		zorla := r.URL.Query().Get("zorla") == "1"
		bilgi, err := guncellemeBak(zorla)
		if err != nil {
			jsonYaz(w, http.StatusOK, map[string]any{"ok": false, "hata": err.Error()})
			return
		}
		jsonYaz(w, http.StatusOK, map[string]any{"ok": true, "bilgi": bilgi,
			"depo": depoSahibi + "/" + depoAdi})
	}))

	m.HandleFunc("/api/guncelleme/kur", api(func(w http.ResponseWriter, r *http.Request) {
		nabizAt()
		yeni, err := guncellemeKur()
		if err != nil {
			jsonYaz(w, http.StatusOK, map[string]any{"ok": false, "hata": err.Error()})
			return
		}
		jsonYaz(w, http.StatusOK, map[string]any{"ok": true, "surum": yeni})
		// Cevap gittikten sonra yeni sürümü başlat ve bu kopyayı kapat.
		go func() {
			time.Sleep(1500 * time.Millisecond)
			if err := yenidenBaslat(); err != nil {
				return
			}
			time.Sleep(900 * time.Millisecond)
			kapan()
		}()
	}))

	m.HandleFunc("/api/klasor", api(func(w http.ResponseWriter, r *http.Request) {
		nabizAt()
		klasorAc(klasor)
		jsonYaz(w, http.StatusOK, map[string]any{"ok": true})
	}))

	return m
}

/* ---------------- pencere ---------------- */

func tarayiciYollari() []string {
	if runtime.GOOS != "windows" {
		return []string{"microsoft-edge", "google-chrome", "chromium", "chromium-browser"}
	}
	pf := os.Getenv("ProgramFiles")
	pf86 := os.Getenv("ProgramFiles(x86)")
	la := os.Getenv("LOCALAPPDATA")
	return []string{
		filepath.Join(pf86, `Microsoft\Edge\Application\msedge.exe`),
		filepath.Join(pf, `Microsoft\Edge\Application\msedge.exe`),
		filepath.Join(la, `Microsoft\Edge\Application\msedge.exe`),
		filepath.Join(pf, `Google\Chrome\Application\chrome.exe`),
		filepath.Join(pf86, `Google\Chrome\Application\chrome.exe`),
		filepath.Join(la, `Google\Chrome\Application\chrome.exe`),
	}
}

func tarayiciBul() string {
	for _, y := range tarayiciYollari() {
		if y == "" {
			continue
		}
		if filepath.IsAbs(y) {
			if st, err := os.Stat(y); err == nil && !st.IsDir() {
				return y
			}
		} else if p, err := exec.LookPath(y); err == nil {
			return p
		}
	}
	return ""
}

// Pencereyi açar. Uygulama kipinde açabildiyse o süreci döndürür.
func pencereAc(adres string) *exec.Cmd {
	profil := filepath.Join(klasor, ".pencere-ayarlari")
	os.MkdirAll(profil, 0o755)

	if t := tarayiciBul(); t != "" {
		c := exec.Command(t,
			"--app="+adres,
			"--user-data-dir="+profil,
			"--no-first-run",
			"--no-default-browser-check",
			"--disable-background-mode",
			"--window-size=1360,880",
		)
		if err := c.Start(); err == nil {
			return c
		}
	}
	varsayilanTarayicidaAc(adres)
	return nil
}

/* ---------------- tek kopya ---------------- */

const portDosyaAdi = "oturum.port"

// Program zaten açıksa onun penceresini açıp true döner.
func zatenAcikMi() bool {
	ham, err := os.ReadFile(filepath.Join(klasor, portDosyaAdi))
	if err != nil {
		return false
	}
	parcalar := strings.SplitN(strings.TrimSpace(string(ham)), " ", 2)
	if len(parcalar) != 2 {
		return false
	}
	adres := "http://127.0.0.1:" + parcalar[0]
	istemci := &http.Client{Timeout: 900 * time.Millisecond}
	yanit, err := istemci.Get(adres + "/api/bilgi?t=" + parcalar[1])
	if err != nil {
		return false
	}
	defer yanit.Body.Close()
	govde, _ := io.ReadAll(yanit.Body)
	if !strings.Contains(string(govde), "macarzeka") {
		return false
	}
	jeton = parcalar[1]
	pencereAc(adres + "/?t=" + jeton)
	return true
}

/* ---------------- kapanış ---------------- */

func kapan() { kapatBir.Do(func() { close(kapat) }) }

// Pencere kapandığında (nabız kesildiğinde) programı da kapatır.
func nobetci() {
	bitis := time.NewTicker(2 * time.Second)
	defer bitis.Stop()
	baslangic := time.Now()
	for {
		select {
		case <-kapat:
			return
		case <-bitis.C:
			kilit.Lock()
			geldi, son := nabizGeldi, sonNabiz
			kilit.Unlock()
			if !geldi {
				if time.Since(baslangic) > 120*time.Second {
					kapan() // pencere hiç açılmadı
					return
				}
				continue
			}
			if time.Since(son) > 12*time.Second { // 4 kaçırılmış sinyal
				kapan() // pencere kapatıldı
				return
			}
		}
	}
}

/* ---------------- ana ---------------- */

func main() {
	hazirla()

	if zatenAcikMi() {
		return
	}

	b := make([]byte, 16)
	if _, err := rand.Read(b); err != nil {
		hataGoster("Program başlatılamadı: " + err.Error())
		return
	}
	jeton = hex.EncodeToString(b)

	dinleyici, err := net.Listen("tcp", "127.0.0.1:0")
	if err != nil {
		hataGoster("Program başlatılamadı (ağ bağlantı noktası açılamadı):\n" + err.Error())
		return
	}
	port := dinleyici.Addr().(*net.TCPAddr).Port
	portDosya := filepath.Join(klasor, portDosyaAdi)
	os.WriteFile(portDosya, []byte(fmt.Sprintf("%d %s", port, jeton)), 0o600)
	defer os.Remove(portDosya)

	gunlukYedek()
	eskiSurumleriSil()

	sunucu := &http.Server{Handler: sunucuKur()}
	go func() { sunucu.Serve(dinleyici) }()

	adres := fmt.Sprintf("http://127.0.0.1:%d/?t=%s", port, jeton)
	pencereAc(adres)
	// Kapanma kararını yalnızca pencereden gelen yaşam sinyali verir.
	// Tarayıcı süreci, işi başka bir sürece devredip hemen kapanabildiği için
	// o sürecin sonlanmasına bakmıyoruz.
	go nobetci()

	<-kapat
	sunucu.Close()
}
