"use strict";
/* UÇTAN UCA TEST
   Gerçek MacarZeka programını başlatır, arayüzü ona bağlar,
   bütün akışı dener ve diskteki dosyaları doğrular. */

const { app, BrowserWindow } = require("electron");
const { spawn } = require("child_process");
const path = require("path");
const KOK_DIZIN = path.join(__dirname, "..");
function kok(a){ return path.join(KOK_DIZIN, a); }
function yeniSurumYolu(a){ return path.join(KOK_DIZIN, "test-ikililer", a); }
const fs = require("fs");

const PROGRAM = kok("macarzeka-linux");
/* PROGRAM_YOK_KONTROL */ if (!fs.existsSync(PROGRAM)) { console.error("Once programi derle: go build -o macarzeka-linux ."); process.exit(3); }
const KOK = kok("test-calisma");
fs.rmSync(KOK, { recursive: true, force: true });
fs.mkdirSync(KOK, { recursive: true });
fs.copyFileSync(PROGRAM, path.join(KOK, "MacarZeka"));
fs.chmodSync(path.join(KOK, "MacarZeka"), 0o755);

const veriDosya = path.join(KOK, "veriler.json");
const yedekDizin = path.join(KOK, "yedekler");
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

let surec = null;
function programBaslat() {
  surec = spawn(path.join(KOK, "MacarZeka"), [], {
    cwd: KOK,
    env: Object.assign({}, process.env, { PATH: "/nonexistent" }),
    stdio: ["ignore", "pipe", "pipe"]
  });
  surec.stdout.on("data", function (d) { const s = String(d).trim(); if (s) notlar.push("  · program: " + s); });
  surec.stderr.on("data", function (d) { const s = String(d).trim(); if (s) hatalar.push("  ✗ program hata çıktısı: " + s); });
}
async function portBekle(saniye) {
  for (let i = 0; i < saniye * 10; i++) {
    if (fs.existsSync(portDosya)) {
      const t = fs.readFileSync(portDosya, "utf8").trim().split(" ");
      if (t.length === 2) return { port: t[0], jeton: t[1] };
    }
    await bekle(100);
  }
  return null;
}

app.on("window-all-closed", function () {});

