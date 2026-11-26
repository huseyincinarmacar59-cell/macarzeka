/* Macar Talimat — ilaç kullanım talimatı programı */
"use strict";

const SURUM = "1.9.0";
const ANAHTAR = "macar-talimat-v1";
const ESKI_ANAHTAR = ["macar", "rec" + "ete-v1"].join("-"); // eski sürümden veri taşıma

const VARSAYILAN_UYARI = [
  "İlacı kullanmadan önce etiketini mutlaka okuyun; etiketteki doza uyun.",
  "İlaçlama yaparken eldiven, maske, gözlük ve uzun kollu kıyafet giyin.",
  "Rüzgârlı, yağmurlu ve çok sıcak havada ilaçlama yapmayın.",
  "Arıların uçtuğu saatlerde ve çiçeklenme döneminde dikkatli olun.",
  "Boş ambalajları yakmayın, suya atmayın; toplama noktasına bırakın.",
  "İlaçları çocukların ulaşamayacağı serin bir yerde saklayın.",
  "Hasada kalan süreye uyun.",
  "Sorunuz olursa bizi arayın."
].join("\n");

const VARSAYILAN_AYAR = {
  dukkan: "MACAR TARIM MARKET",
  adres: "Camiatik Mah. Atatürk Bulvarı No:24  Malkara / Tekirdağ",
  tel: "0282 427 08 05",
  yetkili: "Ziraat Mühendisi İrfan Macar",
  uyari: VARSAYILAN_UYARI,
  logo: ""
};

/* ---------------- veri ---------------- */
const varsayilanKategoriler = () => ["Ot İlaçlaması", "Kökboğaz İlaçlaması", "Pas İlaçlaması"].map((ad, n) => ({ id: "k" + (n + 1), ad }));
const ESKI_ALAN = "rec" + "eteler";
function eskiListe(v) {
  if (Array.isArray(v.talimatlar)) return v.talimatlar;
  if (Array.isArray(v[ESKI_ALAN])) return v[ESKI_ALAN];
  return null;
}
let veri = yukle();

function yukle() {
  try {
    let ham = localStorage.getItem(ANAHTAR);
    const eski = localStorage.getItem(ESKI_ANAHTAR);
    if (!ham && eski) { ham = eski; localStorage.setItem(ANAHTAR, eski); }
    if (eski) localStorage.removeItem(ESKI_ANAHTAR);
    if (ham) {
      const v = JSON.parse(ham);
      return {
        ilaclar: Array.isArray(v.ilaclar) ? v.ilaclar : [],
        talimatlar: eskiListe(v) || [],
        kategoriler: Array.isArray(v.kategoriler) ? v.kategoriler : varsayilanKategoriler(),
        ayar: Object.assign({}, VARSAYILAN_AYAR, v.ayar || {}),
        sonYedek: v.sonYedek || null,
        kz: v.kz || 0
      };
    }
  } catch (e) { console.error("Veri okunamadı", e); }
  return { ilaclar: [], talimatlar: [], kategoriler: varsayilanKategoriler(), ayar: Object.assign({}, VARSAYILAN_AYAR), sonYedek: null };
}

function kaydet() {
  try {
    if (window.KlasorKayit) KlasorKayit.damgala();
    localStorage.setItem(ANAHTAR, JSON.stringify(veri));
    if (window.KlasorKayit) KlasorKayit.yaz();   // seçilen klasördeki dosyaya da yaz
    return true;
  } catch (e) {
    console.error(e);
    bildir("Kaydedilemedi! Yer dolmuş olabilir; logoyu küçültün veya yedek alın.", "uyari");
    return false;
  }
}

const id = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
const $ = (s) => document.querySelector(s);
const $$ = (s) => Array.from(document.querySelectorAll(s));
const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const kucuk = (s) => String(s ?? "").toLocaleLowerCase("tr-TR");
const sirala = (a, b) => a.ad.localeCompare(b.ad, "tr-TR", { sensitivity: "base" });
const bugun = () => {
  const d = new Date();
  return new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 10);
};
const tarihYaz = (iso) => {
  if (!iso) return "";
  const [y, m, g] = iso.split("-");
  return `${g}.${m}.${y}`;
};

