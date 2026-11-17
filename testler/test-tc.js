"use strict";
/* TC KİMLİK NO TESTİ (tarayıcı kipinde, arka uç olmadan)
   Doğrulama algoritması, kaydetme, hatalı/çift TC uyarısı, düzenleme,
   arama, yerel soru-cevap ve TC'nin Gemini'ye giden metne SIZMAMASI. */

const { app, BrowserWindow } = require("electron");
const http = require("http");
const fs = require("fs");
const path = require("path");

const KOK_DIZIN = path.join(__dirname, "..");
const hatalar = [], notlar = [];
let sonAdim = "(baslangic)";
setTimeout(function () { hatalar.push("  ✗ TEST TAKILDI — son adim: " + sonAdim); try { bitir(); } catch (e) { process.exit(1); } }, 200000);
function ok(ad, sart, ek) { sonAdim = ad; if (sart) notlar.push("  ✓ " + ad); else hatalar.push("  ✗ " + ad + (ek !== undefined ? " → " + ek : "")); }
function bekle(ms) { return new Promise(function (r) { setTimeout(r, ms); }); }

/* Algoritmaya uygun, uydurma TC üret (gerçek kişiye ait olması amaçlanmaz) */
function tcUret(ilk9) {
  const d = ilk9.split("").map(Number);
  const tek = d[0] + d[2] + d[4] + d[6] + d[8], cift = d[1] + d[3] + d[5] + d[7];
  const d10 = (((tek * 7 - cift) % 10) + 10) % 10;
  const top = d.reduce(function (a, b) { return a + b; }, 0) + d10;
  return ilk9 + d10 + (top % 10);
}
const TC1 = tcUret("123456789");
const TC2 = tcUret("987654321");
const TC_HATALI = TC1.slice(0, 10) + ((Number(TC1[10]) + 1) % 10);

