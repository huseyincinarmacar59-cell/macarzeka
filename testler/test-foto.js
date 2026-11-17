"use strict";
/* FOTOĞRAFTAN AKTARMA TESTİ (tarayıcı kipi, https, sahte Google)
   Gerçek bir telefon fotoğrafı verilirse (MZ_FOTO=/yol/foto.jpg) onu kullanır;
   verilmezse sayfada sahte bir resim üretir. Gerçek müşteri fotoğrafları
   DEPOYA KONMAZ. */

const { app, BrowserWindow, session } = require("electron");
const fs = require("fs");
const path = require("path");

const KOK_DIZIN = path.join(__dirname, "..");
const FOTO = process.env.MZ_FOTO && fs.existsSync(process.env.MZ_FOTO) ? process.env.MZ_FOTO : "";
const hatalar = [], notlar = [];
let sonAdim = "(baslangic)";
setTimeout(function () { hatalar.push("  ✗ TEST TAKILDI — son adim: " + sonAdim); try { bitir(); } catch (e) { process.exit(1); } }, 240000);
function ok(ad, sart, ek) { sonAdim = ad; if (sart) notlar.push("  ✓ " + ad); else hatalar.push("  ✗ " + ad + (ek !== undefined ? " → " + ek : "")); }
function bekle(ms) { return new Promise(function (r) { setTimeout(r, ms); }); }

/* Kartın okunmuş hâli (No 923 örneğine göre). Tarihlerin bir kısmı yılsız,
   biri de yanlış yıllı gelir: programın düzeltmesi beklenir. */
function kart(yanlis) {
  return {
    musteri: { ad: "Osman Dinler", tc: "20432501906", tel: "0546 420 84 28", koy: "Seymen", not: "vadeli" },
    sayfaNo: "923",
    satirlar: [
      { tarih: "2026-12-12", tur: "satis", urun: "Canbra", miktar: "15 lt", tutar: 33000, yontem: "", bakiye: 33000 },
      { tarih: "29.07", tur: "tahsilat", urun: "", miktar: "", tutar: 33000, yontem: "Havale / EFT", bakiye: 0 },
      { tarih: "22.09", tur: "satis", urun: "Immortal", miktar: "4 lt", tutar: 44000, yontem: "", bakiye: 44000 },
      { tarih: "2026-09-22", tur: "satis", urun: "Kelt", miktar: "7 lt", tutar: 20300, yontem: "", bakiye: 64300 },
      { tarih: "2026-11-06", tur: "satis", urun: "Tokta", miktar: "30 lt", tutar: 12000, yontem: "", bakiye: null },
      { tarih: "2026-11-06", tur: "satis", urun: "Tekvando", miktar: "6 lt", tutar: 3000, yontem: "", bakiye: null },
      { tarih: "2026-11-07", tur: "satis", urun: "Lentipur", miktar: "15 lt", tutar: yanlis ? 32500 : 82500, yontem: "", bakiye: null },
      { tarih: "2026-11-07", tur: "satis", urun: "Canbra", miktar: "10 lt", tutar: 27500, yontem: "", bakiye: null },
      { tarih: "2026-11-07", tur: "satis", urun: "Amblem", miktar: "10 lt", tutar: 29000, yontem: "", bakiye: 218300 }
    ],
    sonBakiye: 218300,
    supheli: ["satir5.urun", "tel"]
  };
}

