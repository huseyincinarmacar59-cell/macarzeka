"use strict";
/* GEMİNİ TESTİ
   Sahte bir Google sunucusu kurar, programı ona bağlar ve
   ayarlar / soru / hata / yedek akışını baştan sona dener. */

const { app, BrowserWindow } = require("electron");
const { spawn } = require("child_process");
const http = require("http");
const path = require("path");
const KOK_DIZIN = path.join(__dirname, "..");
function kok(a){ return path.join(KOK_DIZIN, a); }
function yeniSurumYolu(a){ return path.join(KOK_DIZIN, "test-ikililer", a); }
const fs = require("fs");

const KOK = kok("test-gemini");
fs.rmSync(KOK, { recursive: true, force: true });
fs.mkdirSync(KOK, { recursive: true });
/* PROGRAM_YOK_KONTROL */ if (!fs.existsSync(kok("macarzeka-linux"))) { console.error("Once programi derle: go build -o macarzeka-linux ."); process.exit(3); }
fs.copyFileSync(kok("macarzeka-linux"), path.join(KOK, "MacarZeka"));
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

/* ---- sahte Google sunucusu ---- */
let mod = "ok";
let gecikme = 0;
let sonIstek = null;
const sahte = http.createServer(function (req, res) {
  let govde = "";
  req.on("data", function (d) { govde += d; });
  req.on("end", function () {
    sonIstek = { yol: req.url, govde: govde };
    if (gecikme) { const d = gecikme; gecikme = 0; return setTimeout(cevapla, d); }
    cevapla();
    function cevapla() {
    if (mod === "403") {
      res.writeHead(403, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ error: { code: 403, message: "API key not valid", status: "PERMISSION_DENIED" } }));
      return;
    }
    if (mod === "429") {
      res.writeHead(429, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ error: { code: 429, message: "Quota exceeded", status: "RESOURCE_EXHAUSTED" } }));
      return;
    }
    if (mod === "bos") {
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ candidates: [{ content: { parts: [] }, finishReason: "MAX_TOKENS" }] }));
      return;
    }
    let metin = "TAMAM";
    try {
      const j = JSON.parse(govde);
      const soru = j.contents[0].parts[0].text;
      if (soru.indexOf("borcunu") >= 0) metin = "**Ahmet Yılmaz** henüz borcunu ödemedi.\n* Kalan borç: 7.000 ₺\n* Hesap Mehmet Yılmaz'ın üstüne yazılı.";
    } catch (e) { metin = "AYRIŞTIRMA HATASI"; }
    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ candidates: [{ content: { parts: [{ text: metin }] }, finishReason: "STOP" }] }));
    }
  });
});

let surec = null;
app.on("window-all-closed", function () {});

