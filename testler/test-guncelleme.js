"use strict";
/* GÜNCELLEME TESTİ
   Sahte bir GitHub kurar, gerçek programı çalıştırır,
   gerçekten yeni sürümü indirip kendini değiştirmesini sınar.
   En önemlisi: kayıtların hiç bozulmadığını doğrular. */

const { app, BrowserWindow } = require("electron");
const { spawn } = require("child_process");
const http = require("http");
const path = require("path");
const KOK_DIZIN = path.join(__dirname, "..");
function kok(a){ return path.join(KOK_DIZIN, a); }
function yeniSurumYolu(a){ return path.join(KOK_DIZIN, "test-ikililer", a); }
const fs = require("fs");

const KAYNAK = KOK_DIZIN;
const KOK = kok("test-guncelleme");
fs.rmSync(KOK, { recursive: true, force: true });
fs.mkdirSync(KOK, { recursive: true });

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

/* --- ikili dosyalar test dışında hazırlandı --- */
const eskiYol = path.join(KOK, "MacarZeka");
const yeniProgram = yeniSurumYolu("MacarZeka-9.9");
fs.copyFileSync(yeniSurumYolu("MacarZeka-1.3"), eskiYol);
fs.chmodSync(eskiYol, 0o755);
const yeniVeri = fs.readFileSync(yeniProgram);

const veriDosya = path.join(KOK, "veriler.json");
const ayarDosya = path.join(KOK, "ayarlar.json");
const portDosya = path.join(KOK, "oturum.port");
const yedekDizin = path.join(KOK, "yedekler");

/* --- sahte GitHub --- */
let mod = "yeni";
let bozukBoyut = false;
const sahte = http.createServer(function (req, res) {
  if (req.url.indexOf("/releases/latest") >= 0) {
    if (mod === "yok") { res.writeHead(404); res.end('{"message":"Not Found"}'); return; }
    if (mod === "limit") { res.writeHead(403); res.end('{"message":"rate limit"}'); return; }
    const etiket = (mod === "ayni") ? "v1.3" : "v9.9";
    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(JSON.stringify({
      tag_name: etiket, name: "MacarZeka " + etiket, draft: false, prerelease: false,
      body: "- Sesli kayıt hızlandı\n- Borç ekranı düzeltildi",
      html_url: "https://github.com/x/y/releases/tag/" + etiket,
      assets: [{ name: "MacarZeka.exe", size: bozukBoyut ? yeniVeri.length + 500 : yeniVeri.length,
                 browser_download_url: "http://127.0.0.1:" + sahte.address().port + "/indir" }]
    }));
    return;
  }
  if (req.url === "/indir") {
    if (mod === "cope") { res.writeHead(200); res.end(Buffer.alloc(yeniVeri.length, 0x41)); return; }
    res.writeHead(200, { "Content-Type": "application/octet-stream" });
    res.end(yeniVeri);
    return;
  }
  res.writeHead(404); res.end();
});

let surec = null;
app.on("window-all-closed", function () {});

function baslat() {
  return spawn(eskiYol, [], {
    cwd: KOK,
    env: Object.assign({}, process.env, {
      MACARZEKA_GUNCELLEME_UC: "http://127.0.0.1:" + sahte.address().port,
      PATH: "/nonexistent"
    }),
    stdio: "ignore"
  });
}
async function portBekle() {
  for (let i = 0; i < 150; i++) {
    if (fs.existsSync(portDosya)) {
      const t = fs.readFileSync(portDosya, "utf8").trim().split(" ");
      if (t.length === 2) return { port: t[0], jeton: t[1] };
    }
    await bekle(100);
  }
  return null;
}

