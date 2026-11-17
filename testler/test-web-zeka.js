"use strict";
/* WEB SÜRÜMÜNDE GEMİNİ + SES TESTİ
   Sayfa https üzerinden (GitHub Pages gibi) açılır; Google'ın adresi
   aynen kullanılır ama cevaplar bu testteki sahte sunucudan gelir.
   Sahte mikrofonla gerçek kayıt yapılır. */

const { app, BrowserWindow, protocol } = require("electron");
const fs = require("fs");
const path = require("path");

app.commandLine.appendSwitch("use-fake-device-for-media-stream");
app.commandLine.appendSwitch("use-fake-ui-for-media-stream");
protocol.registerSchemesAsPrivileged([]);

const KOK_DIZIN = path.join(__dirname, "..");
const hatalar = [], notlar = [];
let sonAdim = "(baslangic)";
setTimeout(function () { hatalar.push("  ✗ TEST TAKILDI — son adim: " + sonAdim); try { bitir(); } catch (e) { process.exit(1); } }, 240000);
function ok(ad, sart, ek) { sonAdim = ad; if (sart) notlar.push("  ✓ " + ad); else hatalar.push("  ✗ " + ad + (ek !== undefined ? " → " + ek : "")); }
function bekle(ms) { return new Promise(function (r) { setTimeout(r, ms); }); }

/* --- sahte Google --- */
let mod = "ok", istekler = [];
const CORS = { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Methods": "POST, OPTIONS",
               "Access-Control-Allow-Headers": "content-type" };
function googleCevap(req, govde) {
  istekler.push({ url: req.url, govde: govde });
  const j = JSON.parse(govde || "{}");
  const parcalar = ((j.contents || [])[0] || {}).parts || [];
  const sesli = parcalar.some(function (p) { return p.inline_data; });
  const yaz = function (kod, o) { return new Response(JSON.stringify(o), { status: kod, headers: Object.assign({ "Content-Type": "application/json" }, CORS) }); };
  if (mod === "403") return yaz(403, { error: { code: 403, message: "API key not valid" } });
  if (mod === "429") return yaz(429, { error: { code: 429, message: "Quota exceeded" } });
  let metin;
  if (sesli) {
    const form = String(parcalar[0].text || "").indexOf("form alanlarını") >= 0;
    metin = form ? JSON.stringify({ metin: "Hasan Kaya Yenice'den, iki çuval gübre aldı dört bin lira, bin lira nakit ödedi.",
                                    ad: "Hasan Kaya", koy: "Yenice", urun: "Gübre", miktar: "2 çuval", tutar: 4000,
                                    odenen: 1000, yontem: "Nakit", supheli: ["miktar"] })
                 : "Ahmet Yılmaz borcunu ödedi mi?";
  } else {
    const soru = String((parcalar[0] || {}).text || "");
    metin = soru.indexOf("TAMAM") >= 0 ? "TAMAM" : "**Ahmet Yılmaz** henüz ödemedi.\n* Kalan: 7.000 ₺";
  }
  return yaz(200, { candidates: [{ content: { parts: [{ text: metin }] }, finishReason: "STOP" }] });
}

app.on("window-all-closed", function () {});