app.whenReady().then(async function () {
  await new Promise(function (r) { sahte.listen(0, "127.0.0.1", r); });
  const sahtePort = sahte.address().port;
  notlar.push("  · sahte Google sunucusu: 127.0.0.1:" + sahtePort);

  surec = spawn(path.join(KOK, "MacarZeka"), [], {
    cwd: KOK,
    env: Object.assign({}, process.env, {
      MACARZEKA_GEMINI_UC: "http://127.0.0.1:" + sahtePort,
      PATH: "/nonexistent"
    }),
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

  const win = new BrowserWindow({ width: 1360, height: 900, show: false,
    webPreferences: { contextIsolation: true, nodeIntegration: false } });
  win.webContents.on("console-message", function (_e, s, m, l, k) { if (s >= 2) hatalar.push("  ✗ KONSOL: " + m + " (" + k + ":" + l + ")"); });
  win.webContents.on("render-process-gone", function (_e, d) { hatalar.push("  ✗ SAYFA ÇÖKTÜ: " + JSON.stringify(d)); });
  await win.loadURL("http://127.0.0.1:" + p.port + "/?t=" + p.jeton);
  await bekle(900);
  const js = function (k) { return win.webContents.executeJavaScript(k, true); };

  await js("window.confirm=function(){return true}; window.alert=function(){}; 0;");
  await js("ornekYukle()");
  await bekle(900);
  ok("Örnek kayıtlar yüklendi", await js("veri.musteriler.length === 4"));

  /* 1 — ayarların başlangıcı */
  await js("git('ayarlar')"); await bekle(300);
  ok("Ayarlar ekranı açıldı", (await js("document.getElementById('ekran').innerHTML")).indexOf("Gemini bağlantısı") >= 0);
  ok("Başlangıçta Gemini kapalı", await js("ayar.acik === false"));
  ok("Başlangıçta anahtar yok", await js("ayar.anahtarVar === false"));
  ok("Açma butonu anahtar olmadan kapalı", (await js("document.getElementById('ayarAcKapa').disabled")) === true);

  /* 2 — anahtar kaydetme */
  await js("document.getElementById('geminiAnahtar').value='AIzaTEST_1234_GIZLI_ANAHTAR_5678'; ayarKaydet(false); 0;");
  await bekle(700);
  ok("Anahtar kaydedildi", await js("ayar.anahtarVar === true"));
  ok("Ekranda sadece son 4 hane görünüyor", (await js("ayar.anahtarMaske")).indexOf("5678") >= 0 && (await js("ayar.anahtarMaske")).indexOf("GIZLI") < 0, await js("ayar.anahtarMaske"));
  ok("ayarlar.json oluştu", fs.existsSync(ayarDosya));
  const ayarHam = fs.readFileSync(ayarDosya, "utf8");
  ok("Anahtar ayarlar.json'a yazıldı", ayarHam.indexOf("AIzaTEST_1234_GIZLI_ANAHTAR_5678") >= 0);
  ok("Anahtar veriler.json'a SIZMADI", fs.readFileSync(veriDosya, "utf8").indexOf("AIzaTEST") < 0);
  const ayarYanit = await js("JSON.stringify(ayar)");
  ok("Anahtar arayüze SIZMADI", ayarYanit.indexOf("AIzaTEST") < 0, ayarYanit);

  /* 3 — bağlantı denemesi */
  mod = "ok";
  await js("geminiDene(); 0;");
  await bekle(1500);
  ok("Bağlantı denemesi başarılı", (await js("document.getElementById('ayarSonuc').innerHTML")).indexOf("Bağlantı başarılı") >= 0,
     (await js("document.getElementById('ayarSonuc').textContent")).slice(0, 90));
  ok("Denemede defter verisi GÖNDERİLMEDİ", sonIstek && sonIstek.govde.indexOf("Ahmet Yılmaz") < 0);
  ok("İstek doğru adrese gitti", sonIstek && sonIstek.yol.indexOf("gemini-3.5-flash-lite:generateContent") >= 0, sonIstek && sonIstek.yol.split("?")[0]);
  ok("Anahtar istekte var", sonIstek && sonIstek.yol.indexOf("AIzaTEST") >= 0);

  /* 4 — Gemini'yi aç */
  await js("ayarAcKapa(); 0;");
  await bekle(1000);
  ok("Gemini açıldı", await js("ayar.acik === true"));
  ok("ayarlar.json'da açık yazıyor", JSON.parse(fs.readFileSync(ayarDosya, "utf8")).gemini_acik === true);

  /* 5 — gerçek soru */
  await js("git('soru')"); await bekle(250);
  ok("Soru ekranında 'Gemini açık' rozeti var", (await js("document.getElementById('ekran').innerHTML")).indexOf("Gemini açık") >= 0);
  gecikme = 1500;
  await js("document.getElementById('soruKutu').value='Ahmet Yılmaz borcunu ödedi mi?'; sor(); 0;");
  await bekle(500);
  ok("Beklerken 'Kayıtlara bakılıyor' yazıyor", (await js("document.getElementById('ekran').innerHTML")).indexOf("Kayıtlara bakılıyor") >= 0);
  await bekle(2400);
  const cevapHtml = await js("document.getElementById('ekran').innerHTML");
  ok("Gemini cevabı ekrana geldi", cevapHtml.indexOf("henüz borcunu ödemedi") >= 0, cevapHtml.indexOf("Kayıtlara bakılıyor") >= 0 ? "hala bekliyor" : "cevap yok");
  ok("Kalın yazı biçimlendi", cevapHtml.indexOf("<b>Ahmet Yılmaz</b>") >= 0);
  ok("Madde işareti biçimlendi", cevapHtml.indexOf("• Kalan borç") >= 0);
  ok("'Gemini ile cevaplandı' notu var", cevapHtml.indexOf("Gemini ile cevaplandı") >= 0);
  ok("Kaynak kayıtları yine gösteriliyor", cevapHtml.indexOf("BU CEVAP ŞU KAYITLARDAN") >= 0);

  /* 6 — gönderilen defter doğru mu */
  const gonderilen = JSON.parse(sonIstek.govde).contents[0].parts[0].text;
  ok("Defter gönderildi: müşteri adı", gonderilen.indexOf("Ahmet Yılmaz") >= 0);
  ok("Defter gönderildi: borç bilgisi", gonderilen.indexOf("KALAN BORÇ: 7.000 ₺") >= 0, gonderilen.indexOf("KALAN BORÇ") >= 0 ? "format farkli" : "yok");
  ok("Defter gönderildi: hesap bağlantısı", gonderilen.indexOf("Mehmet Yılmaz adına yazılı") >= 0);
  ok("Defter gönderildi: notlar", gonderilen.indexOf("sararma") >= 0);
  ok("Soru da gönderildi", gonderilen.indexOf("Ahmet Yılmaz borcunu ödedi mi?") >= 0);
  ok("Sistem yönergesi gönderildi", JSON.parse(sonIstek.govde).system_instruction.parts[0].text.indexOf("ziraat mühendisinin") >= 0);

  /* 7 — anahtar geçersiz (403) */
  mod = "403";
  await js("document.getElementById('soruKutu').value='Kimler ödeme yapmadı?'; sor(); 0;");
  await bekle(1800);
  const h403 = await js("document.getElementById('ekran').innerHTML");
  ok("403'te Türkçe hata gösterildi", h403.indexOf("Anahtar kabul edilmedi") >= 0, h403.indexOf("Gemini&#39;den cevap") >= 0 ? "uyari var ama metin farkli" : "uyari yok");
  ok("403'te yerel cevap yedek olarak geldi", h403.indexOf("borcu var") >= 0);

  /* 8 — kota (429) */
  mod = "429";
  await js("document.getElementById('soruKutu').value='Bu ay ne kadar sattım?'; sor(); 0;");
  await bekle(1800);
  ok("429'da kota mesajı gösterildi", (await js("document.getElementById('ekran').innerHTML")).indexOf("kotası doldu") >= 0);

  /* 9 — boş cevap */
  mod = "bos";
  await js("document.getElementById('soruKutu').value='Ahmet Yılmaz ne aldı?'; sor(); 0;");
  await bekle(1800);
  ok("Boş cevapta uyarı verildi", (await js("document.getElementById('ekran').innerHTML")).indexOf("Boş cevap") >= 0);

  /* 10 — internet yok (sunucu kapalı) */
  await new Promise(function (r) { sahte.close(r); });
  await js("document.getElementById('soruKutu').value='Ahmet Yılmaz borcunu ödedi mi?'; sor(); 0;");
  await bekle(3000);
  const hNet = await js("document.getElementById('ekran').innerHTML");
  ok("İnternet yokken çökmedi", await js("typeof veri === 'object' && veri.musteriler.length === 4"));
  ok("İnternet yokken Türkçe uyarı", hNet.indexOf("bağlanılamadı") >= 0, hNet.indexOf("Gemini") >= 0 ? "baska uyari" : "uyari yok");
  ok("İnternet yokken yerel cevap geldi", hNet.indexOf("7.000") >= 0);

  /* 11 — Gemini kapalıyken normal çalışma */
  await js("git('ayarlar')"); await bekle(250);
  await js("ayarAcKapa(); 0;");
  await bekle(900);
  ok("Gemini kapatıldı", await js("ayar.acik === false"));
  await js("git('soru')"); await bekle(200);
  await js("document.getElementById('soruKutu').value='Ahmet Yılmaz borcunu ödedi mi?'; sor(); 0;");
  await bekle(600);
  const hKapali = await js("document.getElementById('ekran').innerHTML");
  ok("Kapalıyken yerel cevap anında geldi", hKapali.indexOf("7.000") >= 0);
  ok("Kapalıyken 'Yerel arama' rozeti", hKapali.indexOf("Yerel arama") >= 0);

  /* 12 — anahtar silme */
  await js("git('ayarlar')"); await bekle(250);
  await js("anahtarSil(); 0;");
  await bekle(900);
  ok("Anahtar silindi", await js("ayar.anahtarVar === false"));
  ok("ayarlar.json'dan anahtar silindi", fs.readFileSync(ayarDosya, "utf8").indexOf("AIzaTEST") < 0);

  /* 13 — kayıtlar bozulmadı */
  ok("Bütün bu işlemlerden sonra veri sağlam", JSON.parse(fs.readFileSync(veriDosya, "utf8")).musteriler.length === 4);

  await js("git('ayarlar')"); await bekle(400);
  fs.writeFileSync(kok("ekran-ayarlar.png"), (await win.webContents.capturePage()).toPNG());
  await js("git('soru'); document.getElementById('soruKutu').value='Ahmet Yılmaz borcunu ödedi mi?'; sor(); 0;");
  await bekle(700);
  fs.writeFileSync(kok("ekran-soru.png"), (await win.webContents.capturePage()).toPNG());

  win.destroy();
  bitir();
}).catch(function (e) { hatalar.push("  ✗ TEST ÇÖKTÜ: " + e.stack); bitir(); });

function bitir() {
  try { sahte.close(); } catch (e) {}
  try { if (surec && surec.exitCode === null) surec.kill(); } catch (e) {}
  const basarili = notlar.filter(function (n) { return n.indexOf("✓") >= 0; }).length;
  let m = ["=========== GEMİNİ TESTİ ==========="].concat(notlar);
  if (hatalar.length) m = m.concat(["", "--- HATALAR ---"], hatalar, ["", "SONUC: " + hatalar.length + " HATA / " + basarili + " BASARILI"]);
  else m.push("", "SONUC: HEPSI BASARILI (" + basarili + " kontrol)");
  const metin = m.join("\n") + "\n";
  try { fs.writeFileSync(kok("gemini-sonuc.txt"), metin); } catch (e) {}
  process.stdout.write(metin);
  setTimeout(function () { app.exit(hatalar.length ? 1 : 0); }, 250);
}