app.whenReady().then(async function () {
  programBaslat();
  const p = await portBekle(15);
  ok("Program başladı ve bağlantı noktası açtı", !!p);
  if (!p) { bitir(); return; }
  ok("oturum.port dosyası oluştu", fs.existsSync(portDosya));

  const adres = "http://127.0.0.1:" + p.port + "/?t=" + p.jeton;

  /* yetki kontrolü: jetonsuz erişim reddedilmeli */
  const yetkisiz = await fetch("http://127.0.0.1:" + p.port + "/api/oku").then(function (r) { return r.status; }).catch(function () { return 0; });
  ok("Jetonsuz istek reddediliyor", yetkisiz === 403, String(yetkisiz));

  const win = new BrowserWindow({ width: 1360, height: 880, show: false,
    webPreferences: { contextIsolation: true, nodeIntegration: false } });
  win.webContents.on("console-message", function (_e, seviye, mesaj, satir, kaynak) {
    if (seviye >= 2) hatalar.push("  ✗ KONSOL HATASI: " + mesaj + " (" + kaynak + ":" + satir + ")");
  });
  win.webContents.on("render-process-gone", function (_e, d) { hatalar.push("  ✗ SAYFA ÇÖKTÜ: " + JSON.stringify(d)); });

  await win.loadURL(adres);
  await bekle(900);
  const js = function (kod) { return win.webContents.executeJavaScript(kod, true); };

  ok("Sunucu köprüsü kuruldu", await js("MASAUSTU === true"));
  ok("Veri dosyası yolu arayüze geldi", (await js("bilgi.dosya")).indexOf("veriler.json") >= 0, await js("bilgi.dosya"));
  ok("Boş ekran göründü", (await js("document.getElementById('ekran').innerHTML")).indexOf("Henüz hiç kayıt yok") >= 0);

  /* örnek veri */
  await js("window.confirm=function(){return true}; window.alert=function(){}; 0;");
  await js("ornekYukle()");
  await bekle(900);
  ok("4 örnek müşteri eklendi", await js("veri.musteriler.length === 4"));
  ok("veriler.json diske yazıldı", fs.existsSync(veriDosya));
  let disk = JSON.parse(fs.readFileSync(veriDosya, "utf8"));
  ok("Diske 4 müşteri yazıldı", disk.musteriler.length === 4, String(disk.musteriler.length));
  ok("Diske 5 satış yazıldı", disk.satislar.length === 5);
  ok("Diske 3 ödeme yazıldı", disk.odemeler.length === 3);
  ok("Sol altta 'Kaydedildi' yazıyor", (await js("document.getElementById('durum').innerHTML")).indexOf("Kaydedildi") >= 0);

  /* hesaplar */
  const ahmetId = await js("veri.musteriler.filter(function(m){return m.ad.indexOf('Ahmet')>=0})[0].id");
  ok("Ahmet alış 12.000", await js("toplamAlis('" + ahmetId + "')===12000"));
  ok("Ahmet ödeme 5.000", await js("toplamOdeme('" + ahmetId + "')===5000"));
  ok("Ahmet borç 7.000", await js("borc('" + ahmetId + "')===7000"));
  ok("Bağlantı: hesap Mehmet'te", (await js("bagliOlanlar('" + ahmetId + "')[0].m.ad")) === "Mehmet Yılmaz");

  /* ekranlar */
  for (const e of ["panel", "musteriler", "soru", "yeni"]) {
    await js("git('" + e + "')"); await bekle(130);
    ok("Ekran çizildi: " + e, (await js("document.getElementById('ekran').innerHTML.length")) > 400);
  }
  await js("git('musteri','" + ahmetId + "')"); await bekle(150);
  const kart = await js("document.getElementById('ekran').innerHTML");
  ok("Müşteri kartı doğru", kart.indexOf("Ahmet Yılmaz") >= 0 && kart.indexOf("7.000") >= 0);
  ok("Kartta undefined/NaN yok", kart.indexOf("undefined") < 0 && kart.indexOf("NaN") < 0);

  /* form: Türkçe karakterli yeni kayıt */
  await js("gorunum.mod='yeni'; git('yeni')"); await bekle(150);
  await js([
    "document.getElementById('f_ad').value='Şükrü Çağlayanoğlu';",
    "document.getElementById('f_koy').value='İğneada';",
    "document.getElementById('f_urun').value='Çinko çözeltisi';",
    "document.getElementById('f_tutar').value='2500';",
    "document.getElementById('f_odenen').value='1000';",
    "document.getElementById('f_not').value='Ölçüm yapılacak, ağustosta tekrar bakılacak';",
    "formKaydet();"
  ].join(""));
  await bekle(900);
  ok("Yeni müşteri eklendi", await js("veri.musteriler.length===5"));
  const sId = await js("veri.musteriler.filter(function(m){return m.ad.indexOf('Şükrü')===0})[0].id");
  ok("Kalan borç 1.500", await js("borc('" + sId + "')===1500"));
  disk = JSON.parse(fs.readFileSync(veriDosya, "utf8"));
  ok("Diskte 5 müşteri var", disk.musteriler.length === 5);
  const diskAd = JSON.parse(JSON.stringify(disk.musteriler.filter(function (m) { return String(m.ad).indexOf("Şükrü") === 0; })[0] || {}));
  ok("Türkçe karakterler diske doğru yazıldı", diskAd.ad === "Şükrü Çağlayanoğlu", diskAd.ad);
  ok("Not diske yazıldı", (diskAd.notlar || []).length === 1 && diskAd.notlar[0].metin.indexOf("Ölçüm") === 0);

  /* soru-cevap */
  const sor = async function (q) { return JSON.parse(await js("JSON.stringify(cevapla(" + JSON.stringify(q) + "))")); };
  ok("S: borcunu ödedi mi", (await sor("Ahmet Yılmaz borcunu ödedi mi?")).metin.indexOf("7.000") >= 0);
  ok("S: kimler ödemedi", (await sor("kimler ödeme yapmadı")).metin.indexOf("borcu var") >= 0);
  ok("S: ne aldı", (await sor("Ahmet Yılmaz ne aldı")).metin.indexOf("gübre") >= 0);
  ok("S: bağlantı", (await sor("Ahmet Yılmaz kiminle bağlantılı")).metin.indexOf("Mehmet") >= 0);
  ok("S: bu ay ne kadar sattım", (await sor("bu ay ne kadar sattım")).metin.indexOf("satış yapıldı") >= 0);
  ok("S: Türkçe isim (şükrü)", ((await sor("şükrü çağlayanoğlu borcu")) || {}).metin.indexOf("1.500") >= 0);
  ok("S: anlamsız soru çökmüyor", (await sor("qwe zxc 123")).metin.length > 10);

  /* çok kayıt dayanıklılığı */
  await js("for(var i=0;i<400;i++){ veri.musteriler.push({id:'t'+i,ad:'Deneme '+i,koy:'Köy',notlar:[]}); } kaydet(); 0;");
  await bekle(1200);
  disk = JSON.parse(fs.readFileSync(veriDosya, "utf8"));
  ok("405 müşteri diske yazıldı", disk.musteriler.length === 405, String(disk.musteriler.length));
  await js("git('musteriler')"); await bekle(400);
  ok("Büyük liste çiziliyor", (await js("document.querySelectorAll('tbody tr').length")) === 405);
  await js("gorunum.arama='Şükrü'; git('musteriler')"); await bekle(300);
  ok("Türkçe arama listede çalışıyor", (await js("document.querySelectorAll('tbody tr').length")) === 1);
  await js("gorunum.arama=''; gorunum.filtre='borclu'; git('musteriler')"); await bekle(300);
  ok("Borçlu filtresi çalışıyor", (await js("document.querySelectorAll('tbody tr').length")) === 4);

  /* geri alma: 400 denemeyi sil */
  await js("veri.musteriler=veri.musteriler.filter(function(m){return String(m.id).indexOf('t')!==0}); gorunum.filtre='hepsi'; kaydet(); git('panel'); 0;");
  await bekle(900);
  disk = JSON.parse(fs.readFileSync(veriDosya, "utf8"));
  ok("Silme diske yansıdı", disk.musteriler.length === 5);

  /* yedek dosyası */
  ok("yedekler klasörü var", fs.existsSync(yedekDizin));

  /* ekran görüntüsü */
  await bekle(300);
  fs.writeFileSync(kok("son-panel.png"), (await win.webContents.capturePage()).toPNG());

  /* ikinci kopya açılmamalı */
  const ikinci = spawn(path.join(KOK, "MacarZeka"), [], {
    cwd: KOK,
    env: Object.assign({}, process.env, { PATH: "/nonexistent" }),
    stdio: "ignore"
  });
  await bekle(2500);
  ok("İkinci kopya kendini kapattı", ikinci.exitCode !== null || ikinci.killed, "exitCode=" + ikinci.exitCode);
  try { ikinci.kill(); } catch (e) {}
  ok("Veri dosyası hâlâ sağlam", JSON.parse(fs.readFileSync(veriDosya, "utf8")).musteriler.length === 5);

  /* pencere kapanınca program kapanmalı (nabız kesilmesi) */
  win.destroy();
  notlar.push("  · pencere kapatıldı, programın kendi kapanması bekleniyor (en çok 30 sn)…");
  let kapandi = false;
  for (let i = 0; i < 60; i++) {
    if (surec.exitCode !== null) { kapandi = true; break; }
    await bekle(500);
  }
  ok("Pencere kapanınca program da kapandı", kapandi, "exitCode=" + surec.exitCode);
  ok("Kapanışta oturum.port temizlendi", !fs.existsSync(portDosya));
  ok("Kapanıştan sonra veri sağlam", JSON.parse(fs.readFileSync(veriDosya, "utf8")).musteriler.length === 5);

  bitir();
}).catch(function (e) {
  hatalar.push("  ✗ TEST ÇÖKTÜ: " + e.stack);
  bitir();
});

function bitir() {
  try { if (surec && surec.exitCode === null) surec.kill(); } catch (e) {}
  const satirlar = ["=========== UÇTAN UCA TEST ==========="].concat(notlar);
  const basarili = notlar.filter(function (n) { return n.indexOf("✓") >= 0; }).length;
  if (hatalar.length) {
    satirlar.push("", "--- HATALAR ---");
    hatalar.forEach(function (h) { satirlar.push(h); });
    satirlar.push("", "SONUC: " + hatalar.length + " HATA / " + basarili + " BASARILI");
  } else {
    satirlar.push("", "SONUC: HEPSI BASARILI (" + basarili + " kontrol)");
  }
  const metin = satirlar.join("\n") + "\n";
  try { fs.writeFileSync(kok("e2e-sonuc.txt"), metin); } catch (e) {}
  process.stdout.write(metin);
  setTimeout(function () { app.exit(hatalar.length ? 1 : 0); }, 250);
}