const sunucu = http.createServer(function (req, res) {
  let yol = req.url;
  if (/^https?:\/\//i.test(yol)) { try { yol = new URL(yol).pathname; } catch (e) {} }
  if (yol === "/" || yol === "/index.html") {
    res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
    res.end(fs.readFileSync(path.join(KOK_DIZIN, "index.html"))); return;
  }
  res.writeHead(404); res.end();
});
app.on("window-all-closed", function () {});

app.whenReady().then(async function () {
  await new Promise(function (r) { sunucu.listen(0, "127.0.0.1", r); });
  const win = new BrowserWindow({ width: 1340, height: 900, show: false,
    webPreferences: { contextIsolation: true, nodeIntegration: false, partition: "tc-" + Date.now() } });
  win.webContents.on("console-message", function (_e, s, m, l, k) {
    if (s >= 2 && String(m).indexOf("Electron Security Warning") < 0) hatalar.push("  ✗ KONSOL: " + m + " (" + k + ":" + l + ")");
  });
  await win.webContents.session.setProxy({ proxyRules: "http=127.0.0.1:" + sunucu.address().port });
  await win.loadURL("http://macarzeka.test/");
  await bekle(1100);
  const js = function (k) { return win.webContents.executeJavaScript(k, true); };

  /* onaylari kaydet: hangi uyari soruldu? */
  await js("window.__sorular=[]; window.__cevap=true; window.confirm=function(m){ window.__sorular.push(m); return window.__cevap; }; window.alert=function(){}; 0;");
  await js("ornekYukle()"); await bekle(600);
  await js("window.__sorular=[]; 0;");

  /* 1 — algoritma */
  ok("Geçerli TC kabul ediliyor", await js("tcGecerli('" + TC1 + "')") === true, TC1);
  ok("İkinci geçerli TC kabul ediliyor", await js("tcGecerli('" + TC2 + "')") === true, TC2);
  ok("Son hanesi yanlış TC reddediliyor", await js("tcGecerli('" + TC_HATALI + "')") === false);
  ok("0 ile başlayan reddediliyor", await js("tcGecerli('0" + TC1.slice(1) + "')") === false);
  ok("10 haneli reddediliyor", await js("tcGecerli('" + TC1.slice(0, 10) + "')") === false);
  ok("Harf içeren temizleniyor", await js("tcTemizle('" + TC1.slice(0, 3) + " " + TC1.slice(3) + "')") === TC1);
  ok("Boşluklu yazılan geçerli sayılıyor", await js("tcGecerli('" + TC1.slice(0, 3) + " " + TC1.slice(3, 6) + " " + TC1.slice(6) + "')") === true);

  /* 2 — yeni kayıtta alan ve canlı denetim */
  await js("git('yeni'); gorunum.mod='yeni'; ciz(); 0;"); await bekle(300);
  ok("Formda TC alanı var", await js("!!document.getElementById('f_tc')"));
  await js("var e=document.getElementById('f_tc'); e.value='" + TC1 + "'; e.dispatchEvent(new Event('input',{bubbles:true})); 0;"); await bekle(100);
  ok("Yazarken 'Geçerli TC' gösteriyor", (await js("document.getElementById('f_tc_durum').textContent")).indexOf("Geçerli") >= 0);
  await js("var e=document.getElementById('f_tc'); e.value='" + TC_HATALI + "'; e.dispatchEvent(new Event('input',{bubbles:true})); 0;"); await bekle(100);
  ok("Yazarken 'Hatalı TC' gösteriyor", (await js("document.getElementById('f_tc_durum').textContent")).indexOf("Hatalı") >= 0);
  await js("var e=document.getElementById('f_tc'); e.value='12ab34 56'; e.dispatchEvent(new Event('input',{bubbles:true})); 0;"); await bekle(100);
  ok("Rakam dışı karakterler siliniyor", (await js("document.getElementById('f_tc').value")) === "123456");

  /* 3 — geçerli TC ile kaydet */
  await js("document.getElementById('f_ad').value='Veli Tekin'; document.getElementById('f_tc').value='" + TC1 + "'; formKaydet(); 0;"); await bekle(500);
  const veli = await js("JSON.stringify(veri.musteriler.filter(function(m){return m.ad==='Veli Tekin'})[0]||null)");
  ok("TC ile müşteri kaydedildi", veli !== "null" && JSON.parse(veli).tc === TC1, veli);
  ok("Geçerli TC'de uyarı sorulmadı", (await js("window.__sorular.length")) === 0, await js("JSON.stringify(window.__sorular)"));
  ok("Hafızaya TC ile yazıldı", (await js("localStorage.getItem('macarzeka_veri_v1')")).indexOf(TC1) >= 0);

  /* 4 — hatalı TC uyarısı, vazgeçince kaydetmesin */
  await js("window.__sorular=[]; window.__cevap=false; git('yeni'); gorunum.mod='yeni'; ciz(); 0;"); await bekle(300);
  await js("document.getElementById('f_ad').value='Hatalı Kişi'; document.getElementById('f_tc').value='" + TC_HATALI + "'; formKaydet(); 0;"); await bekle(400);
  ok("Hatalı TC'de uyarı soruldu", (await js("window.__sorular.join('|')")).indexOf("hatalı") >= 0);
  ok("Vazgeçince kaydedilmedi", (await js("veri.musteriler.filter(function(m){return m.ad==='Hatalı Kişi'}).length")) === 0);

  /* 5 — aynı TC ikinci kişide uyarı */
  await js("window.__sorular=[]; window.__cevap=false; git('yeni'); gorunum.mod='yeni'; ciz(); 0;"); await bekle(300);
  await js("document.getElementById('f_ad').value='Başka Biri'; document.getElementById('f_tc').value='" + TC1 + "'; formKaydet(); 0;"); await bekle(400);
  ok("Aynı TC'de 'zaten kayıtlı' uyarısı", (await js("window.__sorular.join('|')")).indexOf("Veli Tekin") >= 0, await js("window.__sorular.join('|')"));
  ok("Vazgeçince çift kayıt olmadı", (await js("veri.musteriler.filter(function(m){return m.ad==='Başka Biri'}).length")) === 0);
  await js("window.__cevap=true; 0;");

  /* 6 — mevcut müşteriyi düzenle, TC ekle */
  const ahmet = await js("veri.musteriler.filter(function(m){return m.ad==='Ahmet Yılmaz'})[0].id");
  await js("git('musteri','" + ahmet + "')"); await bekle(300);
  ok("Kartta 'Bilgileri düzenle' var", (await js("document.getElementById('ekran').innerHTML")).indexOf("Bilgileri düzenle") >= 0);
  await js("document.querySelector('[data-duzenle]').click(); 0;"); await bekle(300);
  ok("Düzenleme formu açıldı", await js("!!document.getElementById('d_tc')"));
  ok("Mevcut ad formda dolu", (await js("document.getElementById('d_ad').value")) === "Ahmet Yılmaz");
  await js("window.__sorular=[]; document.getElementById('d_tc').value='" + TC2 + "'; document.getElementById('d_tel').value='0555 999 88 77'; duzenleKaydet(); 0;"); await bekle(500);
  ok("TC sonradan eklendi", (await js("msAl('" + ahmet + "').tc")) === TC2);
  ok("Telefon güncellendi", (await js("msAl('" + ahmet + "').tel")) === "0555 999 88 77");
  ok("Satışlar/borç korunuyor", (await js("borc('" + ahmet + "')")) === 7000);
  ok("Kartta TC görünüyor", (await js("document.getElementById('ekran').innerHTML")).indexOf(TC2) >= 0);
  ok("Düzenleme formu kapandı", (await js("!!document.getElementById('d_tc')")) === false);
  ok("Hafızaya yazıldı", (await js("localStorage.getItem('macarzeka_veri_v1')")).indexOf(TC2) >= 0);

  /* 7 — boş ad engelleniyor */
  await js("document.querySelector('[data-duzenle]').click(); 0;"); await bekle(250);
  await js("document.getElementById('d_ad').value=''; duzenleKaydet(); 0;"); await bekle(250);
  ok("Ad boş bırakılamıyor", (await js("msAl('" + ahmet + "').ad")) === "Ahmet Yılmaz");
  await js("document.getElementById('duzenleVazgec').click(); 0;"); await bekle(200);

  /* 8 — arama */
  await js("gorunum.arama='" + TC2 + "'; git('musteriler'); 0;"); await bekle(300);
  ok("TC ile listede aranıyor", (await js("document.querySelectorAll('tbody tr').length")) === 1);
  ok("Doğru kişi bulundu", (await js("document.querySelector('tbody tr').textContent")).indexOf("Ahmet Yılmaz") >= 0);
  await js("gorunum.arama='" + TC2.slice(0, 5) + "'; git('musteriler'); 0;"); await bekle(300);
  ok("TC'nin ilk haneleriyle de buluyor", (await js("document.querySelectorAll('tbody tr').length")) >= 1);
  await js("gorunum.arama=''; 0;");

  /* 9 — yerel soru-cevap TC ile */
  const c = JSON.parse(await js("JSON.stringify(cevapla('" + TC2 + " borcu ne kadar'))"));
  ok("Soruda TC yazınca kişiyi buluyor", c.metin.indexOf("Ahmet Yılmaz") >= 0 && c.metin.indexOf("7.000") >= 0, c.metin.slice(0, 80));

  /* 10 — GİZLİLİK: Gemini'ye giden metinde TC olmamalı */
  const baglam = await js("baglamKur()");
  ok("Gemini defterinde TC YOK", baglam.indexOf(TC1) < 0 && baglam.indexOf(TC2) < 0);
  ok("Gemini defterinde isim var (defter yine dolu)", baglam.indexOf("Ahmet Yılmaz") >= 0);
  // soru metni maskeleniyor mu: sor() icindeki donusumu ayni sekilde uygula
  const maskeli = await js("String('" + TC2 + " borcu ne kadar').replace(/\\b[1-9][0-9]{10}\\b/g,function(t){ var k=tcSahibi(t,null); return k?k.ad:'[TC]'; })");
  ok("Soru metnindeki TC isme çevriliyor", maskeli.indexOf(TC2) < 0 && maskeli.indexOf("Ahmet Yılmaz") >= 0, maskeli);
  const kaynak = fs.readFileSync(path.join(KOK_DIZIN, "index.html"), "utf8");
  ok("sor() maskeli metni gönderiyor", kaynak.indexOf("window.macar.sor({ soru:gidecek") >= 0);

  /* 11 — TC'siz eski kayıtlar sorunsuz */
  const mehmet = await js("veri.musteriler.filter(function(m){return m.ad==='Mehmet Yılmaz'})[0].id");
  await js("git('musteri','" + mehmet + "')"); await bekle(300);
  const kart = await js("document.getElementById('ekran').innerHTML");
  ok("TC'siz kartta 'TC:' satırı çıkmıyor", kart.indexOf("TC:") < 0);
  ok("Kartta undefined/NaN yok", kart.indexOf("undefined") < 0 && kart.indexOf("NaN") < 0);

  win.destroy(); bitir();
}).catch(function (e) { hatalar.push("  ✗ TEST ÇÖKTÜ: " + e.stack); bitir(); });

function bitir() {
  try { sunucu.close(); } catch (e) {}
  let m = ["=========== TC KİMLİK NO TESTİ ==========="].concat(notlar);
  if (hatalar.length) m = m.concat(["", "--- HATALAR ---"], hatalar, ["", "SONUC: " + hatalar.length + " HATA / " + notlar.length + " BASARILI"]);
  else m.push("", "SONUC: HEPSI BASARILI (" + notlar.length + " kontrol)");
  const metin = m.join("\n") + "\n";
  try { fs.writeFileSync(path.join(KOK_DIZIN, "tc-sonuc.txt"), metin); } catch (e) {}
  process.stdout.write(metin);
  setTimeout(function () { app.exit(hatalar.length ? 1 : 0); }, 250);
}
