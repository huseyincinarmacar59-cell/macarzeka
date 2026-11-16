"use strict";
/* SES TESTİ — sahte mikrofon ile uçtan uca.
   Gerçek programı başlatır, sahte bir Google sunucusu kurar,
   gerçek MediaRecorder ile kayıt alır ve bütün zinciri dener. */

const { app, BrowserWindow } = require("electron");
const { spawn } = require("child_process");
const http = require("http");
const path = require("path");
const fs = require("fs");

// Sahte mikrofon + izin kutusunu otomatik onayla (SADECE testte)
app.commandLine.appendSwitch("use-fake-device-for-media-stream");
app.commandLine.appendSwitch("use-fake-ui-for-media-stream");

const KOK = "/home/claude/macarzeka/test-ses";
fs.rmSync(KOK, { recursive: true, force: true });
fs.mkdirSync(KOK, { recursive: true });
fs.copyFileSync("/home/claude/macarzeka/macarzeka-linux", path.join(KOK, "MacarZeka"));
fs.chmodSync(path.join(KOK, "MacarZeka"), 0o755);

const veriDosya = path.join(KOK, "veriler.json");
const ayarDosya = path.join(KOK, "ayarlar.json");
const portDosya = path.join(KOK, "oturum.port");

const hatalar = [], notlar = [];
let sonAdim = "(baslangic)";
/* NOBETCI_WATCHDOG: test takilirsa nerede kaldigini yazip bitir */
setTimeout(function () {
  hatalar.push("  ✗ TEST TAKILDI — son tamamlanan adim: " + sonAdim);
  try { bitir(); } catch (e) { process.exit(1); }
}, 200000);
function ok(ad, sart, ek) {
  sonAdim = ad;
  if (sart) notlar.push("  ✓ " + ad);
  else hatalar.push("  ✗ " + ad + (ek !== undefined ? " → " + ek : ""));
}
function bekle(ms) { return new Promise(function (r) { setTimeout(r, ms); }); }

/* ---- sahte Google ---- */
let mod = "form";
let gecikme = 0;
let sonIstek = null;
let istekSayisi = 0;
let sonModel = "";

const sahte = http.createServer(function (req, res) {
  let g = "";
  req.on("data", function (d) { g += d; });
  req.on("end", function () {
    istekSayisi++;
    sonIstek = { yol: req.url, govde: g };
    sonModel = (req.url.match(/models\/([^:]+):/) || [])[1] || "";
    const yolla = function () {
      if (mod === "modalite") {
        res.writeHead(400, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ error: { code: 400, message: "Audio input modality is not supported by this model", status: "INVALID_ARGUMENT" } }));
        return;
      }
      if (mod === "mimeRed") {
        // ilk istek response_mime_type yüzünden reddedilsin, ikincisi geçsin
        const j = JSON.parse(g);
        if (j.generationConfig && j.generationConfig.response_mime_type) {
          res.writeHead(400, { "Content-Type": "application/json" });
          res.end(JSON.stringify({ error: { code: 400, message: "Unknown name \"response_mime_type\" at 'generation_config'", status: "INVALID_ARGUMENT" } }));
          return;
        }
        mod = "form";
      }
      if (mod === "429") {
        res.writeHead(429, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ error: { code: 429, message: "Quota exceeded" } }));
        return;
      }
      if (mod === "sesYok") {
        res.writeHead(200, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ candidates: [{ content: { parts: [{ text: "[ses yok]" }] }, finishReason: "STOP" }] }));
        return;
      }
      let metin;
      if (mod === "metin") {
        metin = "Ahmet Yılmaz borcunu ödedi mi?";
      } else if (mod === "not") {
        metin = "Buğdayda sararma başlamış, iki hafta sonra tekrar bakılacak.";
      } else if (mod === "kodblok") {
        // model JSON'u kod bloğuna sarmış olsun — ayıklama sınanıyor
        metin = "```json\n" + JSON.stringify({
          metin: "Veli Kaya Yenice'den geldi.", ad: "Veli Kaya", koy: "Yenice", supheli: []
        }) + "\n```";
      } else {
        metin = JSON.stringify({
          metin: "Ahmet Yılmaz Karaağaç'tan, dört çuval gübre aldı sekiz bin lira, beş bin lirasını nakit ödedi, kalanı hasat sonrası, hesabı babası Mehmet Yılmaz'ın üstüne yazılsın, buğdayında sararma var.",
          ad: "Ahmet Yılmaz", tel: "", koy: "Karaağaç", arazi: "",
          urun: "Gübre", miktar: "4 çuval", tarih: "2026-10-12", tutar: 8000,
          odenen: 5000, yontem: "Nakit", odemeTarihi: "2026-10-12", vade: "", vadeNot: "Hasat sonrası",
          hesapSahibiId: "", hesapSahibiAd: "Mehmet Yılmaz", iliski: "Oğlu",
          not: "Buğdayında sararma var.",
          supheli: ["tel"]
        });
      }
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ candidates: [{ content: { parts: [{ text: metin }] }, finishReason: "STOP" }] }));
    };
    if (gecikme) { const d = gecikme; gecikme = 0; setTimeout(yolla, d); } else yolla();
  });
});

