# MacarZeka

Ziraat mühendisleri için müşteri, satış, ödeme ve borç takip programı.
Windows'ta tek dosya hâlinde çalışır, kurulum istemez, bütün kayıtlar
kendi klasöründe durur.

## Ne yapar

- **Panel** — bu ayki satış, tahsilat, toplam alacak ve takip edilmesi gereken borçlular
- **Müşteriler** — arama, "borçlular" ve "vadesi geçmiş" süzgeçleri, köye göre filtre
- **Müşteri kartı** — aldıkları, ödemeleri, bağlantıları, notları; borç kendiliğinden hesaplanır
- **Hesap bağlantısı** — bir kişinin hesabı başkasının üstüne yazılıysa iki kayıt birbirine bağlanır
- **Soru Sor** — "Ahmet Yılmaz borcunu ödedi mi?" gibi normal cümlelerle sorgulama
- **Sesli kayıt** — müşteriyi konuşarak anlat, program formu doldursun
- **Otomatik güncelleme** — yeni sürüm çıkınca program kendisi haber verir ve kurar

## Kurulum (kullanıcı için)

1. [Releases](../../releases/latest) sayfasından `MacarZeka-Windows-64bit.zip` dosyasını indir.
2. İçindeki `MacarZeka` klasörünü `C:\MacarZeka` gibi bir yere çıkar.
   *Program Files içine koyma — oraya yazma izni olmayabilir.*
3. `MacarZeka.exe` dosyasına çift tıkla.
4. Windows "bilinmeyen yayımcı" derse: **Ek bilgi → Yine de çalıştır**.

Ayrıntılı kullanım için pakete konan `OKUBENI.txt` dosyasına bak.

## Kayıtlar nerede

Programın bulunduğu klasörde:

| Dosya | İçinde ne var |
|---|---|
| `veriler.json` | bütün müşteriler, satışlar, ödemeler, notlar |
| `ayarlar.json` | Gemini anahtarı ve mikrofon seçimi |
| `yedekler/` | her gün otomatik alınan kopyalar (son 60 gün) |

Hiçbir kayıt internete gönderilmez. Tek istisna: Gemini açıkken **Soru Sor**
ve **sesli kayıt** özellikleri, soruyu ve defteri Google'a gönderir.
Gemini kapalıyken program tamamen internetsiz çalışır.

## Yeni sürüm çıkarma (geliştirici için)

```bash
git tag v1.4
git push origin v1.4
```

Gerisi kendiliğinden olur:

1. GitHub Actions Windows programını derler (sürüm numarasını etiketten alır).
2. `MacarZeka.exe` ve zip paketi Releases sayfasına yüklenir.
3. Kullanıcıların programı açılışta bunu görür, "yeni sürüm var" der,
   onay verilince indirip kurar ve kendini yeniden başlatır.

Güncelleme sırasında `veriler.json`, `ayarlar.json` ve `yedekler/`
klasörüne **dokunulmaz**; ayrıca kurulumdan önce kayıtların bir kopyası alınır.

## Geliştirme

```bash
go vet ./...
go build -o macarzeka .            # bu makine için
GOOS=windows GOARCH=amd64 CGO_ENABLED=0 \
  go build -ldflags "-H windowsgui -s -w" -o MacarZeka.exe .
```

Arayüzün tamamı `index.html` içindedir ve `go:embed` ile programa gömülür;
ayrı bir dosya dağıtmaya gerek yoktur.

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
| `index.html` | bütün arayüz |