function ik(ad) { return `<svg class="ik" aria-hidden="true"><use href="#i-${ad}"/></svg>`; }
function bildir(mesaj, tur) {
  const b = $("#bildirim");
  b.innerHTML = (tur === "tamam" ? ik("onay") : tur === "uyari" ? ik("uyari") : "") + `<span>${esc(mesaj)}</span>`;
  b.className = "bildirim no-print" + (tur ? " " + tur : "");
  void b.offsetWidth;
  b.classList.add("goster");
  clearTimeout(bildir.t);
  bildir.t = setTimeout(() => b.classList.remove("goster"), 2600);
}

function eslesir(ilac, q) {
  if (!q) return true;
  const metin = kucuk([ilac.ad, ilac.nasil, katAd(ilac.kategori)].join(" "));
  return kucuk(q).split(/\s+/).filter(Boolean).every((p) => metin.includes(p));
}

const ilkSatir = (s) => String(s || "").split("\n").map((x) => x.trim()).find(Boolean) || "Kullanım bilgisi yok";

/* ---------------- kategoriler ---------------- */
const katAd = (kid) => (kid && veri.kategoriler.find((k) => k.id === kid)?.ad) || "";

// ilaçları kategori sırasına göre gruplar; kategorisizler en sonda
function kategoriGruplari(ilaclar) {
  const gruplar = veri.kategoriler.map((k) => ({ kat: k, ilaclar: [] }));
  const kategorisiz = { kat: null, ilaclar: [] };
  for (const i of ilaclar) (gruplar.find((g) => g.kat.id === i.kategori) || kategorisiz).ilaclar.push(i);
  return [...gruplar, kategorisiz].filter((g) => g.ilaclar.length);
}
const grupBaslik = (g) => `<div class="grup-bas">${g.kat ? esc(g.kat.ad) : "Kategorisiz"} <span class="grup-sayi">${g.ilaclar.length}</span></div>`;

function katCiz() {
  $("#katSayi").textContent = veri.kategoriler.length;
  $("#katListe").innerHTML = veri.kategoriler.map((k, n) => {
    const adet = veri.ilaclar.filter((i) => i.kategori === k.id).length;
    return `<div class="kat-satir" data-id="${k.id}">
      <input class="kat-ad" value="${esc(k.ad)}" aria-label="Kategori adı">
      <span class="kat-adet">${adet} ilaç</span>
      <button class="btn ince kucuk" data-is="yukari" ${n === 0 ? "disabled" : ""} title="Yukarı" aria-label="Yukarı">↑</button>
      <button class="btn ince kucuk" data-is="asagi" ${n === veri.kategoriler.length - 1 ? "disabled" : ""} title="Aşağı" aria-label="Aşağı">↓</button>
      <button class="btn tehlike kucuk" data-is="sil" title="Sil" aria-label="Sil">${ik("cop")}</button>
    </div>`;
  }).join("") || '<p class="bos">Henüz kategori yok.</p>';
}
$("#katListe").addEventListener("change", (e) => {
  if (!e.target.classList.contains("kat-ad")) return;
  const k = veri.kategoriler.find((x) => x.id === e.target.closest(".kat-satir").dataset.id);
  const ad = e.target.value.trim();
  if (!k) return;
  if (!ad) { e.target.value = k.ad; return; }
  k.ad = ad; kaydet(); ilacCiz(); bildir("Kategori adı değişti", "tamam");
});
$("#katListe").addEventListener("click", (e) => {
  const b = e.target.closest("button[data-is]");
  if (!b) return;
  const id = b.closest(".kat-satir").dataset.id;
  const n = veri.kategoriler.findIndex((x) => x.id === id);
  const k = veri.kategoriler[n];
  if (b.dataset.is === "yukari" && n > 0) [veri.kategoriler[n - 1], veri.kategoriler[n]] = [k, veri.kategoriler[n - 1]];
  if (b.dataset.is === "asagi" && n < veri.kategoriler.length - 1) [veri.kategoriler[n + 1], veri.kategoriler[n]] = [k, veri.kategoriler[n + 1]];
  if (b.dataset.is === "sil") {
    const adet = veri.ilaclar.filter((i) => i.kategori === id).length;
    if (!confirm(`"${k.ad}" kategorisi silinsin mi?` + (adet ? `\nİçindeki ${adet} ilaç silinmez, "Kategorisiz" olur.` : ""))) return;
    veri.kategoriler.splice(n, 1);
    veri.ilaclar.forEach((i) => { if (i.kategori === id) i.kategori = ""; });
  }
  kaydet(); ilacCiz();
});
function katEkle() {
  const ad = $("#katYeni").value.trim();
  if (!ad) { $("#katYeni").focus(); return; }
  if (veri.kategoriler.some((k) => kucuk(k.ad) === kucuk(ad))) { bildir("Bu kategori zaten var.", "uyari"); return; }
  veri.kategoriler.push({ id: "k" + id(), ad });
  $("#katYeni").value = "";
  kaydet(); ilacCiz(); bildir("Kategori eklendi", "tamam");
}
$("#katEkleBtn").addEventListener("click", katEkle);
$("#katYeni").addEventListener("keydown", (e) => { if (e.key === "Enter") katEkle(); });

