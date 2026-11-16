package main

import (
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"os"
	"path/filepath"
	"strconv"
	"strings"
	"sync"
	"time"
)

/* ============================================================
   GitHub üzerinden güncelleme.
   Yeni sürümü indirir, programın kendisini değiştirir;
   veriler.json, ayarlar.json ve yedekler klasörüne ASLA dokunmaz.
   ============================================================ */

// Güncellemelerin alınacağı açık depo. Yeni sürüm = yeni etiket (örn. v1.4.0).
const depoSahibi = "huseyincinarmacar59-cell"
const depoAdi = "macarzeka"

const enBuyukProgramBayt = 120 << 20

// Sürüm sorgusu kısa sürmeli; indirme uzun sürebilir.
var bakisIstemci = &http.Client{Timeout: 20 * time.Second}
var guncellemeIstemci = &http.Client{Timeout: 300 * time.Second}

var (
	gKilit    sync.Mutex
	gSonBakis time.Time
	gSonuc    *GuncellemeBilgi
)

type GuncellemeBilgi struct {
	Var       bool   `json:"var"`
	Surum     string `json:"surum"`
	BuSurum   string `json:"buSurum"`
	Adres     string `json:"adres"`     // .exe indirme adresi
	Sayfa     string `json:"sayfa"`     // sürüm notları sayfası
	Notlar    string `json:"notlar"`
	Boyut     int64  `json:"boyut"`
	Indirebilir bool `json:"indirebilir"`
}

/* ---------- sürüm karşılaştırma ---------- */

func surumParcala(s string) []int {
	s = strings.TrimSpace(s)
	s = strings.TrimPrefix(strings.TrimPrefix(s, "v"), "V")
	if i := strings.IndexAny(s, "-+ "); i > 0 {
		s = s[:i]
	}
	var p []int
	for _, parca := range strings.Split(s, ".") {
		n, err := strconv.Atoi(strings.TrimSpace(parca))
		if err != nil {
			break
		}
		p = append(p, n)
	}
	return p
}

// a, b'den yeni mi?
func surumDahaYeni(a, b string) bool {
	pa, pb := surumParcala(a), surumParcala(b)
	if len(pa) == 0 {
		return false
	}
	for i := 0; i < len(pa) || i < len(pb); i++ {
		var x, y int
		if i < len(pa) {
			x = pa[i]
		}
		if i < len(pb) {
			y = pb[i]
		}
		if x != y {
			return x > y
		}
	}
	return false
}

/* ---------- GitHub'a bakma ---------- */

type githubSurum struct {
	TagName    string `json:"tag_name"`
	Name       string `json:"name"`
	Body       string `json:"body"`
	Draft      bool   `json:"draft"`
	Prerelease bool   `json:"prerelease"`
	HTMLURL    string `json:"html_url"`
	Assets     []struct {
		Name               string `json:"name"`
		Size               int64  `json:"size"`
		BrowserDownloadURL string `json:"browser_download_url"`
	} `json:"assets"`
}

func guncellemeAdresi() string {
	if u := os.Getenv("MACARZEKA_GUNCELLEME_UC"); u != "" {
		return strings.TrimRight(u, "/")
	}
	return "https://api.github.com/repos/" + depoSahibi + "/" + depoAdi
}

func guncellemeBak(zorla bool) (*GuncellemeBilgi, error) {
	gKilit.Lock()
	if !zorla && gSonuc != nil && time.Since(gSonBakis) < 30*time.Minute {
		b := *gSonuc
		gKilit.Unlock()
		return &b, nil
	}
	gKilit.Unlock()

	istek, err := http.NewRequest("GET", guncellemeAdresi()+"/releases/latest", nil)
	if err != nil {
		return nil, fmt.Errorf("istek kurulamadı: %v", err)
	}
	istek.Header.Set("Accept", "application/vnd.github+json")
	istek.Header.Set("User-Agent", "MacarZeka/"+surum)

	yanit, err := bakisIstemci.Do(istek)
	if err != nil {
		return nil, fmt.Errorf("GitHub'a bağlanılamadı. İnternet bağlantısını kontrol et.")
	}
	defer yanit.Body.Close()

	ham, _ := io.ReadAll(io.LimitReader(yanit.Body, 4<<20))

	switch {
	case yanit.StatusCode == 404:
		return nil, fmt.Errorf("Depoda yayımlanmış sürüm bulunamadı (%s/%s).", depoSahibi, depoAdi)
	case yanit.StatusCode == 403:
		return nil, fmt.Errorf("GitHub şu an istek kabul etmiyor (saatlik sınır). Birazdan tekrar dene.")
	case yanit.StatusCode != 200:
		return nil, fmt.Errorf("GitHub beklenmeyen cevap verdi (%d).", yanit.StatusCode)
	}

	var s githubSurum
	if err := json.Unmarshal(ham, &s); err != nil {
		return nil, fmt.Errorf("GitHub cevabı okunamadı.")
	}
	if s.Draft {
		return nil, fmt.Errorf("Yayımlanmış sürüm bulunamadı.")
	}

	bilgi := &GuncellemeBilgi{
		BuSurum: surum,
		Surum:   strings.TrimPrefix(s.TagName, "v"),
		Sayfa:   s.HTMLURL,
		Notlar:  kisaltNotlar(s.Body),
	}
	for _, a := range s.Assets {
		if strings.EqualFold(filepath.Ext(a.Name), ".exe") {
			bilgi.Adres = a.BrowserDownloadURL
			bilgi.Boyut = a.Size
			break
		}
	}
	bilgi.Var = surumDahaYeni(bilgi.Surum, surum)
	bilgi.Indirebilir = bilgi.Var && bilgi.Adres != "" && kendiniDegistirebilir()

	gKilit.Lock()
	gSonBakis = time.Now()
	gSonuc = bilgi
	gKilit.Unlock()

	b := *bilgi
	return &b, nil
}