app.whenReady().then(async function () {
  await new Promise(function (r) { sahte.listen(0, "127.0.0.1", r); });

  surec = baslat();
  let p = await portBekle();
  ok("Program başladı", !!p);
  if (!p) return bitir();

  let win = new BrowserWindow({ width: 1300, height: 880, show: false,
    webPreferences: { contextIsolation: true, nodeIntegration: false } });
  win.webContents.on("console-message", function (_e, s, m, l, k) {
    if (s >= 2) hatalar.push("  ✗ KONSOL: " + m + " (" + k + ":" + l + ")");
  });
  await win.loadURL("http://127.0.0.1:" + p.port + "/?t=" + p.jeton);
  await bekle(800);
  let js = function (k) { return win.webContents.executeJavaScript(k, true); };

  await js("window.confirm=function(){return true}; window.alert=function(){}; 0;");
  await js("ornekYukle()"); await bekle(900);
  ok("Örnek kayıtlar yüklendi", await js("veri.musteriler.length === 4"));

  // kayıtlara ayırt edici bir şey ekle: güncellemeden sonra duruyor mu bakacağız
  await js("veri.musteriler[0].ad='GÜNCELLEME ÖNCESİ Şükrü'; kaydet(); 0;");
  await bekle(800);
  const oncekiVeri = fs.readFileSync(veriDosya, "utf8");
  ok("İşaretli kayıt diske yazıldı", oncekiVeri.indexOf("GÜNCELLEME ÖNCESİ") >= 0);
  fs.writeFileSync(ayarDosya, JSON.stringify({ gemini_anahtar: "AIzaKORUNMALI_123", gemini_model: "x", gemini_ses_model: "y", gemini_acik: true }, null, 2));

  /* --- 1. güncelleme var mı --- */
  mod = "yeni";
  await js("guncellemeyeBak(true); 0;"); await bekle(1500);
  ok("Yeni sürüm görüldü", await js("gorunum.guncelleme && gorunum.guncelleme.var === true"));
  ok("Sürüm numarası doğru", (await js("gorunum.guncelleme.surum")) === "9.9", await js("gorunum.guncelleme.surum"));
  ok("Bu sürüm 1.3 olarak bildirildi", (await js("gorunum.guncelleme.buSurum")) === "1.3");
  ok("İndirilebilir işaretlendi", await js("gorunum.guncelleme.indirebilir === true"));
  ok("Sürüm notları geldi", (await js("gorunum.guncelleme.notlar")).indexOf("Sesli kayıt") >= 0);

  await js("git('panel'); 0;"); await bekle(400);
  const panel = await js("document.getElementById('ekran').innerHTML");
  ok("Panelde güncelleme şeridi çıktı", panel.indexOf("Yeni sürüm çıktı: 9.9") >= 0);
  ok("Şeritte 'Şimdi güncelle' butonu var", panel.indexOf("guncKur") >= 0);
  ok("Şeritte sürüm notları görünüyor", panel.indexOf("Borç ekranı düzeltildi") >= 0);

  /* --- 2. aynı sürümse şerit çıkmasın --- */
  mod = "ayni";
  await js("guncellemeyeBak(true); git('panel'); 0;"); await bekle(1500);
  ok("Aynı sürümde güncelleme yok denildi", await js("gorunum.guncelleme.var === false"));
  ok("Aynı sürümde şerit çıkmadı", (await js("document.getElementById('ekran').innerHTML")).indexOf("Yeni sürüm çıktı") < 0);

  /* --- 3. bozuk dosya kurulmamalı --- */
  mod = "cope";
  await js("guncellemeyeBak(true); 0;"); await bekle(1200);
  let r = await js("window.macar.guncellemeKur()");
  ok("Program olmayan dosya reddedildi", r && r.ok === false && /program dosyası değil/.test(r.hata), JSON.stringify(r));
  ok("Reddedilince program dosyası bozulmadı", fs.statSync(eskiYol).size > 1000000);

  /* --- 4. eksik indirme reddedilmeli --- */
  mod = "yeni"; bozukBoyut = true;
  await js("guncellemeyeBak(true); 0;"); await bekle(1200);
  r = await js("window.macar.guncellemeKur()");
  ok("Eksik gelen dosya reddedildi", r && r.ok === false && /eksik/.test(r.hata), JSON.stringify(r));
  bozukBoyut = false;

  /* --- 5. GitHub yoksa / sınır dolduysa çökmesin --- */
  mod = "yok";
  await js("guncellemeyeBak(true); 0;"); await bekle(1200);
  ok("Sürüm yoksa anlaşılır hata", (await js("gorunum.guncellemeBakHata")).indexOf("bulunamadı") >= 0, await js("gorunum.guncellemeBakHata"));
  mod = "limit";
  await js("guncellemeyeBak(true); 0;"); await bekle(1200);
  ok("Saatlik sınırda anlaşılır hata", (await js("gorunum.guncellemeBakHata")).indexOf("sınır") >= 0, await js("gorunum.guncellemeBakHata"));
  ok("Bu hatalardan sonra veri sağlam", fs.readFileSync(veriDosya, "utf8") === oncekiVeri);

  /* --- 6. GERÇEK GÜNCELLEME --- */
  mod = "yeni";
  const eskiBoyut = fs.statSync(eskiYol).size;
  await js("guncellemeyeBak(true); 0;"); await bekle(1200);
  r = await js("window.macar.guncellemeKur()");
  ok("Güncelleme başarılı döndü", r && r.ok === true, JSON.stringify(r));
  ok("Yeni sürüm numarası bildirildi", r && r.surum === "9.9");

  ok("Program dosyası değişti", fs.statSync(eskiYol).size !== eskiBoyut || Buffer.compare(fs.readFileSync(eskiYol), yeniVeri) === 0);
  ok("Yeni program dosyası birebir doğru", Buffer.compare(fs.readFileSync(eskiYol), yeniVeri) === 0);

  /* EN ÖNEMLİSİ: veri dosyaları */
  ok("veriler.json HİÇ DEĞİŞMEDİ", fs.readFileSync(veriDosya, "utf8") === oncekiVeri);
  ok("İşaretli kayıt duruyor", fs.readFileSync(veriDosya, "utf8").indexOf("GÜNCELLEME ÖNCESİ") >= 0);
  ok("ayarlar.json korundu", fs.readFileSync(ayarDosya, "utf8").indexOf("AIzaKORUNMALI_123") >= 0);
  const yedekler = fs.readdirSync(yedekDizin);
  ok("Güncelleme öncesi yedek alındı", yedekler.some(function (f) { return f.indexOf("guncelleme-oncesi") >= 0; }), yedekler.join(","));

  /* program kendini yeniden başlatıyor mu */
  win.destroy();
  let kapandi = false;
  for (let i = 0; i < 40; i++) { if (surec.exitCode !== null) { kapandi = true; break; } await bekle(500); }
  ok("Eski kopya kapandı", kapandi, "exitCode=" + surec.exitCode);
  await bekle(1500);

  /* --- 7. yeni sürüm açılıyor ve veriyi okuyor mu --- */
  try { fs.unlinkSync(portDosya); } catch (e) {}
  surec = baslat();
  p = await portBekle();
  ok("Güncellenmiş program açıldı", !!p);
  if (p) {
    win = new BrowserWindow({ width: 1300, height: 880, show: false,
      webPreferences: { contextIsolation: true, nodeIntegration: false } });
    win.webContents.on("console-message", function (_e, s, m) { if (s >= 2) hatalar.push("  ✗ KONSOL (yeni): " + m); });
    await win.loadURL("http://127.0.0.1:" + p.port + "/?t=" + p.jeton);
    await bekle(900);
    js = function (k) { return win.webContents.executeJavaScript(k, true); };
    ok("Yeni sürüm 9.9 olarak açıldı", (await js("SURUM")) === "9.9", await js("SURUM"));
    ok("Kayıtlar yeni sürümde duruyor", (await js("veri.musteriler.length")) === 4);
    ok("İşaretli kayıt yeni sürümde görünüyor", (await js("veri.musteriler.filter(function(m){return m.ad.indexOf('GÜNCELLEME ÖNCESİ')===0}).length")) === 1);
    ok("Borç hesabı hâlâ doğru", (await js("veri.musteriler.some(function(m){return borc(m.id)>0})")) === true);
    ok("Eski program dosyası temizlendi", !fs.existsSync(eskiYol + ".eski"));
    ok("Yarım kalan dosya yok", !fs.existsSync(eskiYol + ".yeni"));
    fs.writeFileSync(kok("guncelleme-ekran.png"), (await win.webContents.capturePage()).toPNG());
    win.destroy();
  }

  bitir();
}).catch(function (e) { hatalar.push("  ✗ TEST ÇÖKTÜ: " + e.stack); bitir(); });

function bitir() {
  try { sahte.close(); } catch (e) {}
  try { if (surec && surec.exitCode === null) surec.kill(); } catch (e) {}
  const basarili = notlar.length;
  let m = ["=========== GÜNCELLEME TESTİ ==========="].concat(notlar);
  if (hatalar.length) m = m.concat(["", "--- HATALAR ---"], hatalar, ["", "SONUC: " + hatalar.length + " HATA / " + basarili + " BASARILI"]);
  else m.push("", "SONUC: HEPSI BASARILI (" + basarili + " kontrol)");
  const metin = m.join("\n") + "\n";
  try { fs.writeFileSync(kok("guncelleme-sonuc.txt"), metin); } catch (e) {}
  process.stdout.write(metin);
  setTimeout(function () { app.exit(hatalar.length ? 1 : 0); }, 250);
}
