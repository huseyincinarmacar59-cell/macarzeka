"use strict";
/* WEB SÜRÜMÜ TESTİ
   index.html'i GitHub Pages gibi, arka uç OLMADAN ve 127.0.0.1 dışı
   bir adresten sunar. Programın tarayıcı kipinde düzgün çalıştığını,
   kayıtların tarayıcı hafızasında tutulduğunu ve hiçbir /api/ isteği
   yapılmadığını doğrular. */

const { app, BrowserWindow } = require("electron");
const http = require("http");
const fs = require("fs");
const path = require("path");

const SAYFA = path.join(__dirname, "..", "index.html");

const hatalar = [], notlar = [];
let sonAdim = "(baslangic)";
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

/* Pages gibi: sadece dosya sunar, /api/ diye bir şey yoktur. */
let apiIstekleri = [];
let guncellendi = false;   // sayfanin yeni surumu yayimlandi mi
const sunucu = http.createServer(function (req, res) {
  // Vekil olarak kullanıldığında istek tam adresle gelir: yolu ayıkla.
  let yol = req.url;
  if (/^https?:\/\//i.test(yol)) {
    try { yol = new URL(yol).pathname; } catch (e) {}
  }
  if (yol.indexOf("/api/") === 0) {
    apiIstekleri.push(yol);
    res.writeHead(404, { "Content-Type": "text/plain" });
    res.end("Not Found");
    return;
  }
  if (yol === "/" || yol.indexOf("/index.html") === 0) {
    let govde = fs.readFileSync(SAYFA, "utf8");
    if (guncellendi) govde = govde.replace('var SURUM = "1.0"', 'var SURUM = "9.9"');
    res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
    res.end(govde);
    return;
  }
  res.writeHead(404); res.end();
});

app.on("window-all-closed", function () {});