func kisaltNotlar(s string) string {
	s = strings.TrimSpace(s)
	if len(s) > 1200 {
		s = s[:1200] + "…"
	}
	return s
}

/* ---------- kurma ---------- */

// Güncellemeden önce kayıtların bir kopyasını alır. Veri her şeyden önemli.
func guncellemeOncesiYedek() {
	ham, err := os.ReadFile(veriDosya)
	if err != nil || !gecerliMi(ham) {
		return
	}
	ad := "veriler-guncelleme-oncesi-" + time.Now().Format("2006-01-02-1504") + ".json"
	os.WriteFile(filepath.Join(yedekDizin, ad), ham, 0o644)
}

func guncellemeKur() (string, error) {
	bilgi, err := guncellemeBak(true)
	if err != nil {
		return "", err
	}
	if !bilgi.Var {
		return "", fmt.Errorf("Zaten en son sürümü kullanıyorsun (%s).", surum)
	}
	if bilgi.Adres == "" {
		return "", fmt.Errorf("Bu sürümde indirilecek program dosyası yok. GitHub sayfasından elle indir.")
	}
	if !kendiniDegistirebilir() {
		return "", fmt.Errorf("Bu işletim sisteminde kendi kendine güncelleme kapalı.")
	}

	istek, err := http.NewRequest("GET", bilgi.Adres, nil)
	if err != nil {
		return "", fmt.Errorf("indirme kurulamadı: %v", err)
	}
	istek.Header.Set("User-Agent", "MacarZeka/"+surum)

	yanit, err := guncellemeIstemci.Do(istek)
	if err != nil {
		return "", fmt.Errorf("İndirilemedi. İnternet bağlantısını kontrol et.")
	}
	defer yanit.Body.Close()
	if yanit.StatusCode != 200 {
		return "", fmt.Errorf("İndirilemedi (%d).", yanit.StatusCode)
	}

	veri, err := io.ReadAll(io.LimitReader(yanit.Body, enBuyukProgramBayt+1))
	if err != nil {
		return "", fmt.Errorf("İndirme yarıda kesildi. Tekrar dene.")
	}
	if int64(len(veri)) > enBuyukProgramBayt {
		return "", fmt.Errorf("İndirilen dosya beklenenden çok büyük, kurulmadı.")
	}
	if len(veri) < 500000 {
		return "", fmt.Errorf("İndirilen dosya eksik görünüyor (%d bayt), kurulmadı.", len(veri))
	}
	if !programImzasiTamam(veri) {
		return "", fmt.Errorf("İndirilen dosya bir program dosyası değil, kurulmadı.")
	}
	if bilgi.Boyut > 0 && int64(len(veri)) != bilgi.Boyut {
		return "", fmt.Errorf("İndirilen dosya eksik geldi, kurulmadı. Tekrar dene.")
	}

	guncellemeOncesiYedek()

	if err := kendiniDegistir(veri); err != nil {
		return "", err
	}
	return bilgi.Surum, nil
}

/* ---------- programın kendini değiştirmesi ----------
   Çalışan dosyanın üstüne yazılamaz; bu yüzden yeniden adlandırma yapılır:
     MacarZeka.exe       -> MacarZeka.exe.eski
     MacarZeka.exe.yeni  -> MacarZeka.exe
   Bir adım bile başarısız olursa eski dosya geri konur.
   Veri dosyalarına hiç dokunulmaz.                                        */

func kendiniDegistir(veri []byte) error {
	exe, err := os.Executable()
	if err != nil {
		return fmt.Errorf("Program dosyasının yeri bulunamadı: %v", err)
	}
	if c, err := filepath.EvalSymlinks(exe); err == nil {
		exe = c
	}
	yeni := exe + ".yeni"
	eski := exe + ".eski"

	os.Remove(yeni)
	os.Remove(eski)

	if err := os.WriteFile(yeni, veri, 0o755); err != nil {
		return fmt.Errorf("Yeni sürüm klasöre yazılamadı. Program yazma izni olmayan bir yerde olabilir (%v).", err)
	}
	if err := os.Rename(exe, eski); err != nil {
		os.Remove(yeni)
		return fmt.Errorf("Eski sürüm kenara alınamadı, güncelleme yapılmadı (%v).", err)
	}
	if err := os.Rename(yeni, exe); err != nil {
		os.Rename(eski, exe) // geri al
		os.Remove(yeni)
		return fmt.Errorf("Yeni sürüm yerine konamadı; eski sürüm geri yüklendi (%v).", err)
	}
	return nil
}

/* ---------- eski dosya temizliği ---------- */

func eskiSurumleriSil() {
	exe, err := os.Executable()
	if err != nil {
		return
	}
	os.Remove(exe + ".eski")
	dizin := filepath.Dir(exe)
	girisler, err := os.ReadDir(dizin)
	if err != nil {
		return
	}
	for _, g := range girisler {
		if strings.HasSuffix(g.Name(), ".eski") || strings.HasSuffix(g.Name(), ".yeni") {
			os.Remove(filepath.Join(dizin, g.Name()))
		}
	}
}
