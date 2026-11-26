# Macar Talimat

Macar Tarım için ilaç kullanım talimatı programı.

1. **İlaçlar** sekmesinden ilaçları bir kere ekleyin: adı ve nasıl kullanılacağı.
2. **Kullanım Yaz** sekmesinde müşterinin adını yazın, kullanacağı ilaçları işaretleyin.
3. **Talimatı oluştur** → **Yazdır / PDF**: A4 kullanım talimatı yazıcıdan çıkar ya da PDF olarak kaydedilir.

## Windows 11'e kurulum (Microsoft Edge)

1. Edge'de programın adresini açın.
2. Adres çubuğundaki **Uygulama kullanılabilir / Yükle** simgesine (ya da programdaki **⬇ Uygulama olarak yükle** düğmesine) tıklayın.
3. Program masaüstüne ve Başlat menüsüne eklenir, internetsiz de açılır.

Güncellemeler kendiliğinden gelir; program açıkken "Yeni güncelleme hazır" bandı çıkarsa **Şimdi yenile**'ye basın.

## Veriler

İlk açılışta program bir kere **kayıt klasörü** sorar (ör. Belgeler\Macar Talimat Kayıtlar). Ondan sonra
her değişiklikte o klasördeki `macar-talimat-veriler.json` güncellenir ve her gün `yedekler\` içine bir
kopya alınır (son 60 gün). Tarayıcı verisi silinse bile aynı klasör seçilince ilaçlar ve talimatlar geri gelir.
Dosya adı MacarZeka'nınkinden farklıdır; ikisi aynı klasöre kaydedilse de karışmaz.

Klasör seçilmezse bilgiler yalnızca tarayıcıda durur; o zaman **Ayarlar → Yedek al** ile arada bir yedek alın.

## Geliştirici notu

Yeni sürüm yayınlarken `sw.js` ve `app.js` içindeki `SURUM` değerlerini artırın; yoksa kurulu programlar güncellemeyi almaz.
