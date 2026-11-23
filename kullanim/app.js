/* Macar Talimat — ilaç kullanım talimatı programı */
"use strict";

const SURUM = "1.4.0";
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
        ayar: Object.assign({}, VARSAYILAN_AYAR, v.ayar || {}),
        sonYedek: v.sonYedek || null
      };
    }
  } catch (e) { console.error("Veri okunamadı", e); }
  return { ilaclar: [], talimatlar: [], ayar: Object.assign({}, VARSAYILAN_AYAR), sonYedek: null };
}

function kaydet() {
  try {
    localStorage.setItem(ANAHTAR, JSON.stringify(veri));
    return true;
  } catch (e) {
    console.error(e);
    bildir("⚠️ Kaydedilemedi! Yer dolmuş olabilir; logoyu küçültün veya yedek alın.");
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

function bildir(mesaj) {
  const b = $("#bildirim");
  b.textContent = mesaj;
  b.classList.add("goster");
  clearTimeout(bildir.t);
  bildir.t = setTimeout(() => b.classList.remove("goster"), 2600);
}

function eslesir(ilac, q) {
  if (!q) return true;
  const metin = kucuk([ilac.ad, ilac.nasil].join(" "));
  return kucuk(q).split(/\s+/).filter(Boolean).every((p) => metin.includes(p));
}

const ilkSatir = (s) => String(s || "").split("\n").map((x) => x.trim()).find(Boolean) || "Kullanım bilgisi yok";

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
let secili = []; // seçim sırası korunur

function secimCiz() {
  const q = $("#rAra").value.trim();
  const liste = [...veri.ilaclar].sort(sirala).filter((i) => eslesir(i, q) || secili.includes(i.id));
  secili = secili.filter((sid) => veri.ilaclar.some((i) => i.id === sid));
  $("#secimBos").classList.toggle("gizli", veri.ilaclar.length > 0);
  $("#secimListe").innerHTML = liste.map((i) => {
    const s = secili.indexOf(i.id);
    return `<label class="secim${s >= 0 ? " secili" : ""}" data-id="${i.id}">
      <input type="checkbox" ${s >= 0 ? "checked" : ""}>
      <div><div class="secim-ad">${esc(i.ad)}<span class="sira">${s + 1}</span></div>
      <div class="secim-alt">${esc(ilkSatir(i.nasil))}</div></div>
    </label>`;
  }).join("");
  if (veri.ilaclar.length && !liste.length) $("#secimListe").innerHTML = `<p class="bos">“${esc(q)}” ile eşleşen ilaç yok.</p>`;
  $("#seciliSayi").textContent = secili.length + " seçili";
  musteriListesi();
}

$("#secimListe").addEventListener("change", (e) => {
  const kutu = e.target.closest(".secim");
  if (!kutu) return;
  const sid = kutu.dataset.id;
  if (e.target.checked) { if (!secili.includes(sid)) secili.push(sid); }
  else secili = secili.filter((x) => x !== sid);
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
  secili = [];
  secimCiz();
}
$("#temizleBtn").addEventListener("click", formuTemizle);

$("#olusturBtn").addEventListener("click", () => {
  const musteri = $("#mAd").value.trim();
  if (!musteri) { bildir("Müşterinin adını yazın."); $("#mAd").focus(); return; }
  if (!secili.length) { bildir("En az bir ilaç işaretleyin."); return; }
  const talimat = {
    id: id(),
    musteri,
    tarih: $("#mTarih").value || bugun(),
    not: $("#mNot").value.trim(),
    // talimat basıldığı andaki ilaç bilgisi saklanır; ilaç sonra değişse de eski talimat aynı kalır
    ilaclar: secili.map((sid) => Object.assign({}, veri.ilaclar.find((i) => i.id === sid))),
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
  const ilaclar = r.ilaclar.map((i, n) => {
    const bilgiler = [["Doz", i.doz], ["Su miktarı", i.su], ["Ne zaman", i.zaman], ["Hangi üründe / neye karşı", i.neye], ["Etken madde", i.etken], ["Hasada kalan süre", i.bekleme]]
      .filter(([, d]) => d && String(d).trim())
      .map(([e, d]) => `<div class="r-bilgi"><span class="r-etiket">${e}</span><div>${esc(d)}</div></div>`).join("");
    const adimlar = String(i.nasil || "").split("\n").map((s) => s.trim()).filter(Boolean);
    return `<div class="r-ilac">
      <div class="r-ilac-bas"><span class="r-no">${n + 1}</span><span class="r-ilac-ad">${esc(i.ad)}</span><span class="r-ilac-tur">${esc(i.tur || "")}</span></div>
      <div class="r-ilac-govde">
        ${bilgiler ? `<div class="r-bilgiler">${bilgiler}</div>` : ""}
        ${adimlar.length ? `<span class="r-etiket">Nasıl kullanılır</span><ol class="r-adimlar">${adimlar.map((s) => `<li>${esc(s)}</li>`).join("")}</ol>` : ""}
        ${i.dikkat ? `<div class="r-dikkat">⚠ ${esc(i.dikkat)}</div>` : ""}
      </div></div>`;
  }).join("");

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
      <div><span class="r-etiket">İlaç sayısı</span><b>${r.ilaclar.length}</b></div>
    </div>
    ${r.not ? `<div class="r-not">${esc(r.not)}</div>` : ""}
    ${ilaclar}
    <div class="r-alt">
      ${uyarilar.length ? `<div class="r-uyari"><b>⚠ Dikkat – Uyarılar</b><ul>${uyarilar.map((u) => `<li>${esc(u)}</li>`).join("")}</ul></div>` : ""}
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
  $("#ilacListe").innerHTML = liste.map((i) => `
    <div class="ilac-satir" data-id="${i.id}">
      <div class="ilac-bilgi">
        <div class="ilac-ad">${esc(i.ad)}</div>
        <div class="ilac-alt">${i.nasil ? esc(ilkSatir(i.nasil)) : "&nbsp;"}</div>
      </div>
      ${!i.nasil ? '<span class="eksik">Kullanım bilgisi yok</span>' : ""}
    </div>`).join("");
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

function ilacPencereAc(iid) {
  duzenlenen = iid;
  const i = iid ? veri.ilaclar.find((x) => x.id === iid) : null;
  $("#ilacBaslik").textContent = i ? "İlacı düzenle" : "Yeni ilaç";
  for (const [k, s] of Object.entries(ALANLAR)) $(s).value = i?.[k] || "";
  $("#ilacSil").classList.toggle("gizli", !i);
  $("#ilacPencere").showModal();
  $("#fAd").focus();
}

$("#ilacForm").addEventListener("submit", (e) => {
  e.preventDefault();
  const kayit = {};
  for (const [k, s] of Object.entries(ALANLAR)) kayit[k] = $(s).value.trim();
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
  bildir(duzenlenen ? "İlaç güncellendi ✓" : "İlaç eklendi ✓");
});
$("#ilacVazgec").addEventListener("click", () => $("#ilacPencere").close());
$("#ilacSil").addEventListener("click", () => {
  const i = veri.ilaclar.find((x) => x.id === duzenlenen);
  if (!i || !confirm(`"${i.ad}" silinsin mi? (Eski talimatlar etkilenmez.)`)) return;
  veri.ilaclar = veri.ilaclar.filter((x) => x.id !== duzenlenen);
  secili = secili.filter((x) => x !== duzenlenen);
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
      <div class="gecmis-bilgi">
        <div class="gecmis-ad">${esc(r.musteri)}</div>
        <div class="gecmis-alt">${tarihYaz(r.tarih)} · ${esc(r.ilaclar.map((i) => i.ad).join(", "))}</div>
      </div>
      <button class="btn ikincil kucuk" data-is="ac">🖨️ Aç / Yazdır</button>
      <button class="btn ince kucuk" data-is="kopya" title="Bu ilaçlarla yeni talimat">Tekrar yaz</button>
      <button class="btn tehlike kucuk" data-is="sil">Sil</button>
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
    secili = r.ilaclar.map((i) => i.id).filter((sid) => veri.ilaclar.some((x) => x.id === sid));
    secimCiz();
    const eksik = r.ilaclar.length - secili.length;
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
  if (kaydet()) bildir("Ayarlar kaydedildi ✓");
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
    if (kaydet()) { $("#aLogoImg").src = veri.ayar.logo; bildir("Logo kaydedildi ✓"); }
  };
  img.onerror = () => bildir("Bu resim açılamadı.");
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
  bildir("Yedek indirildi ✓");
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
    veri = { ilaclar: v.ilaclar, talimatlar: liste, ayar: Object.assign({}, VARSAYILAN_AYAR, v.ayar || {}), sonYedek: v.sonYedek || null };
    kaydet(); ayarDoldur(); secili = [];
    bildir("Yedek yüklendi ✓");
  } catch (err) {
    bildir("Bu dosya geçerli bir Macar Talimat yedeği değil.");
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
window.addEventListener("appinstalled", () => { $("#kurBtn").classList.add("gizli"); bildir("Program kuruldu ✓"); });

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