/* ---------------- sekmeler ---------------- */
function sekmeAc(ad) {
  $$(".sekme").forEach((b) => b.classList.toggle("aktif", b.dataset.sekme === ad));
  $$(".sayfa").forEach((s) => s.classList.toggle("aktif", s.id === "s-" + ad));
  if (ad === "kullanim") secimCiz();
  if (ad === "ilaclar") ilacCiz();
  if (ad === "gecmis") gecmisCiz();
  if (ad === "ayarlar") ayarDoldur();
}
$$(".sekme").forEach((b) => b.addEventListener("click", () => sekmeAc(b.dataset.sekme)));

/* ---------------- kullanım yaz ---------------- */
// Her ilaçlamanın kendi seçim listesi var (sıra korunur). Aynı ilaç iki ilaçlamada da olabilir.
let turlar = [{ not: "", ids: [] }];
let aktif = 0;
const yeniTurlar = () => [{ not: "", ids: [] }];
const tumSecili = () => turlar.flatMap((t) => t.ids);

function turCiz() {
  const tekli = turlar.length === 1;
  $("#turCubuk").innerHTML = turlar.map((t, n) => `<button type="button" class="tur-btn${n === aktif ? " aktif" : ""}" data-tur="${n}">
      ${n + 1}. İlaçlama <span class="tur-sayi">${t.ids.length}</span></button>`).join("")
    + `<button type="button" class="tur-btn tur-ekle" id="turEkle">${ik("arti")}İlaçlama ekle</button>`;
  $("#turAlt").classList.toggle("gizli", tekli);
  if (!tekli) {
    $("#turNot").value = turlar[aktif].not;
    $("#turNot").placeholder = aktif === 0 ? "Not (isteğe bağlı), ör. Hemen" : "Not (isteğe bağlı), ör. İlkinden 15 gün sonra";
    $("#turSil").textContent = `${aktif + 1}. ilaçlamayı kaldır`;
  }
}

function secimCiz() {
  const q = $("#rAra").value.trim();
  const var_ = new Set(veri.ilaclar.map((i) => i.id));
  turlar.forEach((t) => { t.ids = t.ids.filter((x) => var_.has(x)); });
  const ids = turlar[aktif].ids;
  const liste = [...veri.ilaclar].sort(sirala).filter((i) => eslesir(i, q) || ids.includes(i.id));
  $("#secimBos").classList.toggle("gizli", veri.ilaclar.length > 0);
  $("#secimListe").innerHTML = kategoriGruplari(liste).map((g) => `<div class="grup">${grupBaslik(g)}<div class="secim-liste">${g.ilaclar.map((i) => {
    const s = ids.indexOf(i.id);
    const digerleri = turlar.map((t, n) => (n !== aktif && t.ids.includes(i.id) ? n + 1 : 0)).filter(Boolean);
    return `<label class="secim${s >= 0 ? " secili" : ""}" data-id="${i.id}">
      <input type="checkbox" ${s >= 0 ? "checked" : ""}>
      <div><div class="secim-ad">${esc(i.ad)}<span class="sira">${s + 1}</span></div>
      <div class="secim-alt">${esc(ilkSatir(i.nasil))}</div>
      ${digerleri.length ? `<div class="secim-diger">${digerleri.map((n) => n + ".").join(", ")} ilaçlamada da var</div>` : ""}</div>
    </label>`;
  }).join("")}</div></div>`).join("");
  if (veri.ilaclar.length && !liste.length) $("#secimListe").innerHTML = `<p class="bos">“${esc(q)}” ile eşleşen ilaç yok.</p>`;
  $("#seciliSayi").textContent = tumSecili().length + " seçili";
  turCiz();
  musteriListesi();
}

