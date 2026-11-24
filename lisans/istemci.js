/* ============================================================
   Abonelik denetimi — uygulama tarafı
   Kurallar (Hüseyin Abi ile kararlaştırıldı):
   - Ödeme günü her ayın 1'i.
   - 1-5 gün gecikme: üstte küçük, kapatılabilir şerit.
   - 6+ gün gecikme: günde bir kez, "Tamam" ile kapanan uyarı penceresi.
   - Uygulama kendi kendine ASLA kilitlenmez. Tam kapatma yalnızca
     Hüseyin Abi'nin panelden ürettiği kapatma kodu girilince olur.
   - Hata olursa uygulamayı asla bozmaz (her şey try/catch içinde).
   ============================================================ */
(function () {
  "use strict";
  var C = window.LisansCekirdek;
  if (!C) return;

  var AY_ADLARI = ["Ocak","Şubat","Mart","Nisan","Mayıs","Haziran","Temmuz","Ağustos","Eylül","Ekim","Kasım","Aralık"];
  var ayar = null, gizli = "", durumVeri = null, depo = null, seritKapandi = false, kuruldu = false;

  function ayAdi(a) { var p = a.split("-"); return AY_ADLARI[+p[1] - 1] + " " + p[0]; }
  function tarihStr(d) { return d.getFullYear() + "-" + String(d.getMonth() + 1).padStart(2, "0") + "-" + String(d.getDate()).padStart(2, "0"); }
  function esc(s) { return String(s == null ? "" : s).replace(/[&<>"']/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]; }); }
  function coz(s) { // hafif gizleme
    var m = "macar-abonelik", o = "";
    for (var i = 0; i < s.length; i += 2) o += ("0" + (parseInt(s.substr(i, 2), 16) ^ m.charCodeAt((i / 2) % m.length)).toString(16)).slice(-2);
    return o;
  }

  /* ---------- kayıt ---------- */
  function yerelDepo(anahtar) {
    return {
      oku: function () { try { return JSON.parse(localStorage.getItem(anahtar) || "null"); } catch (e) { return null; } },
      yaz: function (v) { try { localStorage.setItem(anahtar, JSON.stringify(v)); } catch (e) {} }
    };
  }
  function oku() {
    var v = null;
    try { v = depo.oku(); v = v ? JSON.parse(JSON.stringify(v)) : null; } catch (e) { v = null; } // kopya: depodaki nesneyi yerinde değiştirme
    if (!v || typeof v !== "object") v = {};
    if (!Array.isArray(v.odenen)) v.odenen = [];
    return v;
  }
  function yaz(v) { try { depo.yaz(v); } catch (e) {} }

  /* ---------- hesap ---------- */
  function simdi(v) {
    var d = new Date(), bugun = tarihStr(d);
    // Saati geri alarak kaçmayı engelle: görülen en ileri tarihten geri gitme
    if (v.enGec && v.enGec > bugun) { var p = v.enGec.split("-"); d = new Date(+p[0], +p[1] - 1, +p[2], 12); }
    return d;
  }
  function hesapla() {
    var v = oku(), degisti = false, d = simdi(v), bugun = tarihStr(d);
    if (!v.kurulum) { v.kurulum = bugun.slice(0, 7); degisti = true; }
    if (!v.enGec || v.enGec < bugun) { v.enGec = bugun; degisti = true; }
    if (degisti) yaz(v);

    var s = { veri: v, bugun: bugun, tur: "ok", gecikme: 0, odenmemis: [] };
    if (v.kapali) { s.tur = "kapali"; return s; }
    if (v.suresiz) { s.tur = "suresiz"; return s; }

    var p = v.kurulum.split("-"), buAy = bugun.slice(0, 7);
    var ay = C.ayAnahtar(+p[0], +p[1]); // kurulumdan sonraki ay ilk ödeme ayı
    var guvenlik = 0;
    while (ay <= buAy && guvenlik++ < 240) {
      if (v.odenen.indexOf(ay) < 0) s.odenmemis.push(ay);
      var q = ay.split("-"); ay = C.ayAnahtar(+q[0], +q[1]);
    }
    if (!s.odenmemis.length) return s;
    var ilk = s.odenmemis[0].split("-");
    var basla = new Date(+ilk[0], +ilk[1] - 1, 1);
    var bugunGece = new Date(d.getFullYear(), d.getMonth(), d.getDate());
    s.gecikme = Math.round((bugunGece - basla) / 86400000);
    if (s.gecikme >= 6) s.tur = "pencere";
    else if (s.gecikme >= 1) s.tur = "serit";
    return s;
  }
  function odenenSon(v) {
    var l = v.odenen.slice().sort();
    return l.length ? l[l.length - 1] : null;
  }

  /* ---------- kod girişi ---------- */
  function kodGir(metin) {
    var r = C.kodCoz(gizli, ayar.uyg, metin, simdi(oku()));
    if (!r.ok) return r;
    var v = oku();
    v.no = r.no;
    if (r.tur === "abonelik") {
      r.aylar.forEach(function (a) { if (v.odenen.indexOf(a) < 0) v.odenen.push(a); });
      v.odenen.sort();
      if (v.kapali) { r.mesaj = "Ödeme kaydedildi. Uygulama kapalı olduğu için açma kodu da gerekiyor."; }
      else r.mesaj = r.aylar.length === 1 ? ayAdi(r.aylar[0]) + " ödemesi onaylandı. Teşekkürler!" : ayAdi(r.aylar[0]) + " – " + ayAdi(r.aylar[r.aylar.length - 1]) + " ödemesi onaylandı. Teşekkürler!";
    } else if (r.tur === "suresiz") { v.suresiz = true; r.mesaj = "Süresiz kullanım açıldı. Teşekkürler!"; }
    else if (r.tur === "kapat") { v.kapali = true; r.mesaj = "Uygulama kapatıldı."; }
    else if (r.tur === "ac") { v.kapali = false; r.mesaj = "Uygulama yeniden açıldı."; }
    yaz(v);
    seritKapandi = false;
    setTimeout(guncelle, 0);
    return r;
  }

  /* ---------- görünüm ---------- */
  var CSS = "" +
    ".lsn-kok,.lsn-kok *{box-sizing:border-box;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,'Helvetica Neue',Arial,sans-serif;letter-spacing:normal;text-transform:none}" +
    ".lsn-serit{position:fixed;left:50%;transform:translateX(-50%);top:calc(env(safe-area-inset-top,0px) + 10px);z-index:2147483600;display:flex;align-items:center;gap:10px;max-width:calc(100vw - 20px);background:#fff8e6;color:#6b4b00;border:1px solid #f1d38a;border-radius:999px;padding:7px 8px 7px 14px;font-size:13.5px;line-height:1.3;box-shadow:0 6px 24px rgba(0,0,0,.12);animation:lsnIn .35s ease}" +
    ".lsn-serit b{font-weight:650}" +
    ".lsn-serit .lsn-yazi{white-space:nowrap;overflow:hidden;text-overflow:ellipsis;min-width:0}.lsn-serit button{flex:none}" +
    ".lsn-serit button{border:0;cursor:pointer;font-size:13px;border-radius:999px;padding:6px 12px;font-weight:600}" +
    ".lsn-serit .lsn-git{background:#6b4b00;color:#fff}" +
    ".lsn-serit .lsn-x{background:transparent;color:#8a6a1f;padding:6px 8px;font-size:16px;line-height:1}" +
    ".lsn-ort{position:fixed;inset:0;z-index:2147483640;background:rgba(15,23,42,.55);backdrop-filter:blur(3px);-webkit-backdrop-filter:blur(3px);display:flex;align-items:center;justify-content:center;padding:18px;animation:lsnF .2s ease}" +
    ".lsn-ort.lsn-kilit{background:linear-gradient(160deg,#0f172a,#1e293b);backdrop-filter:none}" +
    ".lsn-kart{width:100%;max-width:400px;background:#fff;color:#0f172a;border-radius:20px;padding:24px 22px 20px;box-shadow:0 24px 60px rgba(0,0,0,.3);animation:lsnUp .3s ease}" +
    ".lsn-ikon{width:52px;height:52px;border-radius:16px;display:flex;align-items:center;justify-content:center;font-size:26px;margin-bottom:14px;background:#fef3c7}" +
    ".lsn-ikon{color:#a16207}.lsn-ikon svg{width:26px;height:26px}.lsn-ikon.lsn-yesil{background:#dcfce7;color:#15803d}.lsn-ikon.lsn-kirmizi{background:#fee2e2;color:#b91c1c}.lsn-ikon.lsn-mavi{background:#e0e7ff;color:#4338ca}" +
    ".lsn-kart h3{margin:0 0 6px;font-size:19px;font-weight:700;color:#0f172a}" +
    ".lsn-kart p{margin:0 0 14px;font-size:14.5px;line-height:1.5;color:#475569}" +
    ".lsn-durum{display:flex;justify-content:space-between;gap:10px;background:#f8fafc;border:1px solid #e2e8f0;border-radius:12px;padding:10px 12px;font-size:13.5px;color:#334155;margin-bottom:14px}" +
    ".lsn-durum span:last-child{font-weight:650;color:#0f172a;text-align:right}" +
    ".lsn-giris{width:100%;font-size:18px;letter-spacing:2px;text-align:center;text-transform:uppercase;padding:12px;border:1.5px solid #cbd5e1;border-radius:12px;outline:none;background:#fff;color:#0f172a;font-family:ui-monospace,SFMono-Regular,Menlo,Consolas,monospace!important}" +
    ".lsn-giris:focus{border-color:#2563eb;box-shadow:0 0 0 4px rgba(37,99,235,.15)}" +
    ".lsn-ileti{min-height:20px;font-size:13px;margin:8px 2px 4px;color:#64748b}" +
    ".lsn-ileti.lsn-hata{color:#dc2626}.lsn-ileti.lsn-tamam{color:#16a34a}" +
    ".lsn-dugmeler{display:flex;gap:10px;margin-top:10px}" +
    ".lsn-dugmeler button{flex:1;border:0;border-radius:12px;padding:12px;font-size:15px;font-weight:650;cursor:pointer}" +
    ".lsn-ana{background:#2563eb;color:#fff}.lsn-ana:active{background:#1d4ed8}" +
    ".lsn-ikinci{background:#f1f5f9;color:#334155}" +
    ".lsn-alt{margin-top:14px;font-size:12px;color:#94a3b8;text-align:center}" +
    "@keyframes lsnIn{from{opacity:0;transform:translate(-50%,-8px)}to{opacity:1;transform:translate(-50%,0)}}" +
    "@keyframes lsnF{from{opacity:0}to{opacity:1}}" +
    "@keyframes lsnUp{from{opacity:0;transform:translateY(12px)}to{opacity:1;transform:none}}" +
    "@media print{.lsn-kok{display:none!important}}";

  function cssEkle() {
    if (document.getElementById("lsn-css")) return;
    var st = document.createElement("style"); st.id = "lsn-css"; st.textContent = CSS;
    (document.head || document.documentElement).appendChild(st);
  }
  function kaldir(id) { var e = document.getElementById(id); if (e) e.remove(); }
  function ekle(html) {
    var d = document.createElement("div"); d.innerHTML = html.trim();
    var e = d.firstChild; document.body.appendChild(e); return e;
  }

  function seritGoster(s) {
    if (document.getElementById("lsn-serit") || seritKapandi) return;
    var e = ekle('<div id="lsn-serit" class="lsn-kok lsn-serit" role="status">' +
      '<span class="lsn-yazi">⏳ <b>' + esc(AY_ADLARI[+s.odenmemis[0].split("-")[1] - 1]) + '</b> ödemesi bekleniyor</span>' +
      '<button class="lsn-git">Kodu gir</button><button class="lsn-x" aria-label="Kapat">×</button></div>');
    e.querySelector(".lsn-git").onclick = function () { pencereAc("kod"); };
    e.querySelector(".lsn-x").onclick = function () { seritKapandi = true; kaldir("lsn-serit"); };
  }

  function kodAlani(odak) {
    return '<input class="lsn-giris" id="lsn-kod" placeholder="000-XXXX-XXXX" autocomplete="off" autocapitalize="characters" spellcheck="false" maxlength="16">' +
      '<div class="lsn-ileti" id="lsn-ileti"></div>';
  }
  function kodBagla(kart, kapat, kilitli) {
    var g = kart.querySelector("#lsn-kod"), il = kart.querySelector("#lsn-ileti"), bt = kart.querySelector(".lsn-ana");
    function gonder() {
      var r = kodGir(g.value);
      if (!r.ok) { il.className = "lsn-ileti lsn-hata"; il.textContent = r.hata; g.focus(); return; }
      if (kilitli && r.tur !== "ac") { il.className = "lsn-ileti lsn-hata"; il.textContent = r.tur === "abonelik" ? r.mesaj : "Bu kod uygulamayı açmaz. Açma kodu gerekiyor."; return; }
      il.className = "lsn-ileti lsn-tamam"; il.textContent = r.mesaj;
      g.disabled = true; bt.disabled = true;
      setTimeout(kapat, 1400);
    }
    bt.onclick = gonder;
    g.addEventListener("keydown", function (e) { if (e.key === "Enter") gonder(); });
    g.addEventListener("input", function () { il.className = "lsn-ileti"; il.textContent = ""; });
    setTimeout(function () { try { g.focus({ preventScroll: true }); } catch (e) {} }, 250);
  }

  function pencereAc(neden) {
    if (document.getElementById("lsn-pencere")) return;
    var s = hesapla();
    if (s.tur === "kapali") { kilitGoster(); return; }
    var v = s.veri, son = odenenSon(v);
    var ikon = "<svg viewBox='0 0 24 24' fill='none' stroke='currentColor' stroke-width='1.9' stroke-linecap='round' stroke-linejoin='round' aria-hidden='true'><circle cx='7.5' cy='15.5' r='4.5'/><path d='m10.7 12.3 9.3-9.3'/><path d='m16.5 6.5 3 3'/><path d='m14 9 2 2'/></svg>", ikonSinif = "lsn-mavi", baslik = "Abonelik", metin = "", durumSatir = "";

    if (s.tur === "suresiz") {
      ikon = "<svg viewBox='0 0 24 24' fill='none' stroke='currentColor' stroke-width='1.9' stroke-linecap='round' stroke-linejoin='round' aria-hidden='true'><circle cx='12' cy='12' r='9'/><path d='m8.3 12.2 2.6 2.6 4.9-5.4'/></svg>"; ikonSinif = "lsn-yesil"; baslik = "Abonelik aktif";
      metin = "Bu uygulama süresiz kullanıma açık.";
    } else if (s.odenmemis.length && s.gecikme >= 1) {
      ikon = "<svg viewBox='0 0 24 24' fill='none' stroke='currentColor' stroke-width='1.9' stroke-linecap='round' stroke-linejoin='round' aria-hidden='true'><circle cx='12' cy='12' r='9'/><path d='M12 7.5V12l3 2'/></svg>"; ikonSinif = ""; baslik = "Abonelik ödemesi bekleniyor";
      metin = (s.odenmemis.length > 1 ? s.odenmemis.length + " aylık ödeme bekleniyor (" + esc(ayAdi(s.odenmemis[0])) + "'dan beri). " : esc(ayAdi(s.odenmemis[0])) + " ödemesi " + s.gecikme + " gündür bekleniyor. ") +
        "Ödemeyi yaptıysanız size verilen kodu aşağıya girin.";
    } else {
      ikon = "<svg viewBox='0 0 24 24' fill='none' stroke='currentColor' stroke-width='1.9' stroke-linecap='round' stroke-linejoin='round' aria-hidden='true'><circle cx='12' cy='12' r='9'/><path d='m8.3 12.2 2.6 2.6 4.9-5.4'/></svg>"; ikonSinif = "lsn-yesil"; baslik = "Abonelik aktif";
      metin = "Yeni bir ödeme kodu aldıysanız aşağıya girebilirsiniz.";
    }
    durumSatir = '<div class="lsn-durum"><span>Ödenen son ay</span><span>' + (v.suresiz ? "Süresiz" : son ? esc(ayAdi(son)) : "—") + '</span></div>';
    if (v.no) durumSatir += '<div class="lsn-durum"><span>Müşteri no</span><span>' + esc(v.no) + '</span></div>';

    var e = ekle('<div id="lsn-pencere" class="lsn-kok lsn-ort" role="dialog" aria-modal="true"><div class="lsn-kart">' +
      '<div class="lsn-ikon ' + ikonSinif + '">' + ikon + '</div><h3>' + baslik + '</h3><p>' + metin + '</p>' + durumSatir +
      (s.tur === "suresiz" ? "" : kodAlani()) +
      '<div class="lsn-dugmeler">' + (s.tur === "suresiz" ? "" : '<button class="lsn-ana">Kodu onayla</button>') +
      '<button class="lsn-ikinci">' + (neden === "otomatik" ? "Tamam" : "Kapat") + '</button></div>' +
      '<div class="lsn-alt">' + esc(ayar.ad) + ' · Abonelik</div></div></div>');
    function kapat() { kaldir("lsn-pencere"); guncelle(); }
    e.querySelector(".lsn-ikinci").onclick = kapat;
    e.addEventListener("click", function (ev) { if (ev.target === e) kapat(); });
    if (s.tur !== "suresiz") kodBagla(e, kapat, false);
  }

  function kilitGoster() {
    kaldir("lsn-serit"); kaldir("lsn-pencere");
    if (document.getElementById("lsn-kilit")) return;
    var e = ekle('<div id="lsn-kilit" class="lsn-kok lsn-ort lsn-kilit" role="dialog" aria-modal="true"><div class="lsn-kart">' +
      '<div class="lsn-ikon lsn-kirmizi"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="4" y="11" width="16" height="10" rx="2.5"/><path d="M8 11V7.5a4 4 0 0 1 8 0V11"/></svg></div><h3>Uygulama kapatıldı</h3>' +
      '<p>' + esc(ayar.ad) + ' şu anda kullanıma kapalı. Yeniden açmak için uygulama sahibiyle görüşüp size verilen açma kodunu girin.</p>' +
      kodAlani() + '<div class="lsn-dugmeler"><button class="lsn-ana">Uygulamayı aç</button></div>' +
      '<div class="lsn-alt">Kayıtlarınız silinmedi, açıldığında olduğu gibi duruyor.</div></div></div>');
    kodBagla(e, function () { kaldir("lsn-kilit"); guncelle(); }, true);
  }

  function guncelle() {
    try {
      if (!document.body) return;
      cssEkle();
      var s = hesapla();
      if (s.tur === "kapali") { kilitGoster(); return; }
      kaldir("lsn-kilit");
      if (s.tur === "serit") { seritGoster(s); return; }
      kaldir("lsn-serit");
      if (s.tur === "pencere") {
        var v = s.veri;
        if (v.sonPencere !== s.bugun && !document.getElementById("lsn-pencere")) {
          v.sonPencere = s.bugun; yaz(v);
          setTimeout(function () { pencereAc("otomatik"); }, 1200);
        }
      }
    } catch (e) { try { console.warn("abonelik:", e); } catch (x) {} }
  }

  /* ---------- dışa açık ---------- */
  window.Lisans = {
    kur: function (a) {
      try {
        a = a || {};
        var temel = window.LISANS_AYAR || {};
        ayar = { uyg: a.uyg || temel.uyg, ad: a.ad || temel.ad || "Uygulama" };
        gizli = coz(a.gizli || temel.gizli || "");
        depo = a.depo || yerelDepo("abonelik_" + ayar.uyg);
        if (!kuruldu) {
          kuruldu = true;
          setInterval(guncelle, 30 * 60 * 1000);
          document.addEventListener("visibilitychange", function () { if (!document.hidden) guncelle(); });
        }
        guncelle();
      } catch (e) { try { console.warn("abonelik:", e); } catch (x) {} }
    },
    ac: function () { try { cssEkle(); pencereAc("elle"); } catch (e) {} },
    durum: function () { try { return hesapla(); } catch (e) { return null; } },
    _kodGir: kodGir
  };

  var A = window.LISANS_AYAR;
  if (A && A.otomatik !== false) {
    if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", function () { window.Lisans.kur(); });
    else window.Lisans.kur();
  }
})();
