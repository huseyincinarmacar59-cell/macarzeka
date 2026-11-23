# Abonelik sistemi

Kepçe, Macar Zeka ve Macar Talimat için elden ödemeli aylık abonelik.

- **Panel:** `yonetim/` → https://huseyincinarmacar59-cell.github.io/macarzeka/yonetim/
- **Çekirdek:** `cekirdek.js` — kodları internetsiz üretir/doğrular (SHA-256 HMAC)
- **Uygulama tarafı:** `istemci.js` — şerit, uyarı penceresi, kilit ekranı
- **Gömme:** `olustur.js` — iki dosyayı uygulamaların `index.html`'ine gömer, panel kasasını (`yonetim/kasa.js`) üretir

Kurallar: ödeme her ayın 1'i · 1-5 gün gecikme küçük şerit · 6+ gün günde bir kapatılabilir uyarı ·
uygulama kendi kendine asla kilitlenmez, sadece paneldeki kapatma koduyla kapanır.

`istemci.js` ya da `cekirdek.js` değişirse yeniden gömmek için:

```bash
SIFRE='panel-sifresi' node lisans/olustur.js /guvenli/yer/gizli.json ../kep-e
```

`gizli.json` depoya **konmaz**.
