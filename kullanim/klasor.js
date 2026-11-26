/* ============================================================
   Macar Talimat — kayıtları bilgisayarda bir klasöre yazma
   ------------------------------------------------------------
   * Bir kere klasör seçilir (ör. Belgeler\Macar Talimat Kayıtlar).
   * Her değişiklikte o klasördeki macar-talimat-veriler.json güncellenir.
   * Her gün yedekler\macar-talimat-YYYY-AA-GG.json kopyası alınır (son 60 gün).
   * Tarayıcı hafızası ikinci kopya olarak durur; açılışta hangisi daha
     yeniyse o kullanılır. Edge verisi silinse bile klasör yerinde kalır.
   * Dosya adı MacarZeka'nınkinden farklıdır: ikisi aynı klasöre de
     kaydedilse birbirine karışmaz.
   * Yalnızca Edge/Chrome'da (File System Access) çalışır.
   ============================================================ */
(function () {
  "use strict";
  var DB = "macar-talimat-klasor", DEPO = "tutamak", ANAHTAR_T = "klasor";
  var DOSYA = "macar-talimat-veriler.json", YEDEK_DIZIN = "yedekler", YEDEK_ON = "macar-talimat-", YEDEK_SAYI = 60;
  var SONRA_ANAHTAR = "macar-talimat-klasor-sonra";

  var dizin = null;          // FileSystemDirectoryHandle
  var durum = "yok";         // yok | izin | acik | hata | desteksiz
  var hata = "", sonYazma = "", bekleyen = false, zamanlayici = null;
  var zincir = Promise.resolve(), yedekGunu = "";

  function cerceveIcinde() { try { return window.self !== window.top; } catch (er) { return true; } }
  // Çerçeve içinde (ör. önizleme sayfası) klasör seçme penceresi açılamaz; orada tarayıcı hafızası kullanılır.
  function destekli() { return typeof window.showDirectoryPicker === "function" && !cerceveIcinde(); }
  function e(s) { return String(s == null ? "" : s).replace(/[&<>"']/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]; }); }
  function ikon(ad) { return '<svg class="ik" aria-hidden="true"><use href="#i-' + ad + '"/></svg>'; }
  function haber(m, tur) { if (typeof bildir === "function") bildir(m, tur); }
  function simdiSaat() { var d = new Date(); return String(d.getHours()).padStart(2, "0") + ":" + String(d.getMinutes()).padStart(2, "0"); }
  function gun() { var d = new Date(); return d.getFullYear() + "-" + String(d.getMonth() + 1).padStart(2, "0") + "-" + String(d.getDate()).padStart(2, "0"); }
  function tarihSaat(t) { if (!t) return "bilinmiyor"; var d = new Date(t); return String(d.getDate()).padStart(2, "0") + "." + String(d.getMonth() + 1).padStart(2, "0") + "." + d.getFullYear() + " " + String(d.getHours()).padStart(2, "0") + ":" + String(d.getMinutes()).padStart(2, "0"); }
  function sayi(v) { return { ilac: (v && v.ilaclar || []).length, talimat: (v && v.talimatlar || []).length }; }

  /* ---------- klasörü hatırlama (IndexedDB) ---------- */
  function dbAc() {
    return new Promise(function (ok, red) {
      var r = indexedDB.open(DB, 1);
      r.onupgradeneeded = function () { r.result.createObjectStore(DEPO); };
      r.onsuccess = function () { ok(r.result); };
      r.onerror = function () { red(r.error); };
    });
  }
  function dbAl() {
    if (window.MT_KLASOR_DEPO) return window.MT_KLASOR_DEPO.al();   // test için
    return dbAc().then(function (db) {
      return new Promise(function (ok) {
        var t = db.transaction(DEPO, "readonly").objectStore(DEPO).get(ANAHTAR_T);
        t.onsuccess = function () { ok(t.result || null); }; t.onerror = function () { ok(null); };
      });
    }).catch(function () { return null; });
  }
  function dbKoy(v) {
    if (window.MT_KLASOR_DEPO) return window.MT_KLASOR_DEPO.koy(v);
    return dbAc().then(function (db) {
      return new Promise(function (ok) {
        var tx = db.transaction(DEPO, "readwrite");
        if (v) tx.objectStore(DEPO).put(v, ANAHTAR_T); else tx.objectStore(DEPO).delete(ANAHTAR_T);
        tx.oncomplete = function () { ok(true); }; tx.onerror = function () { ok(false); };
      });
    }).catch(function () { return false; });
  }

  /* ---------- dosya işleri ---------- */
  function izinVar(h, iste) {
    if (!h) return Promise.resolve(false);
    var o = { mode: "readwrite" };
    var q = h.queryPermission ? h.queryPermission(o) : Promise.resolve("granted");
    return q.then(function (s) {
      if (s === "granted") return true;
      if (!iste || !h.requestPermission) return false;
      return h.requestPermission(o).then(function (s2) { return s2 === "granted"; });
    }).catch(function () { return false; });
  }
  function gecerli(v) { return v && Array.isArray(v.ilaclar) && (Array.isArray(v.talimatlar) || typeof eskiListe !== "function" || eskiListe(v)); }
  function dosyaOku(h) {
    return h.getFileHandle(DOSYA).then(function (f) { return f.getFile(); })
      .then(function (f) { return f.text(); })
      .then(function (t) { var v = JSON.parse(t); if (!gecerli(v)) throw new Error("tanınmayan dosya"); return v; })
      .catch(function (er) { if (er && er.name === "NotFoundError") return null; throw er; });
  }
  function dosyaYaz(h, ad, metin) {
    return h.getFileHandle(ad, { create: true }).then(function (f) { return f.createWritable(); })
      .then(function (w) { return w.write(metin).then(function () { return w.close(); }); });
  }
  function gunlukYedek(metin) {
    var g = gun();
    if (yedekGunu === g) return Promise.resolve();
    return dizin.getDirectoryHandle(YEDEK_DIZIN, { create: true }).then(function (y) {
      var ad = YEDEK_ON + g + ".json";
      return y.getFileHandle(ad).then(function () { yedekGunu = g; }, function () {
        return dosyaYaz(y, ad, metin).then(function () { yedekGunu = g; return eskiYedekleriSil(y); });
      });
    }).catch(function () {});
  }
  function eskiYedekleriSil(y) {
    if (!y.keys) return Promise.resolve();
    var adlar = [], it = y.keys(), kalip = /^macar-talimat-\d{4}-\d{2}-\d{2}\.json$/;
    function dolas() { return it.next().then(function (r) { if (r.done) return; if (kalip.test(r.value)) adlar.push(r.value); return dolas(); }); }
    return dolas().then(function () {
      adlar.sort();
      return Promise.all(adlar.slice(0, Math.max(0, adlar.length - YEDEK_SAYI)).map(function (a) { return y.removeEntry(a).catch(function () {}); }));
    }).catch(function () {});
  }

  function simdiYaz() {
    if (!dizin || durum !== "acik") { bekleyen = true; return Promise.resolve(); }
    bekleyen = false;
    zincir = zincir.then(function () {
      var metin = JSON.stringify(Object.assign({ program: "macar-talimat" }, veri));
      return dosyaYaz(dizin, DOSYA, metin).then(function () { sonYazma = simdiSaat(); hata = ""; return gunlukYedek(metin); });
    }).catch(function (er) {
      var ilk = durum !== "hata" && durum !== "izin";
      if (er && (er.name === "NotAllowedError" || er.name === "SecurityError")) { durum = "izin"; hata = ""; }
      else { durum = "hata"; hata = (er && er.message) || "yazılamadı"; }
      bekleyen = true;
      if (ilk) haber(durum === "izin" ? "Kayıt klasörüne erişim izni gerekiyor (sağ üstten izin verin)." : "DİKKAT: Klasöre yazılamadı — " + hata, "uyari");
    }).then(arayuz);
    return zincir;
  }
  // kaydet() her başarılı kayıttan sonra çağırır
  function yaz() {
    if (!destekli()) return;
    if (durum !== "acik") { bekleyen = true; arayuz(); return; }
    clearTimeout(zamanlayici);
    zamanlayici = setTimeout(simdiYaz, 250);
  }
  // Kayıt zamanı: hangi kopya daha yeni anlaşılsın. kaydet() tarayıcıya yazmadan önce çağırır.
  function damgala() { if (destekli() && typeof veri !== "undefined" && veri) veri.kz = Date.now(); }

  /* ---------- açılış ---------- */
  function hafizayaKoyVeYenile(v) {
    try { localStorage.setItem(typeof ANAHTAR !== "undefined" ? ANAHTAR : "macar-talimat-v1", JSON.stringify(v)); } catch (er) {}
    location.reload();
  }
  // true dönerse sayfa yenileniyor
  function karsilastir(d) {
    var yerelKz = (veri && veri.kz) || 0, s = sayi(veri), yerelBos = s.ilac === 0 && s.talimat === 0;
    if (!d) { simdiYaz(); return false; }
    var ds = sayi(d);
    if ((d.kz || 0) > yerelKz || (yerelBos && (ds.ilac || ds.talimat))) { hafizayaKoyVeYenile(d); return true; }
    if (yerelKz > (d.kz || 0)) simdiYaz();
    return false;
  }

  function baslat() {
    if (!destekli()) { durum = "desteksiz"; arayuz(); return Promise.resolve(); }
    return dbAl().then(function (h) {
      if (!h) { durum = "yok"; setTimeout(soruGoster, 900); return; }
      dizin = h;
      return izinVar(h, false).then(function (var_) {
        if (!var_) { durum = "izin"; setTimeout(izinGoster, 600); return; }
        durum = "acik";
        return dosyaOku(h).then(function (d) { karsilastir(d); })
          .catch(function (er) { durum = "hata"; hata = "Dosya okunamadı: " + ((er && er.message) || ""); });
      });
    }).catch(function () {}).then(arayuz);
  }

  /* ---------- kullanıcı işlemleri ---------- */
  function izinVer() {
    if (!dizin) return klasorSec();
    return izinVar(dizin, true).then(function (ok) {
      if (!ok) { haber("İzin verilmedi. Kayıtlar şimdilik yalnızca tarayıcıda tutuluyor.", "uyari"); return; }
      durum = "acik"; hata = ""; pencereKapat();
      return dosyaOku(dizin).then(function (d) {
        if (karsilastir(d)) return;
        if (bekleyen) simdiYaz();
        haber("Kayıt klasörü bağlandı: " + dizin.name, "tamam");
      }).catch(function (er) { durum = "hata"; hata = "Dosya okunamadı: " + ((er && er.message) || ""); });
    }).then(arayuz);
  }
  function klasorSec() {
    if (!destekli()) return Promise.resolve();
    var h;
    return window.showDirectoryPicker({ id: "macar-talimat-kayit", mode: "readwrite", startIn: "documents" }).then(function (x) {
      h = x; return izinVar(h, true);
    }).then(function (ok) {
      if (!ok) { haber("Klasöre yazma izni verilmedi.", "uyari"); return; }
      return dosyaOku(h).catch(function () { return "bozuk"; }).then(function (d) {
        var s = sayi(veri), yerelVar = s.ilac > 0 || s.talimat > 0;
        if (d === "bozuk") {
          if (!confirm("Seçilen klasördeki " + DOSYA + " okunamadı.\n\nÜstüne bu bilgisayardaki bilgiler yazılsın mı?")) return;
          d = null;
        }
        if (d) {
          var ds = sayi(d);
          var ayni = JSON.stringify([d.ilaclar, d.talimatlar]) === JSON.stringify([veri.ilaclar, veri.talimatlar]);
          if ((ds.ilac || ds.talimat) && yerelVar && !ayni) return secimGoster(h, d);
          return baglan(h, (ds.ilac || ds.talimat) && !yerelVar ? d : null);
        }
        return baglan(h, null);
      });
    }).catch(function (er) { if (er && er.name === "AbortError") return; haber("Klasör seçilemedi: " + ((er && er.message) || ""), "uyari"); });
  }
  function baglan(h, yukle) {
    return dbKoy(h).then(function () {
      dizin = h; durum = "acik"; hata = ""; yedekGunu = "";
      pencereKapat();
      if (yukle) { hafizayaKoyVeYenile(yukle); return; }
      damgala();
      try { localStorage.setItem(ANAHTAR, JSON.stringify(veri)); } catch (er) {}
      return simdiYaz().then(function () { haber("Bilgiler artık “" + h.name + "” klasörüne kaydediliyor", "tamam"); });
    });
  }

  /* ---------- pencereler ---------- */
  var secimBekleyen = null;
  var SVG_KLASOR = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M3 7.5A2.5 2.5 0 0 1 5.5 5H9l2 2.2h7.5A2.5 2.5 0 0 1 21 9.7v7.8a2.5 2.5 0 0 1-2.5 2.5h-13A2.5 2.5 0 0 1 3 17.5Z"/></svg>';
  function perde(html) {
    var p = document.getElementById("klsPerde");
    if (!p) {
      p = document.createElement("div"); p.id = "klsPerde"; p.className = "kls-perde no-print";
      p.setAttribute("role", "dialog"); p.setAttribute("aria-modal", "true");
      document.body.appendChild(p);
    }
    p.innerHTML = '<div class="kls-pencere">' + html + '</div>';
  }
  function pencereKapat() { var p = document.getElementById("klsPerde"); if (p) p.remove(); secimBekleyen = null; }
  function ust(b, a) {
    return '<button class="kls-kapat" data-kls="kapat" aria-label="Kapat">' + ikon("carpi") + '</button>' +
      '<div class="kls-ust"><div class="kls-logo">' + SVG_KLASOR + '</div><div><h2>' + b + '</h2>' + (a ? '<p>' + a + '</p>' : '') + '</div></div>';
  }
  function soruGoster() {
    if (durum !== "yok") return;
    try { if (localStorage.getItem(SONRA_ANAHTAR) === gun()) return; } catch (er) {}
    perde(ust("Bilgiler bir klasöre kaydedilsin", "Bir kere klasör seçin; her değişiklik o klasördeki dosyaya otomatik yazılsın.") +
      '<ol class="kls-adim">' +
        '<li><b>1</b><span>Aşağıdaki <strong>Klasör seç</strong>’e basın</span></li>' +
        '<li><b>2</b><span>Belgeler içinde <strong>Yeni klasör</strong> açın, adını <strong>Macar Talimat Kayıtlar</strong> koyup seçin</span></li>' +
        '<li><b>3</b><span>Edge izin sorarsa <strong>Düzenlemeye izin ver</strong> deyin</span></li>' +
      '</ol>' +
      '<div class="kls-not">' + ikon("bilgi") + '<span>Klasörde her zaman <b>' + DOSYA + '</b> (son hâl) ve <b>yedekler</b> klasörü (her güne bir kopya, son 60 gün) durur. İlaçlar, geçmiş talimatlar ve ayarlar içindedir. Tarayıcı verisi silinse bile bilgiler kaybolmaz.</span></div>' +
      '<div class="kls-alt"><button class="btn ikincil" data-kls="sonra">Sonra</button><button class="btn ana" data-kls="sec">' + ikon("klasor") + 'Klasör seç</button></div>');
  }
  function izinGoster() {
    if (durum !== "izin" || !dizin) return;
    perde(ust("Kayıt klasörüne erişim", "“" + e(dizin.name) + "” klasörüne kaydetmeye devam etmek için izin gerekiyor.") +
      '<div class="kls-not">' + ikon("bilgi") + '<span>Edge sorunca <b>“Her ziyarette izin ver”</b> seçeneğini seçerseniz bir daha sormaz.</span></div>' +
      '<div class="kls-alt"><button class="btn ikincil" data-kls="kapat">Şimdi değil</button><button class="btn ana" data-kls="izin">' + ikon("onay") + 'İzin ver</button></div>');
  }
  function secimGoster(h, d) {
    secimBekleyen = { h: h, d: d };
    var ds = sayi(d), ys = sayi(veri);
    perde(ust("Klasörde kayıt var", "“" + e(h.name) + "” klasöründe daha önce kaydedilmiş bilgiler bulundu.") +
      '<div class="kls-sayilar">' +
        '<div><b>' + ds.ilac + ' ilaç · ' + ds.talimat + ' talimat</b><small>klasördeki · ' + e(tarihSaat(d.kz)) + '</small></div>' +
        '<div><b>' + ys.ilac + ' ilaç · ' + ys.talimat + ' talimat</b><small>bu bilgisayardaki</small></div>' +
      '</div>' +
      '<div class="kls-radyo">' +
        '<label><input type="radio" name="klsSecim" value="dosya" checked><span><b>Klasördekini yükle</b><small>Bu bilgisayardaki bilgilerin yerine klasördekiler gelir.</small></span></label>' +
        '<label><input type="radio" name="klsSecim" value="yerel"><span><b>Bu bilgisayardakini klasöre yaz</b><small>Klasördeki eski dosyanın bir kopyası yedekler klasörüne konur, sonra üstüne yazılır.</small></span></label>' +
      '</div>' +
      '<div class="kls-alt"><button class="btn ikincil" data-kls="kapat">Vazgeç</button><button class="btn ana" data-kls="secimTamam">Devam</button></div>');
  }

  document.addEventListener("click", function (ev) {
    var t = ev.target.closest ? ev.target.closest("[data-kls]") : null;
    if (!t) return;
    var a = t.dataset.kls;
    if (a === "kapat") pencereKapat();
    else if (a === "sonra") { try { localStorage.setItem(SONRA_ANAHTAR, gun()); } catch (er) {} pencereKapat(); }
    else if (a === "sec") klasorSec();
    else if (a === "izin") izinVer();
    else if (a === "cip") {
      if (durum === "izin") izinVer();
      else if (durum === "yok" || durum === "hata") klasorSec();
      else if (typeof sekmeAc === "function") sekmeAc("ayarlar");
    }
    else if (a === "secimTamam" && secimBekleyen) {
      var s = secimBekleyen, m = document.querySelector('input[name="klsSecim"]:checked');
      if (m && m.value === "dosya") baglan(s.h, s.d);
      else {
        s.h.getDirectoryHandle(YEDEK_DIZIN, { create: true })
          .then(function (y) { return dosyaYaz(y, YEDEK_ON + "degistirilmeden-once-" + Date.now() + ".json", JSON.stringify(s.d)); })
          .catch(function () {}).then(function () { baglan(s.h, null); });
      }
    }
  });

  /* ---------- görünüm ---------- */
  function cipHTML() {
    if (durum === "acik" && !hata) return { s: "iyi", h: ikon("onay") + '<span>' + (sonYazma ? "Kaydedildi " + e(sonYazma) : "Klasöre kaydediliyor") + '</span>', t: "Klasör: " + (dizin ? dizin.name : "") };
    if (durum === "izin") return { s: "uyari", h: ikon("uyari") + '<span>Klasör izni gerekli</span>', t: "Tıklayıp izin verin" };
    if (durum === "hata" || (durum === "acik" && hata)) return { s: "uyari", h: ikon("uyari") + '<span>Klasöre yazılamadı</span>', t: hata };
    if (durum === "yok") return { s: "soluk", h: ikon("klasor") + '<span>Klasöre kaydet</span>', t: "Bilgiler şimdilik yalnızca tarayıcıda" };
    return null;
  }
  function ayarHTML() {
    if (durum === "desteksiz") return '<p class="aciklama">Bu tarayıcı klasöre kaydetmeyi desteklemiyor. Bilgiler tarayıcıda saklanıyor; arada bir yedek alın.</p>';
    if (durum === "acik" && dizin) {
      return '<div class="kls-yer">' + ikon("klasor") + '<b>' + e(dizin.name) + '</b></div>' +
        '<p class="aciklama">Her değişiklikte <b>' + DOSYA + '</b> güncellenir. Her gün <b>yedekler</b> klasörüne bir kopya alınır (son 60 gün).' +
        (sonYazma ? ' Son kayıt: <b>' + e(sonYazma) + '</b>.' : '') + (hata ? '<br><b style="color:var(--kirmizi)">Yazılamadı: ' + e(hata) + '</b>' : '') + '</p>' +
        '<div class="satir"><button class="btn ikincil" data-kls="sec">' + ikon("klasor") + 'Klasörü değiştir</button></div>';
    }
    if (durum === "izin") {
      return '<p class="aciklama">“' + e(dizin ? dizin.name : "") + '” klasörüne yazmak için izin gerekiyor. Şimdilik bilgiler tarayıcıda tutuluyor.</p>' +
        '<div class="satir"><button class="btn ana" data-kls="izin">' + ikon("onay") + 'İzin ver</button></div>';
    }
    return '<p class="aciklama">Bilgiler şu an yalnızca tarayıcıda duruyor. Bir klasör seçin; her değişiklik bilgisayardaki dosyaya da yazılsın, her gün yedek alınsın.</p>' +
      (hata ? '<p class="aciklama" style="color:var(--kirmizi)"><b>' + e(hata) + '</b></p>' : '') +
      '<div class="satir"><button class="btn ana" data-kls="sec">' + ikon("klasor") + 'Kayıt klasörü seç</button></div>';
  }
  function arayuz() {
    var c = document.getElementById("klsCip");
    if (c) {
      var x = cipHTML();
      if (!x) c.classList.add("gizli");
      else { c.classList.remove("gizli"); c.className = "kls-cip " + x.s; c.innerHTML = x.h; c.title = x.t || ""; }
    }
    var k = document.getElementById("klsAyar");
    if (k) k.innerHTML = ayarHTML();
  }

  window.KlasorKayit = {
    destekli: destekli, baslat: baslat, yaz: yaz, damgala: damgala, sec: klasorSec,
    _durum: function () { return { durum: durum, dizin: dizin, hata: hata, sonYazma: sonYazma, bekleyen: bekleyen }; }
  };
  baslat();
})();