let mod = "ok", istekler = [], gecikme = 0;
const CORS = { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Methods": "POST, OPTIONS", "Access-Control-Allow-Headers": "content-type" };
function yaz(kod, o) { return new Response(JSON.stringify(o), { status: kod, headers: Object.assign({ "Content-Type": "application/json" }, CORS) }); }

app.on("window-all-closed", function () {});

app.whenReady().then(async function () {
  const bolum = "foto-" + Date.now();
  const ses = session.fromPartition(bolum);
  ses.protocol.handle("https", async function (req) {
    const u = new URL(req.url);
    if (u.hostname === "generativelanguage.googleapis.com") {
      if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: CORS });
      const g = await req.text(); istekler.push(g);
      if (gecikme) { const d = gecikme; gecikme = 0; await bekle(d);
        return yaz(200, { candidates: [{ content: { parts: [{ text: JSON.stringify(Object.assign(kart(false), { musteri: { ad: "ESKİ CEVAP", tc: "", tel: "", koy: "", not: "" } })) }] }, finishReason: "STOP" }] }); }
      if (mod === "kesik") return yaz(200, { candidates: [{ content: { parts: [{ text: '{"musteri":{"ad":"Osman' }] }, finishReason: "MAX_TOKENS" }] });
      if (mod === "dusunmeyok" && g.indexOf("thinkingConfig") >= 0) return yaz(400, { error: { code: 400, message: "Unknown name \"thinkingConfig\" at 'generation_config'" } });
      if (mod === "403") return yaz(403, { error: { code: 403, message: "API key not valid" } });
      return yaz(200, { candidates: [{ content: { parts: [{ text: JSON.stringify(kart(mod === "yanlis")) }] }, finishReason: "STOP" }] });
    }
    if (u.hostname === "macarzeka.test") {
      if (u.pathname === "/ornek.jpg" && FOTO) return new Response(fs.readFileSync(FOTO), { headers: { "Content-Type": "image/jpeg" } });
      const ad = u.pathname === "/" ? "index.html" : path.basename(u.pathname);
      const tam = path.join(KOK_DIZIN, ad);
      if (!fs.existsSync(tam)) return new Response("yok", { status: 404 });
      return new Response(fs.readFileSync(tam), { headers: { "Content-Type": ad.endsWith(".html") ? "text/html; charset=utf-8" : "application/octet-stream" } });
    }
    return new Response("", { status: 404 });
  });

  const win = new BrowserWindow({ width: 1400, height: 950, show: false,
    webPreferences: { contextIsolation: true, nodeIntegration: false, partition: bolum } });
  win.webContents.on("console-message", function (_e, s, m, l, k) {
    if (s >= 2 && String(m).indexOf("Electron Security Warning") < 0) hatalar.push("  ✗ KONSOL: " + m + " (" + k + ":" + l + ")");
  });
  await win.loadURL("https://macarzeka.test/");
  await bekle(1100);
  const js = function (k) { return win.webContents.executeJavaScript(k, true); };
  await js("window.__sor=[]; window.__cevap=true; window.confirm=function(m){ window.__sor.push(m); return window.__cevap; }; window.alert=function(){}; 0;");

  /* Test resmi: gerçek fotoğraf ya da sayfada üretilen sahte resim */
  const resimHazirla = FOTO
    ? "fetch('/ornek.jpg').then(function(r){return r.blob()}).then(function(b){ window.__dosya=new File([b],'defter.jpg',{type:'image/jpeg'}); return b.size; })"
    : "new Promise(function(c){ var k=document.createElement('canvas'); k.width=1600; k.height=1200; var x=k.getContext('2d'); x.fillStyle='#fff'; x.fillRect(0,0,1600,1200); x.fillStyle='#22c'; x.font='60px sans-serif'; x.fillText('Osman Dinler  218300',100,200); k.toBlob(function(b){ window.__dosya=new File([b],'defter.jpg',{type:'image/jpeg'}); c(b.size); },'image/jpeg',0.9); })";
  const boyut = await js(resimHazirla);
  notlar.push("  · test resmi: " + (FOTO ? "GERÇEK telefon fotoğrafı (" : "sahte resim (") + Math.round(boyut / 1024) + " KB)");

  /* 1 — anahtar yokken */
  await js("git('foto')"); await bekle(250);
  ok("Menüde 'Fotoğraftan Aktar' var", (await js("document.querySelector('[data-git=foto]') ? 1 : 0")) === 1);
  ok("Bırakma alanı görünüyor", (await js("document.getElementById('ekran').innerHTML")).indexOf("Ctrl+V") >= 0);
  await js("fotoBaslat(window.__dosya); 0;"); await bekle(400);
  ok("Anahtar yokken anlaşılır uyarı", (await js("document.getElementById('ekran').innerHTML")).indexOf("Gemini anahtarını gir") >= 0);
  ok("Anahtar yokken Google'a gitmedi", istekler.length === 0);

  await js("window.zeka.ayarKaydet({anahtar:'AIzaFOTO_1234', acik:true}).then(function(r){ ayarYaz(r); }); 0;"); await bekle(300);

  /* 2 — fotoğrafı oku */
  await js("fotoBaslat(window.__dosya); 0;"); await bekle(150);
  ok("Okunurken bekleme ekranı", (await js("document.getElementById('ekran').innerHTML")).indexOf("okunuyor") >= 0);
  ok("Bekleme ekranında saniye sayacı var", (await js("!!document.getElementById('fotoSure')")));
  for (let i = 0; i < 40 && (await js("gorunum.foto.durum")) !== "hazir"; i++) await bekle(250);
  ok("Okuma bitti, kontrol ekranı açıldı", (await js("gorunum.foto.durum")) === "hazir");

  const g = JSON.parse(istekler[0] || "{}");
  const parca = ((((g.contents || [])[0] || {}).parts) || []).filter(function (p) { return p.inline_data; })[0];
  ok("Resim Google'a JPEG olarak gitti", parca && parca.inline_data.mime_type === "image/jpeg");
  ok("Resim küçültülerek gönderildi", parca && parca.inline_data.data.length * 0.75 < Math.max(boyut, 1) * 1.1 + 60000, "gonderilen ~" + Math.round((parca ? parca.inline_data.data.length * 0.75 : 0) / 1024) + " KB");
  ok("Bugünün tarihi gönderildi", JSON.stringify(g).indexOf("BUGÜNÜN TARİHİ") >= 0);
  ok("Kart okuma komutu gönderildi", JSON.stringify(g).indexOf("veresiye") >= 0);
  ok("Düşünme kısık gönderildi (hız)", g.generationConfig && g.generationConfig.thinkingConfig && g.generationConfig.thinkingConfig.thinkingLevel === "low");
  ok("Cevaba bol yer bırakıldı (yarıda kesilmesin)", g.generationConfig && g.generationConfig.maxOutputTokens >= 16000);
  const gen = await js("new Promise(function(c){ var i=new Image(); i.onload=function(){ c(Math.max(i.width,i.height)); }; i.src='data:image/jpeg;base64,'+" + JSON.stringify(parca ? parca.inline_data.data : "") + "; })");
  ok("Gönderilen resim en fazla 1600 px", gen > 0 && gen <= 1600, gen + " px");

  let h = await js("document.getElementById('ekran').innerHTML");
  ok("Ad okundu", (await js("document.getElementById('fm_ad').value")) === "Osman Dinler");
  ok("TC okundu ve geçerli", (await js("document.getElementById('fm_tc').value")) === "20432501906" && h.indexOf("Geçerli TC") >= 0);
  ok("Köy okundu", (await js("document.getElementById('fm_koy').value")) === "Seymen");
  ok("Şüpheli telefon işaretli", await js("document.getElementById('fm_tel').classList.contains('supheli')"));
  ok("9 satır listelendi", (await js("gorunum.foto.satirlar.length")) === 9);
  ok("Yılsız tarih tamamlandı (29.07 → 2026-07-29)", (await js("gorunum.foto.satirlar[1].tarih")) === "2026-07-29");
  ok("Gelecek tarih düzeltildi (2026-12-12 → 2025-12-12)", (await js("gorunum.foto.satirlar[0].tarih")) === "2025-12-12");
  ok("Tahsilat satırı tanındı", (await js("gorunum.foto.satirlar[1].tur")) === "tahsilat" && (await js("gorunum.foto.satirlar[1].yontem")) === "Havale / EFT");
  ok("Şüpheli ürün (5. satır) kırmızı", await js("document.querySelector('[data-fs=\"4.urun\"]').classList.contains('supheli')"));
  ok("Bakiye tutuyor ✓", h.indexOf("Bakiye tutuyor") >= 0);
  ok("Defter No gösteriliyor", h.indexOf("Defter No 923") >= 0);
  ok("Yeni müşteri açılacak", (await js("gorunum.foto.hedef")) === "");
  ok("HENÜZ KAYDEDİLMEDİ", (await js("veri.musteriler.length")) === 0);

  /* 3 — yanlış rakam yazınca bakiye uyarısı, düzeltince geçsin */
  await js("var e=document.querySelector('[data-fs=\"6.tutar\"]'); e.value='32500'; e.dispatchEvent(new Event('input',{bubbles:true})); 0;"); await bekle(150);
  h = await js("document.getElementById('fotoBakiyeKutu').innerHTML");
  ok("Yanlış rakamda 'Bakiye tutmuyor'", h.indexOf("tutmuyor") >= 0 && h.indexOf("50.000") >= 0, h.replace(/<[^>]+>/g, "").slice(0, 120));
  ok("Bozan satırdan sonraki bakiye kırmızı", (await js("document.getElementById('fb_8').innerHTML")).indexOf("✗") >= 0);
  await js("var e=document.querySelector('[data-fs=\"6.tutar\"]'); e.value='82500'; e.dispatchEvent(new Event('input',{bubbles:true})); 0;"); await bekle(150);
  ok("Düzeltince tekrar tutuyor", (await js("document.getElementById('fotoBakiyeKutu').innerHTML")).indexOf("tutuyor") >= 0);

  /* 4 — kaydet */
  await js("window.__sor=[]; document.getElementById('fotoKaydet').click(); 0;"); await bekle(500);
  const osman = await js("JSON.stringify(veri.musteriler.filter(function(m){return m.ad==='Osman Dinler'})[0]||null)");
  ok("Müşteri oluşturuldu", osman !== "null");
  const oid = JSON.parse(osman).id;
  ok("TC, telefon, köy kaydedildi", JSON.parse(osman).tc === "20432501906" && JSON.parse(osman).koy === "Seymen" && JSON.parse(osman).tel.indexOf("0546") === 0);
  ok("8 satış eklendi", (await js("satislari('" + oid + "').length")) === 8);
  ok("1 tahsilat eklendi", (await js("odemeleri('" + oid + "').length")) === 1);
  ok("Kalan borç defterle aynı: 218.300", (await js("borc('" + oid + "')")) === 218300);
  ok("Vadeli notu satışlara işlendi", (await js("satislari('" + oid + "')[0].vadeNot")) === "Vadeli");
  ok("Aktarma notu eklendi (No 923)", (await js("JSON.stringify(msAl('" + oid + "').notlar)")).indexOf("No 923") >= 0);
  ok("Bakiye tuttuğu için soru sorulmadı", (await js("window.__sor.length")) === 0, await js("JSON.stringify(window.__sor)"));
  ok("Başarı mesajı ve 'Kartı aç'", (await js("document.getElementById('ekran').innerHTML")).indexOf("Kartı aç") >= 0);
  ok("Hafızaya yazıldı", (await js("localStorage.getItem('macarzeka_veri_v1')")).indexOf("Lentipur") >= 0);

  /* 5 — aynı sayfayı tekrar aktar: hiçbir şey ikinci kez eklenmesin */
  istekler = [];
  await js("fotoBaslat(window.__dosya); 0;");
  for (let i = 0; i < 40 && (await js("gorunum.foto.durum")) !== "hazir"; i++) await bekle(250);
  ok("Tekrar aktarımda kayıtlı müşteri TC'den bulundu", (await js("gorunum.foto.hedef")) === oid);
  ok("Bütün satırlar 'zaten kayıtlı' işaretlendi", (await js("gorunum.foto.satirlar.every(function(s){return s.var && !s.sec})")) === true);
  await js("document.getElementById('fotoKaydet').click(); 0;"); await bekle(400);
  ok("İkinci kez EKLENMEDİ (satış hâlâ 8)", (await js("satislari('" + oid + "').length")) === 8);
  ok("Borç değişmedi", (await js("borc('" + oid + "')")) === 218300);
  ok("Müşteri ikinci kez açılmadı", (await js("veri.musteriler.filter(function(m){return m.ad==='Osman Dinler'}).length")) === 1);
  ok("Boş '(0 satır)' notu düşmedi", (await js("msAl('" + oid + "').notlar.length")) === 1);
  ok("'Eklenecek bir şey yok' dendi", (await js("document.getElementById('ekran').innerHTML")).indexOf("eklenecek bir şey yok") >= 0);

  /* 6 — Gemini bir rakamı yanlış okursa */
  mod = "yanlis";
  await js("git('foto'); fotoBaslat(window.__dosya); 0;");
  for (let i = 0; i < 40 && (await js("gorunum.foto.durum")) !== "hazir"; i++) await bekle(250);
  await js("document.getElementById('fm_hedef').value=''; document.getElementById('fm_hedef').dispatchEvent(new Event('change',{bubbles:true})); 0;"); await bekle(200);
  h = await js("document.getElementById('ekran').innerHTML");
  ok("Yanlış okumada 'Bakiye tutmuyor'", h.indexOf("Bakiye tutmuyor") >= 0);
  ok("Fark doğru: 50.000", h.indexOf("50.000") >= 0);
  await js("window.__sor=[]; window.__cevap=false; document.getElementById('fotoKaydet').click(); 0;"); await bekle(300);
  ok("Tutmayan bakiyede kaydetmeden önce sordu", (await js("window.__sor.join('|')")).indexOf("tutmuyor") >= 0);
  ok("Vazgeçince kaydedilmedi", (await js("veri.musteriler.length")) === 1);
  await js("window.__cevap=true; fotoSifirla(); 0;");
  mod = "ok";

  /* 7 — yapıştırma (Ctrl+V) başka ekrandayken de çalışsın */
  await js("git('panel'); 0;"); await bekle(200);
  istekler = [];
  await js("var dt=new DataTransfer(); dt.items.add(window.__dosya); document.dispatchEvent(new ClipboardEvent('paste',{clipboardData:dt, bubbles:true})); 0;");
  await bekle(300);
  ok("Ctrl+V fotoğraf ekranını açtı", (await js("gorunum.ad")) === "foto");
  for (let i = 0; i < 40 && (await js("gorunum.foto.durum")) !== "hazir"; i++) await bekle(250);
  ok("Yapıştırılan fotoğraf okundu", istekler.length === 1 && (await js("gorunum.foto.durum")) === "hazir");
  await js("fotoSifirla(); ciz(); 0;");

  /* 7b — üst üste iki fotoğraf: geç gelen ilk cevap ikincinin yerine yazılmasın */
  gecikme = 2500;
  await js("fotoBaslat(window.__dosya); 0;"); await bekle(400);
  await js("fotoBaslat(window.__dosya); 0;");
  for (let i = 0; i < 40 && (await js("gorunum.foto.durum")) !== "hazir"; i++) await bekle(250);
  await bekle(2800);
  ok("Geç gelen eski cevap yeni okumanın üstüne YAZILMADI", (await js("gorunum.foto.m && gorunum.foto.m.ad")) === "Osman Dinler", await js("gorunum.foto.m && gorunum.foto.m.ad"));
  await js("fotoSifirla(); ciz(); 0;");

  /* 8 — yazı yapıştırmak fotoğraf okumayı tetiklemesin */
  istekler = [];
  await js("git('musteriler'); var dt=new DataTransfer(); dt.setData('text/plain','Ahmet'); document.dispatchEvent(new ClipboardEvent('paste',{clipboardData:dt, bubbles:true})); 0;");
  await bekle(300);
  ok("Yazı yapıştırınca fotoğraf ekranına geçmedi", (await js("gorunum.ad")) === "musteriler" && istekler.length === 0);

  /* 9 — Google hatası */
  mod = "403";
  await js("git('foto'); fotoBaslat(window.__dosya); 0;");
  for (let i = 0; i < 40 && (await js("gorunum.foto.durum")) === "okunuyor"; i++) await bekle(250);
  ok("Google hatasında anlaşılır mesaj", (await js("document.getElementById('ekran').innerHTML")).indexOf("Anahtar kabul edilmedi") >= 0);
  ok("Hatada veri bozulmadı", (await js("borc('" + oid + "')")) === 218300);

  /* 9b — cevap yarıda kesildi */
  mod = "kesik";
  await js("git('foto'); fotoBaslat(window.__dosya); 0;");
  for (let i = 0; i < 40 && (await js("gorunum.foto.durum")) === "okunuyor"; i++) await bekle(250);
  ok("Yarıda kesilen cevapta anlaşılır mesaj", (await js("document.getElementById('ekran').innerHTML")).indexOf("yarıda kesti") >= 0);

  /* 9c — model düşünme ayarını tanımıyor: sade istekle yeniden dener */
  mod = "dusunmeyok"; istekler.length = 0;
  await js("git('foto'); fotoBaslat(window.__dosya); 0;");
  for (let i = 0; i < 40 && (await js("gorunum.foto.durum")) === "okunuyor"; i++) await bekle(250);
  ok("Düşünme ayarı reddedilince sade istekle okudu", (await js("gorunum.foto.durum")) === "hazir" && istekler.length === 2 && istekler[1].indexOf("thinkingConfig") < 0, istekler.length + " istek");
  mod = "ok"; await js("fotoSifirla(); ciz(); 0;");

  /* 10 — resim olmayan dosya */
  await js("fotoBaslat(new File(['merhaba'],'not.txt',{type:'text/plain'})); 0;"); await bekle(400);
  ok("Resim olmayan dosyada uyarı", (await js("document.getElementById('ekran').innerHTML")).indexOf("fotoğraf dosyası değil") >= 0);

  /* 11 — kartta görünüm */
  await js("git('musteri','" + oid + "')"); await bekle(300);
  h = await js("document.getElementById('ekran').innerHTML");
  ok("Kartta 218.300 borç", h.indexOf("218.300") >= 0);
  ok("Kartta undefined/NaN yok", h.indexOf("undefined") < 0 && h.indexOf("NaN") < 0);

  mod = "ok";
  await js("git('foto'); fotoBaslat(window.__dosya); 0;");
  for (let i = 0; i < 40 && (await js("gorunum.foto.durum")) !== "hazir"; i++) await bekle(250);
  // Kontrol ekranının görüntüsü: yanlış okunmuş bir kart, yeni müşteri olarak
  await js("window.__kart=" + JSON.stringify(kart(true)) + "; git('foto'); fotoSonucuKur(window.__kart, ''); gorunum.foto.hedef=''; fotoMukerrerIsaretle(); ciz(); 0;");
  await bekle(600); win.webContents.invalidate(); await bekle(400);
  ok("Kayıtlı müşteriden 'yeni müşteri'ye geçince satırlar yeniden seçili", await js("gorunum.foto.satirlar.every(function(s){return s.sec && !s.var;})"));
  notlar.push("  · goruntu aninda ekran: " + (await js("gorunum.ad + ' / ' + (gorunum.foto&&gorunum.foto.durum) + ' / ' + document.getElementById('ekran').innerHTML.replace(/<[^>]+>/g,' ').replace(/\\s+/g,' ').slice(0,90)")));
  fs.writeFileSync(path.join(KOK_DIZIN, "foto-kontrol.png"), (await win.webContents.capturePage()).toPNG());

  win.destroy(); bitir();
}).catch(function (e) { hatalar.push("  ✗ TEST ÇÖKTÜ: " + e.stack); bitir(); });

function bitir() {
  let m = ["=========== FOTOĞRAFTAN AKTARMA TESTİ ==========="].concat(notlar);
  const n = notlar.filter(function (x) { return x.indexOf("✓") >= 0; }).length;
  if (hatalar.length) m = m.concat(["", "--- HATALAR ---"], hatalar, ["", "SONUC: " + hatalar.length + " HATA / " + n + " BASARILI"]);
  else m.push("", "SONUC: HEPSI BASARILI (" + n + " kontrol)");
  const metin = m.join("\n") + "\n";
  try { fs.writeFileSync(path.join(KOK_DIZIN, "foto-sonuc.txt"), metin); } catch (e) {}
  process.stdout.write(metin);
  setTimeout(function () { app.exit(hatalar.length ? 1 : 0); }, 250);
}