let surec = null;
app.on("window-all-closed", function () {});

app.whenReady().then(async function () {
  await new Promise(function (r) { sahte.listen(0, "127.0.0.1", r); });
  const sp = sahte.address().port;

  surec = spawn(path.join(KOK, "MacarZeka"), [], {
    cwd: KOK,
    env: Object.assign({}, process.env, { MACARZEKA_GEMINI_UC: "http://127.0.0.1:" + sp, PATH: "/nonexistent" }),
    stdio: "ignore"
  });

  let p = null;
  for (let i = 0; i < 150; i++) {
    if (fs.existsSync(portDosya)) {
      const t = fs.readFileSync(portDosya, "utf8").trim().split(" ");
      if (t.length === 2) { p = { port: t[0], jeton: t[1] }; break; }
    }
    await bekle(100);
  }
  ok("Program başladı", !!p);
  if (!p) return bitir();

  const win = new BrowserWindow({ width: 1400, height: 920, show: false,
    webPreferences: { contextIsolation: true, nodeIntegration: false } });
  win.webContents.on("console-message", function (_e, s, m, l, k) {
    if (s >= 2) hatalar.push("  ✗ KONSOL: " + m + " (" + k + ":" + l + ")");
  });
  win.webContents.on("render-process-gone", function (_e, d) { hatalar.push("  ✗ SAYFA ÇÖKTÜ: " + JSON.stringify(d)); });
  // mikrofon izni otomatik verilsin (test ortamı)
  win.webContents.session.setPermissionRequestHandler(function (_wc, izin, geri) { geri(true); });

  await win.loadURL("http://127.0.0.1:" + p.port + "/?t=" + p.jeton);
  await bekle(900);
  const js = function (k) { return win.webContents.executeJavaScript(k, true); };

  await js("window.confirm=function(){return true}; window.alert=function(){}; 0;");
  await js("ornekYukle()"); await bekle(900);
  ok("Örnek kayıtlar yüklendi", await js("veri.musteriler.length === 4"));

  /* ---- 1. anahtarsızken mikrofon kapalı olmalı ---- */
  await js("git('yeni')"); await bekle(300);
  ok("Anahtar yokken mikrofon butonu kapalı", await js("!!document.querySelector('[data-kayit=\"form\"]').disabled"));
  ok("Kapalı sebebi yazıyor", (await js("document.getElementById('ekran').innerHTML")).indexOf("Gemini anahtarı girilmeli") >= 0);

  /* ---- 2. anahtar gir ---- */
  await js("git('ayarlar')"); await bekle(300);
  await js("document.getElementById('geminiAnahtar').value='AIzaSES_TEST_9999'; ayarKaydet(false); 0;");
  await bekle(800);
  ok("Anahtar kaydedildi", await js("ayar.anahtarVar === true"));
  ok("Ses modeli varsayılanı geldi", (await js("ayar.sesModel")) === "gemini-3.8-flash", await js("ayar.sesModel"));

  /* ---- 3. mikrofon listesi ---- */
  await js("mikrofonYenile(); 0;"); await bekle(1200);
  const mikSayi = await js("ses.mikrofonlar.length");
  ok("Mikrofon(lar) bulundu", mikSayi > 0, "adet=" + mikSayi);
  ok("Mikrofon adı geldi", (await js("ses.mikrofonlar[0].ad")).length > 0, await js("ses.mikrofonlar[0].ad"));
  ok("Ayarlarda mikrofon listesi çizildi", (await js("document.getElementById('ekran').innerHTML")).indexOf("mikSec") >= 0);

  /* ---- 4. mikrofon seçimi kaydediliyor mu ---- */
  const mikId = await js("ses.mikrofonlar[0].id");
  await js("document.getElementById('mikSec').value=" + JSON.stringify(mikId) + "; ayarKaydet(false); 0;");
  await bekle(800);
  ok("Seçilen mikrofon kaydedildi", (await js("ayar.mikrofonId")) === mikId, await js("ayar.mikrofonId"));
  const ayarDosyaIcerik = JSON.parse(fs.readFileSync(ayarDosya, "utf8"));
  ok("Mikrofon ayarlar.json'a yazıldı", ayarDosyaIcerik.mikrofon_id === mikId);
  ok("Mikrofon adı da yazıldı", typeof ayarDosyaIcerik.mikrofon_ad === "string" && ayarDosyaIcerik.mikrofon_ad.length > 0);

  /* ---- 5. canlı seviye göstergesi ---- */
  await js("mikrofonDene(); 0;"); await bekle(1600);
  ok("Seviye ölçümü açıldı", await js("ses.seviyeAcik === true"));
  ok("Ses seviyesi okunuyor (sahte mikrofon ton üretir)", (await js("ses.enYuksek")) > 0, "enYuksek=" + await js("ses.enYuksek"));
  ok("Seviye çubukları çizildi", (await js("document.querySelectorAll('.seviye i').length")) > 0);
  ok("Seviye yazısı güncellendi", (await js("(document.getElementById('seviyeYazi')||{}).textContent || ''")).length > 0,
     await js("(document.getElementById('seviyeYazi')||{}).textContent || '(yok)'"));
  await js("seviyeKapat(); ciz(); 0;"); await bekle(400);
  ok("Seviye ölçümü kapandı", await js("ses.seviyeAcik === false && ses.akis === null"));

  /* ---- 6. KONUŞARAK MÜŞTERİ DOLDURMA ---- */
  mod = "form";
  await js("git('yeni')"); await bekle(300);
  ok("Mikrofon butonu artık açık", await js("!document.querySelector('[data-kayit=\"form\"]').disabled"));
  await js("kayitBaslat('form'); 0;");
  await bekle(1500);
  ok("Kayıt başladı", await js("ses.aktif === true"));
  ok("Kayıt şeridi göründü", (await js("document.getElementById('ekran').innerHTML")).indexOf("Bitir ve çöz") >= 0);
  ok("Süre sayacı çalışıyor", (await js("(document.getElementById('sesSure')||{}).textContent||''")).indexOf("0:0") === 0);
  await bekle(1800);
  await js("kayitDurdur(); 0;");
  await bekle(2500);
  ok("Kayıt bitti ve temizlendi", await js("ses.aktif === false && ses.akis === null"));
  ok("Ses Google'a gönderildi", istekSayisi > 0);

  const istek = JSON.parse(sonIstek.govde);
  const sesParca = istek.contents[0].parts.filter(function (x) { return x.inline_data; })[0];
  ok("İstekte inline_data var", !!sesParca);
  ok("Ses mime tipi gönderildi", sesParca && /^audio\//.test(sesParca.inline_data.mime_type), sesParca && sesParca.inline_data.mime_type);
  ok("Mime tipinde codecs eki yok", sesParca && sesParca.inline_data.mime_type.indexOf(";") < 0, sesParca && sesParca.inline_data.mime_type);
  ok("Gerçek ses verisi gönderildi", sesParca && sesParca.inline_data.data.length > 2000, "b64 uzunluk=" + (sesParca ? sesParca.inline_data.data.length : 0));
  ok("Ses modeli kullanıldı", sonModel === "gemini-3.8-flash", sonModel);
  ok("Mevcut müşteriler bağlam olarak gönderildi", sonIstek.govde.indexOf("MEVCUT MÜŞTERİLER") >= 0);
  ok("Bugünün tarihi gönderildi", sonIstek.govde.indexOf("BUGÜNÜN TARİHİ") >= 0);

  /* form alanları doldu mu */
  ok("Ad alanı dolduruldu", (await js("document.getElementById('f_ad').value")) === "Ahmet Yılmaz");
  ok("Köy alanı dolduruldu", (await js("document.getElementById('f_koy').value")) === "Karaağaç");
  ok("Ürün alanı dolduruldu", (await js("document.getElementById('f_urun').value")) === "Gübre");
  ok("Miktar alanı dolduruldu", (await js("document.getElementById('f_miktar').value")) === "4 çuval");
  ok("Tutar sayıya çevrildi", (await js("document.getElementById('f_tutar').value")) === "8000", await js("document.getElementById('f_tutar').value"));
  ok("Ödenen sayıya çevrildi", (await js("document.getElementById('f_odenen').value")) === "5000");
  ok("Ödeme yöntemi seçildi", (await js("document.getElementById('f_yontem').value")) === "Nakit");
  ok("Tarih alanı dolduruldu", (await js("document.getElementById('f_tarih').value")) === "2026-10-12");
  ok("Vade notu dolduruldu", (await js("document.getElementById('f_vadenot').value")) === "Hasat sonrası");
  ok("İlişki seçildi", (await js("document.getElementById('f_iliski').value")) === "Oğlu");
  ok("Not alanı dolduruldu", (await js("document.getElementById('f_not').value")).indexOf("sararma") >= 0);

  /* hesap sahibi ada göre eşleşti mi */
  const hesapDeger = await js("document.getElementById('f_hesap').value");
  const mehmetId = await js("veri.musteriler.filter(function(m){return m.ad==='Mehmet Yılmaz'})[0].id");
  ok("Hesap sahibi ada göre eşleştirildi", hesapDeger === mehmetId, "secili=" + hesapDeger);

  /* kontrol paneli */
  const ekranHtml = await js("document.getElementById('ekran').innerHTML");
  ok("Duyulan metin gösterildi", ekranHtml.indexOf("dört çuval gübre") >= 0);
  ok("Kontrol uyarısı gösterildi", ekranHtml.indexOf("Kaydetmeden önce kontrol et") >= 0);
  ok("Şüpheli alan bildirildi", ekranHtml.indexOf("tel") >= 0 && ekranHtml.indexOf("net duyulmadı") >= 0);
  ok("Şüpheli alan kırmızı işaretlendi", await js("document.getElementById('f_tel').classList.contains('supheli')"));

  /* EN ÖNEMLİSİ: kendiliğinden kaydetmemeli */
  ok("KENDİLİĞİNDEN KAYDETMEDİ", await js("veri.musteriler.length === 4"), "müşteri sayısı=" + await js("veri.musteriler.length"));
  ok("Diske de yazmadı", JSON.parse(fs.readFileSync(veriDosya, "utf8")).musteriler.length === 4);

  /* kullanıcı onaylayınca kaydedilsin */
  await js("formKaydet(); 0;"); await bekle(900);
  ok("Kullanıcı Kaydet deyince kaydedildi", await js("veri.musteriler.length === 5"));
  const yeniId = await js("veri.musteriler.filter(function(m){return m.ad==='Ahmet Yılmaz' && m.koy==='Karaağaç'}).slice(-1)[0].id");
  ok("Satış kaydedildi", (await js("toplamAlis('" + yeniId + "')")) === 8000);
  ok("Ödeme kaydedildi", (await js("toplamOdeme('" + yeniId + "')")) === 5000);
  ok("Borç doğru hesaplandı", (await js("borc('" + yeniId + "')")) === 3000);
  ok("Hesap bağlantısı kuruldu", (await js("(bagliOlanlar('" + yeniId + "')[0]||{}).m ? bagliOlanlar('" + yeniId + "')[0].m.ad : ''")) === "Mehmet Yılmaz");
  ok("Diske yazıldı", JSON.parse(fs.readFileSync(veriDosya, "utf8")).musteriler.length === 5);
  ok("Ses dosyası diske YAZILMADI", !fs.readdirSync(KOK).some(function (f) { return /\.(webm|ogg|wav|mp3|m4a)$/i.test(f); }),
     fs.readdirSync(KOK).join(","));

  /* ---- 7. SESLİ SORU ---- */
  mod = "metin";
  await js("git('soru')"); await bekle(300);
  await js("kayitBaslat('soru'); 0;"); await bekle(1400);
  await js("kayitDurdur(); 0;"); await bekle(2500);
  ok("Sesli soru kutuya yazıldı", (await js("gorunum.soru")) === "Ahmet Yılmaz borcunu ödedi mi?", await js("gorunum.soru"));
  ok("Soru otomatik soruldu", !!(await js("gorunum.cevap && gorunum.cevap.metin ? 1 : 0")));
  ok("Soruda ses amacı 'metin' gitti", JSON.parse(sonIstek.govde).contents[0].parts[0].text.indexOf("yazıya çevir") >= 0);

  /* ---- 8. SESLİ NOT ---- */
  mod = "not";
  const ahmetId = await js("veri.musteriler.filter(function(m){return m.ad.indexOf('Ahmet')===0})[0].id");
  await js("git('musteri','" + ahmetId + "')"); await bekle(350);
  await js("kayitBaslat('not','yeniNot'); 0;"); await bekle(1400);
  await js("kayitDurdur(); 0;"); await bekle(2500);
  ok("Sesli not alanına yazıldı", (await js("(document.getElementById('yeniNot')||{}).value||''")).indexOf("sararma") >= 0,
     await js("(document.getElementById('yeniNot')||{}).value||'(bos)'"));
  ok("Not kendiliğinden kaydedilmedi", (await js("(msAl('" + ahmetId + "').notlar||[]).length")) === 1);

  /* ---- 9. JSON kod bloğu içinde gelirse ---- */
  mod = "kodblok";
  await js("git('yeni'); gorunum.mod='yeni'; ciz(); 0;"); await bekle(300);
  await js("kayitBaslat('form'); 0;"); await bekle(1400);
  await js("kayitDurdur(); 0;"); await bekle(2500);
  ok("Kod bloğundaki JSON ayıklandı", (await js("document.getElementById('f_ad').value")) === "Veli Kaya",
     await js("document.getElementById('f_ad').value"));

  /* ---- 10. response_mime_type reddedilirse tekrar denesin ---- */
  mod = "mimeRed";
  istekSayisi = 0;
  await js("git('yeni'); gorunum.mod='yeni'; ciz(); 0;"); await bekle(300);
  await js("kayitBaslat('form'); 0;"); await bekle(1400);
  await js("kayitDurdur(); 0;"); await bekle(3000);
  ok("Alan reddinde ikinci kez denendi", istekSayisi >= 2, "istek=" + istekSayisi);
  ok("İkinci denemede form doldu", (await js("document.getElementById('f_ad').value")) === "Ahmet Yılmaz",
     await js("document.getElementById('f_ad').value"));

  /* ---- 11. model ses kabul etmezse anlaşılır hata ---- */
  mod = "modalite";
  await js("git('yeni'); gorunum.mod='yeni'; ciz(); 0;"); await bekle(300);
  await js("kayitBaslat('form'); 0;"); await bekle(1400);
  await js("kayitDurdur(); 0;"); await bekle(2500);
  const hModalite = await js("document.getElementById('ekran').innerHTML");
  ok("Model ses kabul etmezse Türkçe yönlendirme", hModalite.indexOf("ses kaydını kabul etmedi") >= 0,
     (await js("gorunum.sesHata")).slice(0, 90));
  ok("Hatada çökmedi", await js("veri.musteriler.length === 5"), "müşteri=" + await js("veri.musteriler.length"));

  /* ---- 12. kota hatası ---- */
  mod = "429";
  await js("kayitBaslat('form'); 0;"); await bekle(1400);
  await js("kayitDurdur(); 0;"); await bekle(2500);
  ok("Kota hatası Türkçe gösterildi", (await js("gorunum.sesHata")).indexOf("kotası doldu") >= 0, await js("gorunum.sesHata"));

  /* ---- 13. konuşma duyulmazsa ---- */
  mod = "sesYok";
  await js("kayitBaslat('form'); 0;"); await bekle(1400);
  await js("kayitDurdur(); 0;"); await bekle(2500);
  ok("Boş konuşmada uyarı verildi", (await js("gorunum.sesHata")).indexOf("duyulmadı") >= 0, await js("gorunum.sesHata"));

  /* ---- 14. vazgeçme ---- */
  mod = "form";
  istekSayisi = 0;
  await js("kayitBaslat('form'); 0;"); await bekle(1200);
  await js("kayitIptal(); 0;"); await bekle(1200);
  ok("Vazgeçince kayıt temizlendi", await js("ses.aktif === false && ses.akis === null"));
  ok("Vazgeçince Google'a gönderilmedi", istekSayisi === 0, "istek=" + istekSayisi);

  /* ---- 15. ekran değişince kayıt durur (mikrofon açık kalmasın) ---- */
  await js("kayitBaslat('form'); 0;"); await bekle(1200);
  ok("Kayıt sürüyor", await js("ses.aktif === true"));
  await js("git('panel'); 0;"); await bekle(1200);
  ok("Ekran değişince mikrofon kapandı", await js("ses.aktif === false && ses.akis === null"));

  /* ---- 16. veri bozulmadı ---- */
  ok("Bütün bu işlemlerden sonra veri sağlam", JSON.parse(fs.readFileSync(veriDosya, "utf8")).musteriler.length === 5);

  /* ekran görüntüleri */
  mod = "form";
  await js("git('yeni'); gorunum.mod='yeni'; ciz(); 0;"); await bekle(300);
  await js("kayitBaslat('form'); 0;"); await bekle(1500);
  fs.writeFileSync("/home/claude/macarzeka/ses-kayit.png", (await win.webContents.capturePage()).toPNG());
  await js("kayitDurdur(); 0;"); await bekle(2600);
  fs.writeFileSync("/home/claude/macarzeka/ses-form.png", (await win.webContents.capturePage()).toPNG());
  await js("git('ayarlar'); 0;"); await bekle(400);
  await js("mikrofonDene(); 0;"); await bekle(1200);
  fs.writeFileSync("/home/claude/macarzeka/ses-ayarlar.png", (await win.webContents.capturePage()).toPNG());
  await js("seviyeKapat(); 0;");

  win.destroy();
  bitir();
}).catch(function (e) { hatalar.push("  ✗ TEST ÇÖKTÜ: " + e.stack); bitir(); });

function bitir() {
  try { sahte.close(); } catch (e) {}
  try { if (surec && surec.exitCode === null) surec.kill(); } catch (e) {}
  const basarili = notlar.filter(function (n) { return n.indexOf("✓") >= 0; }).length;
  let m = ["=========== SES TESTİ ==========="].concat(notlar);
  if (hatalar.length) m = m.concat(["", "--- HATALAR ---"], hatalar, ["", "SONUC: " + hatalar.length + " HATA / " + basarili + " BASARILI"]);
  else m.push("", "SONUC: HEPSI BASARILI (" + basarili + " kontrol)");
  const metin = m.join("\n") + "\n";
  try { fs.writeFileSync("/home/claude/macarzeka/ses-sonuc.txt", metin); } catch (e) {}
  process.stdout.write(metin);
  setTimeout(function () { app.exit(hatalar.length ? 1 : 0); }, 250);
}
