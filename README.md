# MacarZeka

Ziraat mühendisleri için müşteri, satış, ödeme ve borç takip programı.

**İki şekilde kullanılır:**

| | Tarayıcı sürümü | Windows programı |
|---|---|---|
| **Adres** | [macarzeka'yı aç](https://huseyincinarmacar59-cell.github.io/macarzeka/) | [indir](https://github.com/huseyincinarmacar59-cell/macarzeka/releases/latest/download/MacarZeka-Windows-64bit.zip) |
| Kurulum | yok, linke tıkla | zip'i aç, çift tıkla |
| Kayıtlar nerede | tarayıcı hafızasında | klasörde dosya olarak |
| Günlük otomatik yedek | yok | var |
| Sesli kayıt | yok | var |
| Akıllı soru-cevap (Gemini) | yok | var |
| Kendi kendine güncelleme | sayfayı yenilemek yeter | var |
| Ne için uygun | denemek, göstermek | gerçek kullanım |

> **Tarayıcı sürümünde dikkat:** kayıtlar yalnızca o tarayıcıda durur.
> Tarayıcı verisi temizlenirse silinir ve başka bilgisayarda görünmez.
> Gerçek müşteri defteri için Windows programını kullan.

## Ne yapar

- **Panel** — bu ayki satış, tahsilat, toplam alacak, takip edilmesi gereken borçlular
- **Müşteriler** — arama, "borçlular" / "vadesi geçmiş" süzgeçleri, köye göre filtre
- **Müşteri kartı** — aldıkları, ödemeleri, bağlantıları, notları; borç kendiliğinden hesaplanır
- **Hesap bağlantısı** — bir kişinin hesabı başkasının üstüne yazılıysa iki kayıt birbirine bağlanır
- **Soru Sor** — "Ahmet Yılmaz borcunu ödedi mi?" gibi normal cümlelerle sorgulama
- **Sesli kayıt** — müşteriyi konuşarak anlat, program formu doldursun *(Windows)*
- **Bilgisayar eşleştirme** — dükkândaki iki bilgisayar 6 haneli kodla eşleşir; birinde yapılan değişiklik saniyeler içinde diğerine geçer. Sunucu yok: bilgisayarlar WebRTC ile doğrudan, şifreli bağlanır (tanışma için PeerJS kullanılır, kayıtlar oradan geçmez). Biri kapalıyken yapılanlar açılınca aktarılır; aynı kayıtta en son değişiklik kazanır
- **Otomatik güncelleme** — yeni sürüm çıkınca program haber verir ve kurar *(Windows)*

## Yeni sürüm çıkarma

### Tek tıkla (bilgisayara bir şey kurmadan)

1. [Actions → Sürüm yayımla](https://github.com/huseyincinarmacar59-cell/macarzeka/actions/workflows/surum.yml)
2. **Run workflow** → sürüm kutusuna `1.4` yaz → **Run workflow**

Gerisi kendiliğinden olur: kod denetlenir, Windows programı derlenir,
sürüm numarası koda yazılır, Releases sayfasına yüklenir.

### Tek komutla (bilgisayarda git varsa)

```bash
./yayinla.sh 1.4        # Linux / macOS / Git Bash
yayinla 1.4             # Windows komut istemi
```

Her iki yol da aynı sonucu verir. `main.go` içindeki sürüm numarasına
elle dokunmaya gerek yoktur; numara etiketten alınır.

## Veri nasıl korunuyor

Güncelleme **yalnızca `MacarZeka.exe`'yi** değiştirir. Dokunulmayanlar:

- `veriler.json` — müşteriler, satışlar, ödemeler, notlar
- `ayarlar.json` — Gemini anahtarı, mikrofon seçimi
- `yedekler/` — günlük kopyalar

Ayrıca kurulumdan **hemen önce** kayıtların ayrı bir kopyası alınır
(`yedekler/veriler-guncelleme-oncesi-….json`). İnen dosyanın gerçekten
Windows programı olduğu ve boyutunun tam geldiği doğrulanır; değilse
kurulmaz. Değiştirme yarıda kalırsa eski sürüm geri yüklenir.

Tarayıcı sürümünde yeni sürüm yayımlanması kayıtları etkilemez; veriler
aynı adresin tarayıcı hafızasında kalır.

Bu davranışların hepsi testlerle doğrulanır (aşağıya bak).

## Kayıtlar nerede (Windows)

Programın bulunduğu klasörde:

| Dosya | İçinde ne var |
|---|---|
| `veriler.json` | bütün müşteriler, satışlar, ödemeler, notlar |
| `ayarlar.json` | Gemini anahtarı ve mikrofon seçimi |
| `yedekler/` | her gün otomatik alınan kopyalar (son 60 gün) |

Hiçbir kayıt internete gönderilmez. Tek istisna: Gemini açıkken
**Soru Sor** ve **sesli kayıt**, soruyu ve defteri Google'a gönderir.
Gemini kapalıyken program tamamen internetsiz çalışır.

## Geliştirme

```bash
go vet ./...
go build -o macarzeka .            # bu makine için
GOOS=windows GOARCH=amd64 CGO_ENABLED=0 \
  go build -ldflags "-H windowsgui -s -w" -o MacarZeka.exe .
```

Arayüzün tamamı `index.html` içindedir ve `go:embed` ile programa gömülür.
Aynı dosya GitHub Pages'te tarayıcı sürümü olarak da sunulur: sayfa
`127.0.0.1` dışında açıldığında arka uç köprüsü devreye girmez ve
kayıtlar tarayıcı hafızasına yazılır.

### Testler

Testler gerçek programı çalıştırıp sahte bir Google/GitHub sunucusuna bağlar.
Electron gerekir (yalnızca test için):

```bash
npm install electron@33
xvfb-run -a electron testler/test-sunucu.js      # temel akış, kayıt, arama
xvfb-run -a electron testler/test-gemini.js      # Gemini soru-cevap
xvfb-run -a electron testler/test-ses.js         # sesli kayıt, mikrofon
xvfb-run -a electron testler/test-tarayici.js    # pencere/kapanma davranışı
xvfb-run -a electron testler/test-guncelleme.js  # otomatik güncelleme
xvfb-run -a electron testler/test-web.js         # tarayıcı sürümü
```

Bilgisayar eşleştirme testi (iki ayrı tarayıcı, sahte tanışma sunucusu; Playwright + Chrome gerekir):

```bash
cd testler/esitleme && npm i ws@8 && ./calistir.sh
```

Her test sonucu `*-sonuc.txt` dosyasına yazar.

## Dosyalar

| Dosya | Görevi |
|---|---|
| `main.go` | sunucu, veri okuma/yazma, pencere açma, tek kopya denetimi |
| `gemini.go` | ayarlar ve Gemini soru-cevap |
| `ses.go` | sesi yazıya çevirme, konuşmadan form alanlarını çıkarma |
| `guncelleme.go` | GitHub'dan sürüm denetimi ve kendini güncelleme |
| `sistem_windows.go` / `sistem_diger.go` | işletim sistemine özgü işler |
| `index.html` | bütün arayüz (hem programda hem tarayıcıda) |
| `yayinla.sh` / `yayinla.bat` | tek komutla sürüm yayımlama |