$("#secimListe").addEventListener("change", (e) => {
  const kutu = e.target.closest(".secim");
  if (!kutu) return;
  const sid = kutu.dataset.id, t = turlar[aktif];
  if (e.target.checked) { if (!t.ids.includes(sid)) t.ids.push(sid); }
  else t.ids = t.ids.filter((x) => x !== sid);
  secimCiz();
});
$("#turCubuk").addEventListener("click", (e) => {
  const b = e.target.closest("button");
  if (!b) return;
  if (b.id === "turEkle") {
    turlar.push({ not: "", ids: [] });
    aktif = turlar.length - 1;
    bildir(`${aktif + 1}. ilaçlama açıldı, ilaçlarını işaretleyin`, "tamam");
  } else aktif = +b.dataset.tur;
  secimCiz();
});
$("#turNot").addEventListener("input", (e) => { turlar[aktif].not = e.target.value; });
$("#turSil").addEventListener("click", () => {
  if (turlar.length < 2) return;
  const t = turlar[aktif];
  if (t.ids.length && !confirm(`${aktif + 1}. ilaçlama ve içindeki ${t.ids.length} ilaç seçimi kaldırılsın mı?`)) return;
  turlar.splice(aktif, 1);
  aktif = Math.max(0, aktif - 1);
  secimCiz();
});
$("#rAra").addEventListener("input", secimCiz);

function musteriListesi() {
  const adlar = [...new Set(veri.talimatlar.map((r) => r.musteri))].sort((a, b) => a.localeCompare(b, "tr-TR"));
  $("#musteriListe").innerHTML = adlar.map((a) => `<option value="${esc(a)}">`).join("");
}

function formuTemizle() {
  $("#mAd").value = ""; $("#mNot").value = "";
  $("#mTarih").value = bugun(); $("#rAra").value = "";
  turlar = yeniTurlar(); aktif = 0;
  secimCiz();
}
$("#temizleBtn").addEventListener("click", formuTemizle);

$("#olusturBtn").addEventListener("click", () => {
  const musteri = $("#mAd").value.trim();
  if (!musteri) { bildir("Müşterinin adını yazın.", "uyari"); $("#mAd").focus(); return; }
  if (!tumSecili().length) { bildir("En az bir ilaç işaretleyin.", "uyari"); return; }
  // talimat basıldığı andaki ilaç bilgisi saklanır; ilaç sonra değişse de eski talimat aynı kalır
  const anlik = (sid) => {
    const i = veri.ilaclar.find((x) => x.id === sid);
    return Object.assign({}, i, { kategoriAd: katAd(i.kategori) });
  };
  const doluTurlar = turlar.filter((t) => t.ids.length).map((t) => ({ not: t.not.trim(), ilaclar: t.ids.map(anlik) }));
  const talimat = {
    id: id(),
    musteri,
    tarih: $("#mTarih").value || bugun(),
    not: $("#mNot").value.trim(),
    ilaclar: doluTurlar.flatMap((t) => t.ilaclar),
    turlar: doluTurlar,
    olusturma: new Date().toISOString()
  };
  veri.talimatlar.unshift(talimat);
  kaydet();
  onizlemeAc(talimat);
  formuTemizle();
});

/* ---------------- talimat kağıdı ---------------- */
const VARSAYILAN_LOGO = "icons/logo.png";