app.whenReady().then(async function () {
  await new Promise(function (r) { sunucu.listen(0, "127.0.0.1", r); });
  const port = sunucu.address().port;

  // 127.0.0.1 degil, baska bir ad uzerinden girelim ki gercek web gibi olsun
  // Her calistirmada temiz tarayici hafizasi (onceki testten kayit kalmasin)
  const bolum = "test-web-" + Date.now();
  const win = new BrowserWindow({ width: 1340, height: 900, show: false,
    webPreferences: { contextIsolation: true, nodeIntegration: false, partition: bolum } });
  win.webContents.on("console-message", function (_e, s, m, l, k) {
    if (s >= 2 && m.indexOf("Electron Security Warning") < 0) hatalar.push("  ✗ KONSOL: " + m + " (" + k + ":" + l + ")");
  });
  win.webContents.on("render-process-gone", function (_e, d) { hatalar.push("  ✗ SAYFA ÇÖKTÜ: " + JSON.stringify(d)); });

  // "macarzeka.test" adini 127.0.0.1'e yonlendir: tarayici bunu yerel saymaz
  await win.webContents.session.setProxy({ proxyRules: "http=127.0.0.1:" + port });
  await win.loadURL("http://macarzeka.test/");
  await bekle(1200);
  const js = function (k) { return win.webContents.executeJavaScript(k, true); };

  /* 1 — tarayıcı kipinde mi? */
  ok("Sayfa açıldı", (await js("document.title")).indexOf("MacarZeka") >= 0, await js("document.title"));
  ok("Köprü devreye GİRMEDİ (web kipi)", (await js("typeof window.macar")) === "undefined", await js("typeof window.macar"));
  ok("MASAUSTU false", (await js("MASAUSTU")) === false);
  ok("Hiç /api/ isteği yapılmadı", apiIstekleri.length === 0, apiIstekleri.join(","));
  ok("Açılışta hata kutusu çıkmadı", (await js("document.getElementById('ekran').innerHTML")).indexOf("Veri okunamadı") < 0);

  /* 2 — boş ekran ve indirme çağrısı */
  const bos = await js("document.getElementById('ekran').innerHTML");
  ok("Boş ekran göründü", bos.indexOf("Henüz hiç kayıt yok") >= 0);
  ok("Tarayıcı sürümü uyarısı var", bos.indexOf("Bu tarayıcı sürümüdür") >= 0);
  ok("Windows indirme bağlantısı var", bos.indexOf("releases/latest") >= 0);
  ok("Sol altta tarayıcı kipi yazıyor", (await js("document.getElementById('durum').innerHTML")).indexOf("Tarayıcı modu") >= 0);
  ok("Anlamsız 'veri klasörü' düğmesi gizlendi", (await js("document.getElementById('klasorAc').style.display")) === "none",
     await js("document.getElementById('klasorAc').style.display || '(gorunur)'"));

  /* 3 — kayıt girip kaydedebiliyor mu */
  await js("window.confirm=function(){return true}; window.alert=function(){}; 0;");
  await js("ornekYukle()"); await bekle(700);
  ok("Örnek kayıtlar eklendi", (await js("veri.musteriler.length")) === 4);
  ok("Tarayıcı hafızasına yazıldı", (await js("!!localStorage.getItem('macarzeka_veri_v1')")) === true);
  ok("Hafızadaki veri doğru", JSON.parse(await js("localStorage.getItem('macarzeka_veri_v1')")).musteriler.length === 4);

  /* 4 — hesaplar çalışıyor mu */
  const ahmet = await js("veri.musteriler.filter(function(m){return m.ad.indexOf('Ahmet')===0})[0].id");
  ok("Borç hesabı doğru", (await js("borc('" + ahmet + "')")) === 7000, String(await js("borc('" + ahmet + "')")));
  ok("Hesap bağlantısı çalışıyor", (await js("(bagliOlanlar('" + ahmet + "')[0]||{}).m ? bagliOlanlar('" + ahmet + "')[0].m.ad : ''")) === "Mehmet Yılmaz");

  /* 5 — bütün ekranlar çiziliyor mu */
  for (const e of ["panel", "musteriler", "soru", "yeni", "ayarlar"]) {
    await js("git('" + e + "')"); await bekle(150);
    ok("Ekran çizildi: " + e, (await js("document.getElementById('ekran').innerHTML.length")) > 400);
  }
  await js("git('musteri','" + ahmet + "')"); await bekle(200);
  const kart = await js("document.getElementById('ekran').innerHTML");
  ok("Müşteri kartı doğru", kart.indexOf("Ahmet Yılmaz") >= 0 && kart.indexOf("7.000") >= 0);
  ok("Kartta undefined/NaN yok", kart.indexOf("undefined") < 0 && kart.indexOf("NaN") < 0);

  /* 6 — yerel soru-cevap (Gemini olmadan) */
  await js("git('soru'); 0;"); await bekle(200);
  const c = JSON.parse(await js("JSON.stringify(cevapla('Ahmet Yılmaz borcunu ödedi mi?'))"));
  ok("Yerel arama cevap verdi", c.metin.indexOf("7.000") >= 0, c.metin.slice(0, 60));
  ok("Soru ekranında 'Yerel arama' yazıyor", (await js("document.getElementById('ekran').innerHTML")).indexOf("Yerel arama") >= 0);

  /* 7 — web'de kapalı olması gerekenler */
  await js("git('yeni'); gorunum.mod='yeni'; ciz(); 0;"); await bekle(250);
  ok("Sesli kayıt butonu kapalı", await js("!!document.querySelector('[data-kayit=\"form\"]').disabled"));
  const sesSebep = await js("sesNedenKapali()");
  ok("Kapalı olma sebebi kullanıcıya yazılıyor",
     sesSebep.length > 0 && (await js("document.getElementById('ekran').innerHTML")).indexOf(sesSebep) >= 0, sesSebep);
  ok("Güncelleme şeridi yok", (await js("guncellemeSeridiHTML()")) === "");

  /* 8 — yeni kayıt ekleyip saklanıyor mu */
  await js([
    "document.getElementById('f_ad').value='Web Denemesi';",
    "document.getElementById('f_urun').value='Gübre';",
    "document.getElementById('f_tutar').value='1000';",
    "document.getElementById('f_odenen').value='400';",
    "formKaydet();"
  ].join("")); await bekle(600);
  ok("Yeni müşteri eklendi", (await js("veri.musteriler.length")) === 5);
  const yeniId = await js("veri.musteriler.filter(function(m){return m.ad==='Web Denemesi'})[0].id");
  ok("Borcu doğru hesaplandı", (await js("borc('" + yeniId + "')")) === 600);
  ok("Hafızaya yazıldı", JSON.parse(await js("localStorage.getItem('macarzeka_veri_v1')")).musteriler.length === 5);

  /* 9 — sayfa yenilenince kayıtlar geri geliyor mu */
  // Programi kapatip tekrar acmis gibi: ayni tarayici hafizasiyla yeni pencere
  const win2 = new BrowserWindow({ width: 1340, height: 900, show: false,
    webPreferences: { contextIsolation: true, nodeIntegration: false, partition: bolum } });
  await win2.webContents.session.setProxy({ proxyRules: "http=127.0.0.1:" + port });
  await win2.loadURL("http://macarzeka.test/");
  await bekle(1400);
  const js2 = function (k) { return win2.webContents.executeJavaScript(k, true); };
  ok("Kapatıp açınca kayıtlar duruyor", (await js2("veri.musteriler.length")) === 5, String(await js2("veri.musteriler.length")));
  ok("Yeni müşteri hâlâ orada", (await js2("veri.musteriler.filter(function(m){return m.ad==='Web Denemesi'}).length")) === 1);
  ok("Borç hesabı yeniden açılışta doğru", (await js2("veri.musteriler.filter(function(m){return m.ad==='Web Denemesi'}).map(function(m){return borc(m.id)})[0]")) === 600);
  win2.destroy();

  /* 10 — SAYFANIN YENİ SÜRÜMÜ YAYIMLANINCA VERİ KAYBOLMAMALI */
  guncellendi = true;   // depoya yeni surum push edildi, Pages yeniledi
  const win3 = new BrowserWindow({ width: 1340, height: 900, show: false,
    webPreferences: { contextIsolation: true, nodeIntegration: false, partition: bolum } });
  await win3.webContents.session.setProxy({ proxyRules: "http=127.0.0.1:" + port });
  await win3.loadURL("http://macarzeka.test/");
  await bekle(1400);
  const js3 = function (k) { return win3.webContents.executeJavaScript(k, true); };
  ok("Yeni sürüm yüklendi", (await js3("SURUM")) === "9.9", await js3("SURUM"));
  ok("GÜNCELLEMEDEN SONRA KAYITLAR DURUYOR", (await js3("veri.musteriler.length")) === 5,
     String(await js3("veri.musteriler.length")));
  ok("Güncellemeden sonra müşteri adı doğru",
     (await js3("veri.musteriler.filter(function(m){return m.ad==='Web Denemesi'}).length")) === 1);
  ok("Güncellemeden sonra borç doğru",
     (await js3("veri.musteriler.filter(function(m){return m.ad==='Web Denemesi'}).map(function(m){return borc(m.id)})[0]")) === 600);
  ok("Güncellemeden sonra örnek kayıtlar da duruyor",
     (await js3("veri.musteriler.filter(function(m){return m.ad==='Mehmet Yılmaz'}).length")) === 1);
  win3.destroy();

  /* 11 — baştan sona hiç /api/ çağrısı olmadı */
  ok("Hiçbir aşamada /api/ istenmedi", apiIstekleri.length === 0, apiIstekleri.join(","));

  fs.writeFileSync(path.join(__dirname, "..", "web-ekran.png"), (await win.webContents.capturePage()).toPNG());
  win.destroy();
  bitir();
}).catch(function (e) { hatalar.push("  ✗ TEST ÇÖKTÜ: " + e.stack); bitir(); });

function bitir() {
  try { sunucu.close(); } catch (e) {}
  const basarili = notlar.length;
  let m = ["=========== WEB SÜRÜMÜ TESTİ ==========="].concat(notlar);
  if (hatalar.length) m = m.concat(["", "--- HATALAR ---"], hatalar, ["", "SONUC: " + hatalar.length + " HATA / " + basarili + " BASARILI"]);
  else m.push("", "SONUC: HEPSI BASARILI (" + basarili + " kontrol)");
  const metin = m.join("\n") + "\n";
  try { fs.writeFileSync(path.join(__dirname, "..", "web-sonuc.txt"), metin); } catch (e) {}
  process.stdout.write(metin);
  setTimeout(function () { app.exit(hatalar.length ? 1 : 0); }, 250);
}
