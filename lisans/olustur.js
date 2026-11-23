#!/usr/bin/env node
/* ============================================================
   Abonelik sistemini uygulamalara gömer ve panel kasasını üretir.

   Kullanım:
     SIFRE='panel-sifresi' node lisans/olustur.js <gizli.json> [kepce-klasoru]

   gizli.json  : {"KP":"<64 hex>","MZ":"<64 hex>","MT":"<64 hex>"}
                 Yoksa yeni anahtarlar üretilir. BU DOSYAYI DEPOYA KOYMA.
                 Kaybolursa: anahtarlar uygulama dosyalarından da geri okunabilir.
   ============================================================ */
"use strict";
const fs = require("fs");
const path = require("path");
const crypto = require("crypto");

const KOK = path.join(__dirname, "..");
const gizliYol = process.argv[2];
const kepceKok = process.argv[3] || path.join(KOK, "..", "kep-e");
const sifre = process.env.SIFRE;
if (!gizliYol || !sifre) { console.error("Kullanım: SIFRE='...' node lisans/olustur.js <gizli.json> [kepce-klasoru]"); process.exit(1); }

let gizli;
if (fs.existsSync(gizliYol)) gizli = JSON.parse(fs.readFileSync(gizliYol, "utf8"));
else {
  gizli = { KP: crypto.randomBytes(32).toString("hex"), MZ: crypto.randomBytes(32).toString("hex"), MT: crypto.randomBytes(32).toString("hex") };
  fs.writeFileSync(gizliYol, JSON.stringify(gizli, null, 2), { mode: 0o600 });
  console.log("Yeni anahtarlar üretildi:", gizliYol);
}

function gizle(hex) {
  const m = "macar-abonelik"; let o = "";
  for (let i = 0; i < hex.length; i += 2) o += ("0" + (parseInt(hex.substr(i, 2), 16) ^ m.charCodeAt((i / 2) % m.length)).toString(16)).slice(-2);
  return o;
}

/* --- panel kasası (PBKDF2 + AES-256-GCM, tarayıcıdaki WebCrypto ile uyumlu) --- */
const tur = 310000, tuz = crypto.randomBytes(16), iv = crypto.randomBytes(12);
const anahtar = crypto.pbkdf2Sync(sifre, tuz, tur, 32, "sha256");
const c = crypto.createCipheriv("aes-256-gcm", anahtar, iv);
const sif = Buffer.concat([c.update(JSON.stringify(gizli), "utf8"), c.final(), c.getAuthTag()]);
const kasa = { tur, tuz: tuz.toString("base64"), iv: iv.toString("base64"), veri: sif.toString("base64") };
fs.writeFileSync(path.join(KOK, "yonetim", "kasa.js"),
  "/* Abonelik paneli kasası — uygulama anahtarları panel şifresiyle kilitli. lisans/olustur.js üretir. */\n" +
  "window.ABONELIK_KASA = " + JSON.stringify(kasa) + ";\n");
console.log("yonetim/kasa.js yazıldı");

/* --- uygulamalara göm --- */
const cekirdek = fs.readFileSync(path.join(__dirname, "cekirdek.js"), "utf8");
const istemci = fs.readFileSync(path.join(__dirname, "istemci.js"), "utf8");
const BAS = "<!-- ABONELIK-BASLA", SON = "<!-- ABONELIK-BITIR -->";

function blok(uyg, ad, otomatik) {
  const ayar = { uyg, ad, gizli: gizle(gizli[uyg]), otomatik };
  return BAS + " · lisans/olustur.js üretir, elle düzenleme -->\n" +
    "<script>window.LISANS_AYAR=" + JSON.stringify(ayar) + ";</script>\n" +
    "<script>\n" + cekirdek + "</script>\n<script>\n" + istemci + "</script>\n" + SON;
}
function gom(dosya, uyg, ad, otomatik) {
  if (!fs.existsSync(dosya)) { console.log("YOK, atlandı:", dosya); return; }
  let h = fs.readFileSync(dosya, "utf8");
  const b = blok(uyg, ad, otomatik);
  const i = h.indexOf(BAS), j = h.indexOf(SON);
  if (i >= 0 && j > i) h = h.slice(0, i) + b + h.slice(j + SON.length);
  else {
    const k = h.indexOf("</head>");
    if (k < 0) throw new Error("</head> bulunamadı: " + dosya);
    h = h.slice(0, k) + b + "\n" + h.slice(k);
  }
  fs.writeFileSync(dosya, h);
  console.log("gömüldü:", path.relative(path.join(KOK, ".."), dosya), uyg);
}

gom(path.join(KOK, "index.html"), "MZ", "Macar Zeka", false);
gom(path.join(KOK, "kullanim", "index.html"), "MT", "Macar Talimat", true);
gom(path.join(kepceKok, "index.html"), "KP", "Kepçe", true);
gom(path.join(kepceKok, "sunucu", "public", "index.html"), "KP", "Kepçe", true);
