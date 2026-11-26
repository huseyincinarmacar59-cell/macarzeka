/* ============================================================
   Şifre kilidi (MacarZeka ve Macar Talimat ortak)
   ------------------------------------------------------------
   * Ayarlar'dan şifre konur. Program her açılışta şifre ister.
   * Belirli süre dokunulmazsa kendiliğinden kilitlenir.
   * Şifre düz yazı saklanmaz: PBKDF2-SHA256 (150.000 tur, tuzlu) özeti tutulur.
   * Yanlış denemelerde artan bekleme süresi vardır.
   * "Şifremi unuttum": cihaza özel kısa kod gösterilir; yönetim panelinden
     (ya da programı kuran kişiden) alınan açma koduyla şifre sıfırlanır.
     Açma kodu abonelik çekirdeğiyle (LisansCekirdek) üretilir/doğrulanır.
   ============================================================ */
(function () {
  "use strict";
  var TUR = 150000;
  var A = null;          // ayarlar: {uyg, ad, logo, oku(), yaz(v)}
  var kilitli = false, sonHareket = Date.now(), gorunum = "giris";
  var hatali = 0, bekleBitis = 0;
  try { hatali = +sessionStorage.getItem("klt-hatali") || 0; bekleBitis = +sessionStorage.getItem("klt-bekle") || 0; } catch (er) {}

  function destekli() { return !!(window.crypto && crypto.subtle && window.TextEncoder); }
  function e(s) { return String(s == null ? "" : s).replace(/[&<>"']/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]; }); }
  function ik(ad) { return '<svg class="ik" aria-hidden="true"><use href="#i-' + ad + '"/></svg>'; }
  function hex(b) { var a = new Uint8Array(b), s = ""; for (var i = 0; i < a.length; i++) s += (a[i] < 16 ? "0" : "") + a[i].toString(16); return s; }
  function hexB(h) { var o = new Uint8Array(h.length / 2); for (var i = 0; i < o.length; i++) o[i] = parseInt(h.substr(i * 2, 2), 16); return o; }
  function rast(n) { var a = new Uint8Array(n); crypto.getRandomValues(a); return hex(a); }
  function ayar() { var k = A && A.oku(); return k && k.h && k.s ? k : null; }
  function bildir(m) { if (A && A.bildir) A.bildir(m); }

  function ozet(sifre, tuz, tur) {
    return crypto.subtle.importKey("raw", new TextEncoder().encode(String(sifre).normalize("NFC")), "PBKDF2", false, ["deriveBits"])
      .then(function (k) { return crypto.subtle.deriveBits({ name: "PBKDF2", hash: "SHA-256", salt: hexB(tuz), iterations: tur || TUR }, k, 256); })
      .then(hex);
  }
  function esitMi(a, b) { if (a.length !== b.length) return false; var f = 0; for (var i = 0; i < a.length; i++) f |= a.charCodeAt(i) ^ b.charCodeAt(i); return f === 0; }
  function dogrula(sifre) {
    var k = ayar(); if (!k) return Promise.resolve(true);
    return ozet(sifre, k.s, k.t).then(function (h) { return esitMi(h, k.h); });
  }

  /* ---------- kilit ekranı ---------- */
  function perde() {
    var p = document.getElementById("kltPerde");
    if (!p) {
      p = document.createElement("div"); p.id = "kltPerde"; p.className = "klt-perde";
      p.setAttribute("role", "dialog"); p.setAttribute("aria-modal", "true"); p.setAttribute("aria-label", "Şifre");
      document.body.appendChild(p);
    }
    return p;
  }
  function arkayiKapat(v) {
    Array.prototype.forEach.call(document.body.children, function (c) {
      if (c.id === "kltPerde" || c.tagName === "SCRIPT") return;
      if (v) { c.setAttribute("data-klt-inert", "1"); c.inert = true; }
      else if (c.getAttribute("data-klt-inert")) { c.removeAttribute("data-klt-inert"); c.inert = false; }
    });
  }
  function kilitle() {
    var k = ayar(); if (!k) return;
    kilitli = true; gorunum = "giris";
    if (document.activeElement && document.activeElement.blur) document.activeElement.blur();
    try { document.querySelectorAll("dialog[open]").forEach(function (d) { d.close(); }); } catch (er) {}
    arkayiKapat(true);
    document.body.classList.add("klt-kilitli");
    ciz();
  }
  function ac() {
    kilitli = false; hatali = 0; bekleBitis = 0; kaydetDeneme();
    arkayiKapat(false);
    document.body.classList.remove("klt-kilitli");
    var p = document.getElementById("kltPerde");
    if (p) { p.classList.add("cikis"); setTimeout(function () { if (!kilitli && p.parentNode) p.remove(); }, 220); }
    sonHareket = Date.now();
    if (A && A.acildi) try { A.acildi(); } catch (er) {}
  }
  function kaydetDeneme() { try { sessionStorage.setItem("klt-hatali", hatali); sessionStorage.setItem("klt-bekle", bekleBitis); } catch (er) {} }
  function kalanBekleme() { return Math.max(0, Math.ceil((bekleBitis - Date.now()) / 1000)); }

  function ciz(hata) {
    var p = perde(), k = ayar(), pin = k && k.tur === "pin";
    var logo = A.logo ? '<img src="' + e(A.logo) + '" alt="" class="klt-logo">' : '<div class="klt-logo klt-logo-ik">' + ik("kilit") + '</div>';
    var h;
    if (gorunum === "unuttum") {
      h = logo + '<h1>Şifremi unuttum</h1>' +
        '<p class="klt-alt">Aşağıdaki kodu programı kuran kişiye gönderin. Size bir <b>açma kodu</b> verecek.</p>' +
        '<div class="klt-cihazkod">' + e(cihazKodu()) + '</div>' +
        '<input id="kltAcma" class="klt-girdi" placeholder="Açma kodu (ör. 482-K7M2-9XQ4)" autocomplete="off" spellcheck="false">' +
        '<div class="klt-hata" id="kltHata">' + (hata ? e(hata) : '') + '</div>' +
        '<button class="klt-btn" data-klt="acmaKodu">Şifreyi sıfırla</button>' +
        '<button class="klt-link" data-klt="geri">' + ik("geri") + 'Şifre ekranına dön</button>';
    } else {
      var kalan = kalanBekleme();
      h = logo + '<h1>' + e(A.ad) + '</h1>' +
        '<p class="klt-alt">' + ik("kilit") + 'Program kilitli. Devam etmek için ' + (pin ? 'PIN’i' : 'şifreyi') + ' girin.</p>' +
        '<form class="klt-form" data-klt-form="1" autocomplete="off">' +
          '<input id="kltSifre" class="klt-girdi' + (pin ? ' pin' : '') + '" type="password" ' + (pin ? 'inputmode="numeric" pattern="[0-9]*" ' : '') +
            'placeholder="' + (pin ? 'PIN' : 'Şifre') + '" autocomplete="current-password"' + (kalan ? ' disabled' : '') + '>' +
          '<button class="klt-btn" type="submit"' + (kalan ? ' disabled' : '') + '>' + ik("onay") + 'Aç</button>' +
        '</form>' +
        '<div class="klt-hata" id="kltHata">' + (kalan ? 'Çok fazla yanlış deneme. <b id="kltSayac">' + kalan + '</b> saniye bekleyin.' : (hata ? e(hata) : '')) + '</div>' +
        '<button class="klt-link" data-klt="unuttum">Şifremi unuttum</button>';
    }
    p.innerHTML = '<div class="klt-kart">' + h + '</div>';
    var g = p.querySelector("#kltSifre:not([disabled]), #kltAcma");
    if (g) setTimeout(function () { g.focus(); }, 40);
    if (hata) { var kart = p.querySelector(".klt-kart"); kart.classList.remove("salla"); void kart.offsetWidth; kart.classList.add("salla"); }
  }
  function cihazKodu() { var k = ayar(); return (A.uyg || "MZ") + "-" + (k ? k.no : "000"); }

  function sifreDene() {
    var i = document.getElementById("kltSifre"); if (!i || kalanBekleme()) return;
    var v = i.value; if (!v) return;
    i.disabled = true;
    dogrula(v).then(function (ok) {
      if (ok) { ac(); return; }
      hatali++;
      if (hatali >= 5) bekleBitis = Date.now() + Math.min(15 * 60, 30 * Math.pow(2, hatali - 5)) * 1000;
      kaydetDeneme();
      ciz(hatali >= 5 ? "" : "Yanlış " + (ayar().tur === "pin" ? "PIN" : "şifre") + "." + (hatali >= 3 ? " (" + (5 - hatali) + " deneme sonra bekleme başlar)" : ""));
    });
  }
  function acmaKoduDene() {
    var i = document.getElementById("kltAcma"); if (!i) return;
    var k = ayar(), C = window.LisansCekirdek, gizli = window.LISANS_AYAR && window.LISANS_AYAR.gizli;
    if (!k || !C || !gizli) { ciz("Açma kodu bu kurulumda kullanılamıyor."); return; }
    var dogru = C.kodUret(gizli, A.uyg, k.no, "KILIT").replace(/[^0-9A-Z]/g, "");
    var girilen = String(i.value || "").toLocaleUpperCase("en").replace(/[^0-9A-Z]/g, "");
    if (girilen && girilen === dogru) {
      A.yaz(null);
      ac();
      bildir("Şifre sıfırlandı. Ayarlar’dan yeni şifre koyabilirsiniz.");
      setTimeout(function () { pencereAc("koy"); }, 400);
    } else { gorunum = "unuttum"; ciz("Açma kodu geçersiz. Kodu doğru yazdığınızdan emin olun."); }
  }

  /* ---------- ayarlar penceresi ---------- */
  var SURELER = [[0, "Hiç (sadece açılışta sorsun)"], [5, "5 dakika"], [10, "10 dakika"], [30, "30 dakika"], [60, "1 saat"]];
  function pencereAc(tip) {
    var k = ayar(), h;
    var sureSec = function (secili) {
      return '<label class="klt-etiket">Dokunulmazsa kilitlensin</label><select id="kltSure" class="klt-girdi">' +
        SURELER.map(function (s) { return '<option value="' + s[0] + '"' + (s[0] === secili ? ' selected' : '') + '>' + s[1] + '</option>'; }).join("") + '</select>';
    };
    if (tip === "koy" || tip === "degistir") {
      h = '<h2>' + (tip === "koy" ? "Şifre koy" : "Şifreyi değiştir") + '</h2>' +
        '<p class="klt-alt">Program her açılışta bu şifreyi soracak.</p>' +
        (tip === "degistir" ? '<label class="klt-etiket">Şu anki şifre</label><input id="kltEski" class="klt-girdi" type="password" autocomplete="current-password">' : '') +
        '<div class="klt-tur"><label><input type="radio" name="kltTur" value="pin"' + (!k || k.tur === "pin" ? ' checked' : '') + '><span><b>PIN</b><small>4-8 rakam</small></span></label>' +
        '<label><input type="radio" name="kltTur" value="sifre"' + (k && k.tur === "sifre" ? ' checked' : '') + '><span><b>Şifre</b><small>harf ve rakam</small></span></label></div>' +
        '<label class="klt-etiket">Yeni ' + 'şifre / PIN</label><input id="kltYeni1" class="klt-girdi" type="password" autocomplete="new-password">' +
        '<label class="klt-etiket">Tekrar</label><input id="kltYeni2" class="klt-girdi" type="password" autocomplete="new-password">' +
        sureSec(k ? k.sure : 10) +
        '<div class="klt-not">' + ik("bilgi") + '<span>Unutursanız şifre ekranındaki <b>Şifremi unuttum</b> ile açma kodu alınır. Kayıtlar silinmez.</span></div>' +
        '<div class="klt-hata" id="kltPHata"></div>' +
        '<div class="klt-alt-btn"><button class="btn-klt ikinci" data-klt="kapat">Vazgeç</button><button class="btn-klt" data-klt="kaydet" data-tip="' + tip + '">Kaydet</button></div>';
    } else if (tip === "kaldir") {
      h = '<h2>Şifreyi kaldır</h2><p class="klt-alt">Program artık şifre sormadan açılacak.</p>' +
        '<label class="klt-etiket">Şu anki şifre</label><input id="kltEski" class="klt-girdi" type="password" autocomplete="current-password">' +
        '<div class="klt-hata" id="kltPHata"></div>' +
        '<div class="klt-alt-btn"><button class="btn-klt ikinci" data-klt="kapat">Vazgeç</button><button class="btn-klt tehlike" data-klt="kaldirOnay">Şifreyi kaldır</button></div>';
    }
    var p = document.getElementById("kltPencere");
    if (!p) { p = document.createElement("div"); p.id = "kltPencere"; p.className = "klt-pencere-perde"; document.body.appendChild(p); }
    p.innerHTML = '<div class="klt-pencere"><button class="klt-kapat" data-klt="kapat" aria-label="Kapat">' + ik("carpi") + '</button>' + h + '</div>';
    var ilk = p.querySelector("input[type=password]"); if (ilk) setTimeout(function () { ilk.focus(); }, 40);
  }
  function pencereKapat() { var p = document.getElementById("kltPencere"); if (p) p.remove(); }
  function pHata(m) { var x = document.getElementById("kltPHata"); if (x) x.textContent = m; }

  function kaydetSifre(tip) {
    var tur = (document.querySelector('input[name="kltTur"]:checked') || {}).value || "pin";
    var a = document.getElementById("kltYeni1").value, b = document.getElementById("kltYeni2").value;
    var sure = +document.getElementById("kltSure").value;
    if (tur === "pin" && !/^\d{4,8}$/.test(a)) { pHata("PIN 4-8 rakamdan oluşmalı."); return; }
    if (tur === "sifre" && a.length < 4) { pHata("Şifre en az 4 karakter olsun."); return; }
    if (a !== b) { pHata("İki yazdığınız aynı değil."); return; }
    var once = tip === "degistir" ? dogrula(document.getElementById("kltEski").value) : Promise.resolve(true);
    once.then(function (ok) {
      if (!ok) { pHata("Şu anki şifre yanlış."); return; }
      var eski = ayar(), tuz = rast(16);
      return ozet(a, tuz, TUR).then(function (h) {
        var no = eski && eski.no ? eski.no : String(100 + (crypto.getRandomValues(new Uint32Array(1))[0] % 900));
        A.yaz({ tur: tur, s: tuz, h: h, t: TUR, sure: sure, no: no });
        pencereKapat(); ayarYenile();
        bildir(tip === "koy" ? "Şifre konuldu. Program açılışta şifre soracak." : "Şifre değiştirildi.");
      });
    });
  }
  function kaldir() {
    dogrula(document.getElementById("kltEski").value).then(function (ok) {
      if (!ok) { pHata("Şifre yanlış."); return; }
      A.yaz(null); pencereKapat(); ayarYenile(); bildir("Şifre kaldırıldı.");
    });
  }
  function sureDegis(v) { var k = ayar(); if (!k) return; k.sure = +v; A.yaz(k); ayarYenile(); bildir("Kaydedildi."); }

  /* ---------- ayarlar kartı ---------- */
  function ayarHTML() {
    if (!destekli()) return '<p class="klt-aciklama">Bu tarayıcı şifre özelliğini desteklemiyor.</p>';
    var k = ayar();
    if (!k) return '<p class="klt-aciklama">Program şifresiz açılıyor. Şifre koyarsanız her açılışta ve uzun süre dokunulmayınca şifre sorar.</p>' +
      '<div class="klt-satir"><button class="' + (A.btnAna || "btn") + '" data-klt="koy">' + ik("kilit") + 'Şifre koy</button></div>';
    var s = SURELER.filter(function (x) { return x[0] === k.sure; })[0];
    return '<p class="klt-aciklama"><b>' + ik("onay") + (k.tur === "pin" ? "PIN" : "Şifre") + ' açık.</b> Açılışta soruyor' + (k.sure ? ', ' + (s ? s[1] : k.sure + ' dakika') + ' dokunulmazsa kilitleniyor.' : '.') + '</p>' +
      '<label class="klt-etiket">Dokunulmazsa kilitlensin</label><select class="klt-girdi" data-klt-sure="1" style="margin-bottom:12px">' +
        SURELER.map(function (x) { return '<option value="' + x[0] + '"' + (x[0] === k.sure ? ' selected' : '') + '>' + x[1] + '</option>'; }).join("") + '</select>' +
      '<div class="klt-satir">' +
        '<button class="' + (A.btnAna || "btn") + '" data-klt="simdi">' + ik("kilit") + 'Şimdi kilitle</button>' +
        '<button class="' + (A.btnIkinci || "btn btn2") + '" data-klt="degistir">Şifreyi değiştir</button>' +
        '<button class="' + (A.btnTehlike || "btn btn2 btn-dan") + '" data-klt="kaldir">Kaldır</button>' +
      '</div>';
  }
  function ayarYenile() {
    var x = document.getElementById("kltAyar"); if (x) x.innerHTML = ayarHTML();
    var b = document.getElementById("kltHizli"); if (b) b.hidden = !ayar();
  }

  /* ---------- olaylar ---------- */
  document.addEventListener("click", function (ev) {
    var t = ev.target.closest ? ev.target.closest("[data-klt]") : null;
    if (!t) return;
    var a = t.dataset.klt;
    if (a === "unuttum") { gorunum = "unuttum"; ciz(); }
    else if (a === "geri") { gorunum = "giris"; ciz(); }
    else if (a === "acmaKodu") acmaKoduDene();
    else if (a === "koy") pencereAc("koy");
    else if (a === "degistir") pencereAc("degistir");
    else if (a === "kaldir") pencereAc("kaldir");
    else if (a === "kapat") pencereKapat();
    else if (a === "kaydet") kaydetSifre(t.dataset.tip);
    else if (a === "kaldirOnay") kaldir();
    else if (a === "simdi") kilitle();
  });
  document.addEventListener("submit", function (ev) {
    if (ev.target && ev.target.dataset && ev.target.dataset.kltForm) { ev.preventDefault(); sifreDene(); }
  });
  document.addEventListener("change", function (ev) {
    if (ev.target && ev.target.dataset && ev.target.dataset.kltSure) sureDegis(ev.target.value);
  });
  document.addEventListener("keydown", function (ev) {
    if (ev.key === "Enter" && ev.target && ev.target.id === "kltAcma") { ev.preventDefault(); acmaKoduDene(); }
    if (ev.key === "Enter" && ev.target && /^kltYeni2$|^kltEski$/.test(ev.target.id)) {
      var b = document.querySelector('[data-klt="kaydet"],[data-klt="kaldirOnay"]'); if (b) { ev.preventDefault(); b.click(); }
    }
    if (ev.key === "Escape" && document.getElementById("kltPencere")) pencereKapat();
  });
  ["mousemove", "mousedown", "keydown", "touchstart", "wheel", "scroll"].forEach(function (o) {
    window.addEventListener(o, function () { if (!kilitli) sonHareket = Date.now(); }, { passive: true, capture: true });
  });
  setInterval(function () {
    if (kilitli) {
      var s = document.getElementById("kltSayac");
      if (s) { var k = kalanBekleme(); if (k > 0) s.textContent = k; else ciz(); }
      return;
    }
    var a = ayar();
    if (a && a.sure > 0 && Date.now() - sonHareket > a.sure * 60000) kilitle();
  }, 1000);

  window.Kilit = {
    kur: function (o) { A = o; },
    baslat: function () { if (!destekli() || !A) return; ayarYenile(); if (ayar()) kilitle(); },
    kilitliMi: function () { return kilitli; },
    kilitle: kilitle,
    ayarHTML: function () { return A ? ayarHTML() : ""; },
    ayarYenile: ayarYenile,
    destekli: destekli
  };
})();