function talimatHTML(r) {
  const a = veri.ayar;
  const uyarilar = String(a.uyari || "").split("\n").map((s) => s.trim()).filter(Boolean);
  const turListe = Array.isArray(r.turlar) && r.turlar.length ? r.turlar : [{ not: "", ilaclar: r.ilaclar }];
  const satirlar = (t) => String(t || "").split("\n").map((x) => x.trim()).filter(Boolean);
  const kalem = (i) => {
    const a = satirlar(i.nasil);
    if (a.length <= 1) return `<div class="r-kalem"><b>${esc(i.ad)}</b>${a.length ? " — " + esc(a[0]) : ""}</div>`;
    return `<div class="r-kalem"><b>${esc(i.ad)}</b><ul class="r-alt-adim">${a.map((x) => `<li>${esc(x)}</li>`).join("")}</ul></div>`;
  };
  // kâğıtta kategori yok: her ilaçlama kendi kutusunda, içinde ilaçlar alt alta
  const ilaclar = turListe.map((t, n) => `<div class="r-ilac r-tur-kutu">
      <div class="r-ilac-bas"><span class="r-ilac-ad r-tur-ad">${n + 1}. İlaçlama</span>${t.not ? `<span class="r-tur-not">${esc(t.not)}</span>` : ""}</div>
      <div class="r-ilac-govde">${t.ilaclar.map(kalem).join("")}</div></div>`).join("");

  return `<div class="a4">
    <div class="r-bas">
      <img class="r-logo" src="${esc(a.logo || VARSAYILAN_LOGO)}" alt="">
      <div>
        <div class="r-iletisim">${esc(a.adres)}</div>
        <div class="r-iletisim">${a.tel ? "Tel: " + esc(a.tel) : ""}</div>
      </div>
      <div class="r-baslik-sag">
        <div class="r-belge">İlaç Kullanım Talimatı</div>
        <div class="r-tarih">Tarih: ${tarihYaz(r.tarih)}</div>
      </div>
    </div>
    <div class="r-musteri">
      <div><span class="r-etiket">Sayın</span><b>${esc(r.musteri)}</b></div>
      <div><span class="r-etiket">İlaçlama sayısı</span><b>${turListe.length}</b></div>
    </div>
    ${r.not ? `<div class="r-not">${esc(r.not)}</div>` : ""}
    ${ilaclar}
    <div class="r-alt">
      ${uyarilar.length ? `<div class="r-uyari"><b>${ik("uyari")}Dikkat – Uyarılar</b><ul>${uyarilar.map((u) => `<li>${esc(u)}</li>`).join("")}</ul></div>` : ""}
      <div class="r-imza"><div class="r-imza-kutu">${esc(a.yetkili || "")}<br>&nbsp;</div></div>
    </div>
  </div>`;
}

let oncekiBaslik = document.title;
function onizlemeAc(r) {
  $("#kagit").innerHTML = talimatHTML(r);
  $("#onizleme").classList.remove("gizli");
  $("#onizleme").scrollTop = 0;
  oncekiBaslik = document.title;
  // "PDF olarak kaydet" deyince dosya adı müşteri adıyla gelsin
  document.title = `Kullanım Talimatı - ${r.musteri} - ${tarihYaz(r.tarih)}`;
}
function onizlemeKapat() {
  $("#onizleme").classList.add("gizli");
  document.title = oncekiBaslik;
}
$("#onizKapat").addEventListener("click", onizlemeKapat);
$("#yazdirBtn").addEventListener("click", () => window.print());
document.addEventListener("keydown", (e) => {
  if (e.key === "Escape" && !$("#onizleme").classList.contains("gizli")) onizlemeKapat();
});