app.whenReady().then(async function () {
  const bolum = "zeka-" + Date.now();
  const { session } = require("electron");
  const ses = session.fromPartition(bolum);
  ses.setPermissionRequestHandler(function (_w, _p, cb) { cb(true); });
  ses.protocol.handle("https", async function (req) {
    const u = new URL(req.url);
    if (u.hostname === "generativelanguage.googleapis.com") {
      if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: CORS });
      return googleCevap(req, await req.text());
    }
    if (u.hostname === "macarzeka.test") {
      const ad = u.pathname === "/" ? "index.html" : path.basename(u.pathname);
      const tam = path.join(KOK_DIZIN, ad);
      if (!fs.existsSync(tam)) return new Response("yok", { status: 404 });
      const tur = ad.endsWith(".html") ? "text/html; charset=utf-8" : ad.endsWith(".png") ? "image/png" : "application/json";
      return new Response(fs.readFileSync(tam), { headers: { "Content-Type": tur } });
    }
    return new Response("engellendi", { status: 404 });
  });

  const win = new BrowserWindow({ width: 1360, height: 900, show: false,
    webPreferences: { contextIsolation: true, nodeIntegration: false, partition: bolum } });
  win.webContents.on("console-message", function (_e, s, m, l, k) {
    if (s >= 2 && String(m).indexOf("Electron Security Warning") < 0) hatalar.push("  ✗ KONSOL: " + m + " (" + k + ":" + l + ")");
  });
  await win.loadURL("https://macarzeka.test/");
  await bekle(1200);
  const js = function (k) { return win.webContents.executeJavaScript(k, true); };

  ok("Güvenli bağlam (https)", await js("window.isSecureContext") === true);
  ok("Web kipinde (arka uç yok)", (await js("MASAUSTU")) === false);
  ok("Zeka köprüsü tarayıcı kipinde", (await js("window.zeka && window.zeka.yer")) === "tarayici");

  await js("window.confirm=function(){return true}; window.alert=function(){}; 0;");
  await js("ornekYukle()"); await bekle(600);
  // Ahmet'e TC ver: Google'a gitmediğini sınayacağız
  const TC = "12345678950";
  await js("veri.musteriler.filter(function(m){return m.ad==='Ahmet Yılmaz'})[0].tc='" + TC + "'; kaydet(); 0;");

  /* 1 — Ayarlar ekranı web'e uygun mu */
  await js("git('ayarlar')"); await bekle(300);
  let h = await js("document.getElementById('ekran').innerHTML");
  ok("Başlıkta 'Web sürümü' yazıyor", h.indexOf("Web sürümü") >= 0);
  ok("'Veri klasörünü aç' yok", h.indexOf("ayarKlasor") < 0);
  ok("İşe yaramayan güncelleme düğmesi yok", h.indexOf("guncBak") < 0);
  ok("Gemini bölümü var", h.indexOf("geminiAnahtar") >= 0);

  /* 2 — anahtarı kaydet */
  await js("document.getElementById('geminiAnahtar').value='AIzaWEB_TEST_4321'; ayarKaydet(false); 0;"); await bekle(400);
  ok("'masaüstü sürümünde çalışır' uyarısı ÇIKMADI", ((await js("(document.querySelector('.toast')||{}).textContent||''")).indexOf("masaüstü") < 0));
  ok("Anahtar kaydedildi", await js("ayar.anahtarVar") === true);
  ok("Sadece son 4 hane görünüyor", (await js("ayar.anahtarMaske")).indexOf("4321") >= 0 && (await js("JSON.stringify(ayar)")).indexOf("AIzaWEB") < 0);
  ok("Anahtar tarayıcı ayarlarına yazıldı", (await js("localStorage.getItem('macarzeka_ayar_v1')||''")).indexOf("AIzaWEB_TEST_4321") >= 0);
  ok("Anahtar defter verisine SIZMADI", (await js("localStorage.getItem('macarzeka_veri_v1')||''")).indexOf("AIzaWEB") < 0);

  /* 3 — bağlantıyı dene */
  istekler = [];
  await js("geminiDene(); 0;"); await bekle(900);
  ok("Bağlantı denemesi başarılı", (await js("document.getElementById('ayarSonuc').textContent")).indexOf("başarılı") >= 0,
     await js("document.getElementById('ayarSonuc').textContent"));
  ok("İstek gerçek Google adresine gitti", istekler.length === 1 && istekler[0].url.indexOf("https://generativelanguage.googleapis.com/v1beta/models/") === 0);
  ok("Denemede defter gönderilmedi", istekler[0] && istekler[0].govde.indexOf("Ahmet") < 0);

  /* 4 — aç ve sor */
  await js("ayarAcKapa(); 0;"); await bekle(500);
  ok("Gemini açıldı", await js("ayar.acik") === true);
  istekler = [];
  await js("git('soru'); document.getElementById('soruKutu').value='" + TC + " borcunu ödedi mi?'; sor(); 0;"); await bekle(1200);
  h = await js("document.getElementById('ekran').innerHTML");
  ok("Gemini cevabı ekrana geldi", h.indexOf("henüz ödemedi") >= 0 && h.indexOf("Gemini ile cevaplandı") >= 0);
  const giden = istekler[0] ? istekler[0].govde : "";
  ok("Defter gönderildi", giden.indexOf("KALAN BORÇ") >= 0);
  ok("TC Google'a GİTMEDİ (ne defterde ne soruda)", giden.indexOf(TC) < 0);
  ok("Sorudaki TC isme çevrildi", giden.indexOf("Ahmet Yılmaz borcunu ödedi mi?") >= 0);

  /* 5 — hata durumları */
  mod = "403";
  await js("document.getElementById('soruKutu').value='Kimler ödemedi?'; sor(); 0;"); await bekle(900);
  h = await js("document.getElementById('ekran').innerHTML");
  ok("403'te Türkçe uyarı", h.indexOf("Anahtar kabul edilmedi") >= 0);
  ok("403'te yerel cevap yedekte", h.indexOf("borcu var") >= 0);
  mod = "429";
  await js("document.getElementById('soruKutu').value='Bu ay ne kadar sattım?'; sor(); 0;"); await bekle(900);
  ok("429'da kota uyarısı", (await js("document.getElementById('ekran').innerHTML")).indexOf("kotası doldu") >= 0);
  mod = "ok";

  /* 6 — mikrofon ve sesli doldurma (web'de) */
  await js("git('yeni'); gorunum.mod='yeni'; ciz(); 0;"); await bekle(300);
  ok("Sesli doldurma düğmesi açık", await js("!document.querySelector('[data-kayit=\"form\"]').disabled"));
  istekler = [];
  await js("kayitBaslat('form'); 0;"); await bekle(1500);
  ok("Web'de kayıt başladı", await js("ses.aktif") === true);
  await js("kayitDurdur(); 0;"); await bekle(1800);
  const sesIstek = istekler[0] ? JSON.parse(istekler[0].govde) : {};
  const parca = ((((sesIstek.contents || [])[0] || {}).parts) || []).filter(function (p) { return p.inline_data; })[0];
  ok("Ses Google'a gitti", !!parca && parca.inline_data.data.length > 1500);
  ok("Mime tipi düzgün", parca && parca.inline_data.mime_type.indexOf(";") < 0 && parca.inline_data.mime_type.indexOf("audio/") === 0);
  ok("Ad dolduruldu", (await js("document.getElementById('f_ad').value")) === "Hasan Kaya");
  ok("Tutar 4000", (await js("document.getElementById('f_tutar').value")) === "4000");
  ok("Şüpheli alan işaretlendi", await js("document.getElementById('f_miktar').classList.contains('supheli')"));
  ok("KENDİLİĞİNDEN KAYDETMEDİ", (await js("veri.musteriler.filter(function(m){return m.ad==='Hasan Kaya'}).length")) === 0);
  await js("formKaydet(); 0;"); await bekle(400);
  ok("Onaylayınca kaydedildi", (await js("veri.musteriler.filter(function(m){return m.ad==='Hasan Kaya'}).map(function(m){return borc(m.id)})[0]")) === 3000);

  /* 7 — yeniden açınca ayarlar duruyor */
  win.destroy();
  const win2 = new BrowserWindow({ width: 1360, height: 900, show: false,
    webPreferences: { contextIsolation: true, nodeIntegration: false, partition: bolum } });
  await win2.loadURL("https://macarzeka.test/"); await bekle(1200);
  const js2 = function (k) { return win2.webContents.executeJavaScript(k, true); };
  ok("Kapatıp açınca Gemini hâlâ açık", await js2("ayar.acik") === true);
  ok("Kapatıp açınca kayıtlar duruyor", (await js2("veri.musteriler.length")) === 5);
  win2.destroy();

  bitir();
}).catch(function (e) { hatalar.push("  ✗ TEST ÇÖKTÜ: " + e.stack); bitir(); });

function bitir() {
  let m = ["=========== WEB GEMİNİ + SES TESTİ ==========="].concat(notlar);
  if (hatalar.length) m = m.concat(["", "--- HATALAR ---"], hatalar, ["", "SONUC: " + hatalar.length + " HATA / " + notlar.length + " BASARILI"]);
  else m.push("", "SONUC: HEPSI BASARILI (" + notlar.length + " kontrol)");
  const metin = m.join("\n") + "\n";
  try { fs.writeFileSync(path.join(KOK_DIZIN, "webzeka-sonuc.txt"), metin); } catch (e) {}
  process.stdout.write(metin);
  setTimeout(function () { app.exit(hatalar.length ? 1 : 0); }, 250);
}