/* ---------------- ilaçlar ---------------- */
function ilacCiz() {
  const q = $("#iAra").value.trim();
  const liste = [...veri.ilaclar].sort(sirala).filter((i) => eslesir(i, q));
  $("#ilacSayi").textContent = veri.ilaclar.length;
  $("#ilacBos").classList.toggle("gizli", veri.ilaclar.length > 0);
  $("#ilacListe").innerHTML = kategoriGruplari(liste).map((g) => `<div class="grup">${grupBaslik(g)}<div class="ilac-liste">${g.ilaclar.map((i) => `
    <div class="ilac-satir" data-id="${i.id}">
      <span class="avatar">${ik("sise")}</span>
      <div class="ilac-bilgi">
        <div class="ilac-ad">${esc(i.ad)}</div>
        <div class="ilac-alt">${i.nasil ? esc(ilkSatir(i.nasil)) : "&nbsp;"}</div>
      </div>
      ${!i.nasil ? '<span class="eksik">Kullanım bilgisi yok</span>' : ""}
      <span class="ok-ikon">${ik("kalem")}</span>
    </div>`).join("")}</div></div>`).join("");
  katCiz();
  if (veri.ilaclar.length && !liste.length) $("#ilacListe").innerHTML = `<p class="bos">“${esc(q)}” ile eşleşen ilaç yok.</p>`;
}
$("#iAra").addEventListener("input", ilacCiz);
$("#ilacListe").addEventListener("click", (e) => {
  const s = e.target.closest(".ilac-satir");
  if (s) ilacPencereAc(s.dataset.id);
});
$("#yeniIlacBtn").addEventListener("click", () => ilacPencereAc(null));

const ALANLAR = { ad: "#fAd", nasil: "#fNasil" };
let duzenlenen = null;
let sonKategori = ""; // yeni ilaçta son seçilen kategori hatırlanır

function ilacPencereAc(iid) {
  duzenlenen = iid;
  const i = iid ? veri.ilaclar.find((x) => x.id === iid) : null;
  $("#ilacBaslik").textContent = i ? "İlacı düzenle" : "Yeni ilaç";
  for (const [k, s] of Object.entries(ALANLAR)) $(s).value = i?.[k] || "";
  $("#fKat").innerHTML = '<option value="">Kategorisiz</option>' + veri.kategoriler.map((k) => `<option value="${k.id}">${esc(k.ad)}</option>`).join("");
  $("#fKat").value = (i ? i.kategori : sonKategori) || "";
  if ($("#fKat").selectedIndex < 0) $("#fKat").value = "";
  $("#ilacSil").classList.toggle("gizli", !i);
  $("#ilacPencere").showModal();
  $("#fAd").focus();
}

$("#ilacForm").addEventListener("submit", (e) => {
  e.preventDefault();
  const kayit = {};
  for (const [k, s] of Object.entries(ALANLAR)) kayit[k] = $(s).value.trim();
  kayit.kategori = $("#fKat").value;
  sonKategori = kayit.kategori;
  if (!kayit.ad) { $("#fAd").focus(); return; }
  const ayni = veri.ilaclar.find((x) => kucuk(x.ad) === kucuk(kayit.ad) && x.id !== duzenlenen);
  if (ayni && !confirm(`"${ayni.ad}" adında bir ilaç zaten var. Yine de kaydedilsin mi?`)) return;
  if (duzenlenen) {
    Object.assign(veri.ilaclar.find((x) => x.id === duzenlenen), kayit, { guncelleme: new Date().toISOString() });
  } else {
    veri.ilaclar.push(Object.assign({ id: id(), ekleme: new Date().toISOString() }, kayit));
  }
  kaydet();
  $("#ilacPencere").close();
  ilacCiz();
  bildir(duzenlenen ? "İlaç güncellendi" : "İlaç eklendi", "tamam");
});
$("#ilacVazgec").addEventListener("click", () => $("#ilacPencere").close());
$("#ilacSil").addEventListener("click", () => {
  const i = veri.ilaclar.find((x) => x.id === duzenlenen);
  if (!i || !confirm(`"${i.ad}" silinsin mi? (Eski talimatlar etkilenmez.)`)) return;
  veri.ilaclar = veri.ilaclar.filter((x) => x.id !== duzenlenen);
  turlar.forEach((t) => { t.ids = t.ids.filter((x) => x !== duzenlenen); });
  kaydet();
  $("#ilacPencere").close();
  ilacCiz();
  bildir("İlaç silindi");
});

/* ---------------- geçmiş ---------------- */
function gecmisCiz() {
  const q = kucuk($("#gAra").value.trim());
  const liste = veri.talimatlar.filter((r) => !q || kucuk(r.musteri).includes(q));
  $("#gecmisSayi").textContent = veri.talimatlar.length;
  $("#gecmisBos").classList.toggle("gizli", veri.talimatlar.length > 0);
  $("#gecmisListe").innerHTML = liste.map((r) => `
    <div class="gecmis-satir" data-id="${r.id}">
      <span class="avatar">${ik("belge")}</span>
      <div class="gecmis-bilgi">
        <div class="gecmis-ad">${esc(r.musteri)}</div>
        <div class="gecmis-alt">${tarihYaz(r.tarih)} · ${esc(r.ilaclar.map((i) => i.ad).join(", "))}</div>
      </div>
      <button class="btn ikincil kucuk" data-is="ac">${ik("yazici")}Aç / Yazdır</button>
      <button class="btn ince kucuk" data-is="kopya" title="Bu ilaçlarla yeni talimat">${ik("tekrar")}Tekrar yaz</button>
      <button class="btn tehlike kucuk" data-is="sil" title="Sil" aria-label="Sil">${ik("cop")}</button>
    </div>`).join("");
}
$("#gAra").addEventListener("input", gecmisCiz);
$("#gecmisListe").addEventListener("click", (e) => {
  const b = e.target.closest("button[data-is]");
  if (!b) return;
  const r = veri.talimatlar.find((x) => x.id === b.closest(".gecmis-satir").dataset.id);
  if (!r) return;
  if (b.dataset.is === "ac") onizlemeAc(r);
  if (b.dataset.is === "sil" && confirm(`${r.musteri} – ${tarihYaz(r.tarih)} talimatı silinsin mi?`)) {
    veri.talimatlar = veri.talimatlar.filter((x) => x !== r);
    kaydet(); gecmisCiz();
  }
  if (b.dataset.is === "kopya") {
    sekmeAc("kullanim");
    $("#mAd").value = r.musteri; $("#mNot").value = r.not || "";
    $("#mTarih").value = bugun();
    const varMi = (sid) => veri.ilaclar.some((x) => x.id === sid);
    const kaynak = Array.isArray(r.turlar) && r.turlar.length ? r.turlar : [{ not: "", ilaclar: r.ilaclar }];
    turlar = kaynak.map((t) => ({ not: t.not || "", ids: t.ilaclar.map((i) => i.id).filter(varMi) }));
    aktif = 0;
    secimCiz();
    const eksik = r.ilaclar.length - tumSecili().length;
    bildir(eksik ? `${eksik} ilaç listeden silinmiş, onlar seçilmedi.` : "İlaçlar seçildi, kontrol edip oluşturun.");
  }
});

/* ---------------- ayarlar ---------------- */
function ayarDoldur() {
  const a = veri.ayar;
  $("#aAdres").value = a.adres; $("#aTel").value = a.tel;
  $("#aYetkili").value = a.yetkili; $("#aUyari").value = a.uyari;
  $("#aLogoImg").src = a.logo || VARSAYILAN_LOGO;
  $("#surum").textContent = SURUM;
  $("#sonYedek").textContent = veri.sonYedek ? "Son yedek: " + new Date(veri.sonYedek).toLocaleString("tr-TR") : "Henüz yedek alınmadı.";
}
$("#ayarKaydet").addEventListener("click", () => {
  Object.assign(veri.ayar, {
    adres: $("#aAdres").value.trim(), tel: $("#aTel").value.trim(),
    yetkili: $("#aYetkili").value.trim(), uyari: $("#aUyari").value
  });
  if (kaydet()) bildir("Ayarlar kaydedildi", "tamam");
});
$("#aLogo").addEventListener("change", (e) => {
  const f = e.target.files[0];
  if (!f) return;
  const img = new Image();
  const url = URL.createObjectURL(f);
  img.onload = () => {
    // logoyu 400px'e küçültüp sakla (yer kaplamasın)
    const olcek = Math.min(1, 400 / Math.max(img.width, img.height));
    const c = document.createElement("canvas");
    c.width = Math.round(img.width * olcek); c.height = Math.round(img.height * olcek);
    c.getContext("2d").drawImage(img, 0, 0, c.width, c.height);
    veri.ayar.logo = c.toDataURL("image/png");
    URL.revokeObjectURL(url);
    if (kaydet()) { $("#aLogoImg").src = veri.ayar.logo; bildir("Logo kaydedildi", "tamam"); }
  };
  img.onerror = () => bildir("Bu resim açılamadı.", "uyari");
  img.src = url;
  e.target.value = "";
});
$("#aLogoSil").addEventListener("click", () => {
  veri.ayar.logo = ""; kaydet(); $("#aLogoImg").src = VARSAYILAN_LOGO; bildir("Macar Tarım logosu kullanılıyor");
});

/* ---------------- yedek ---------------- */
$("#yedekAl").addEventListener("click", () => {
  veri.sonYedek = new Date().toISOString();
  kaydet();
  const blob = new Blob([JSON.stringify({ program: "macar-talimat", surum: SURUM, tarih: veri.sonYedek, ...veri }, null, 1)], { type: "application/json" });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = `macar-talimat-yedek-${bugun()}.json`;
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 2000);
  ayarDoldur();
  bildir("Yedek indirildi", "tamam");
});
$("#yedekYukle").addEventListener("change", async (e) => {
  const f = e.target.files[0];
  e.target.value = "";
  if (!f) return;
  try {
    const v = JSON.parse(await f.text());
    const liste = eskiListe(v);
    if (!Array.isArray(v.ilaclar) || !liste) throw new Error("biçim");
    if (!confirm(`Yedekte ${v.ilaclar.length} ilaç ve ${liste.length} talimat var.\nŞu anki bilgiler bunlarla DEĞİŞTİRİLSİN mi?`)) return;
    veri = { ilaclar: v.ilaclar, talimatlar: liste, kategoriler: Array.isArray(v.kategoriler) ? v.kategoriler : varsayilanKategoriler(), ayar: Object.assign({}, VARSAYILAN_AYAR, v.ayar || {}), sonYedek: v.sonYedek || null };
    kaydet(); ayarDoldur(); turlar = yeniTurlar(); aktif = 0;
    bildir("Yedek yüklendi", "tamam");
  } catch (err) {
    bildir("Bu dosya geçerli bir Macar Talimat yedeği değil.", "uyari");
  }
});

/* ---------------- kurulum & güncelleme ---------------- */
let kurulumOlayi = null;
window.addEventListener("beforeinstallprompt", (e) => {
  e.preventDefault();
  kurulumOlayi = e;
  $("#kurBtn").classList.remove("gizli");
});
$("#kurBtn").addEventListener("click", async () => {
  if (!kurulumOlayi) return;
  kurulumOlayi.prompt();
  await kurulumOlayi.userChoice;
  kurulumOlayi = null;
  $("#kurBtn").classList.add("gizli");
});
window.addEventListener("appinstalled", () => { $("#kurBtn").classList.add("gizli"); bildir("Program kuruldu", "tamam"); });

if ("serviceWorker" in navigator && location.protocol !== "file:") {
  navigator.serviceWorker.register("sw.js").then((kayit) => {
    const bekleyeniGoster = (sw) => {
      $("#guncelBant").classList.remove("gizli");
      $("#guncelBtn").onclick = () => sw.postMessage("gec");
    };
    if (kayit.waiting && navigator.serviceWorker.controller) bekleyeniGoster(kayit.waiting);
    kayit.addEventListener("updatefound", () => {
      const yeni = kayit.installing;
      yeni?.addEventListener("statechange", () => {
        if (yeni.state === "installed" && navigator.serviceWorker.controller) bekleyeniGoster(yeni);
      });
    });
    setInterval(() => kayit.update().catch(() => {}), 30 * 60 * 1000);
  }).catch((e) => console.warn("SW kaydedilemedi", e));
  let yenilendi = false;
  navigator.serviceWorker.addEventListener("controllerchange", () => {
    if (yenilendi) return;
    yenilendi = true;
    location.reload();
  });
}
navigator.storage?.persist?.().catch(() => {});

/* ---------------- başlangıç ---------------- */
$("#mTarih").value = bugun();
secimCiz();
