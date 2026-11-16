"use strict";
/* Tarayıcı davranışı testi:
   Windows'ta Edge bazen işi zaten açık bir sürece devredip hemen kapanır.
   Bu durumda program kendini kapatmamalı. Burada hemen kapanan sahte bir
   tarayıcı ile o senaryo denenir. */

const { app, BrowserWindow } = require("electron");
const { spawn } = require("child_process");
const path = require("path");
const KOK_DIZIN = path.join(__dirname, "..");
function kok(a){ return path.join(KOK_DIZIN, a); }
function yeniSurumYolu(a){ return path.join(KOK_DIZIN, "test-ikililer", a); }
const fs = require("fs");

const KOK = kok("test-tarayici");
fs.rmSync(KOK, { recursive: true, force: true });
fs.mkdirSync(path.join(KOK, "sahte"), { recursive: true });
fs.copyFileSync(kok("macarzeka-linux"), path.join(KOK, "MacarZeka"));
fs.chmodSync(path.join(KOK, "MacarZeka"), 0o755);

/* hemen kapanan sahte tarayıcı */
const sahte = path.join(KOK, "sahte", "google-chrome");
fs.writeFileSync(sahte, "#!/bin/sh\nexit 0\n");
fs.chmodSync(sahte, 0o755);

const portDosya = path.join(KOK, "oturum.port");
const veriDosya = path.join(KOK, "veriler.json");
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

let surec = null;
app.on("window-all-closed", function () {});

app.whenReady().then(async function () {
  surec = spawn(path.join(KOK, "MacarZeka"), [], {
    cwd: KOK,
    env: Object.assign({}, process.env, { PATH: path.join(KOK, "sahte") + ":" + process.env.PATH }),
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

  ok("Sahte tarayıcı hemen kapandı", true);
  await bekle(3500); // programın yanlışlıkla kapanması için fazlasıyla yeterli süre
  ok("Tarayıcı kapanınca program ERKEN kapanmadı", surec.exitCode === null, "exitCode=" + surec.exitCode);

  const win = new BrowserWindow({ width: 1200, height: 800, show: false,
    webPreferences: { contextIsolation: true, nodeIntegration: false } });
  win.webContents.on("console-message", function (_e, s, m) { if (s >= 2) hatalar.push("  ✗ KONSOL: " + m); });
  await win.loadURL("http://127.0.0.1:" + p.port + "/?t=" + p.jeton);
  await bekle(800);
  const js = function (k) { return win.webContents.executeJavaScript(k, true); };
  ok("Pencere programa bağlandı", await js("MASAUSTU === true"));

  await js("window.confirm=function(){return true}; window.alert=function(){}; 0;");
  await js("ornekYukle()");
  await bekle(900);
  ok("Kayıt yapılabiliyor", fs.existsSync(veriDosya) && JSON.parse(fs.readFileSync(veriDosya, "utf8")).musteriler.length === 4);

  /* pencere açıkken 14 saniye bekle: nabız sürdüğü için kapanmamalı */
  await bekle(14000);
  ok("Pencere açıkken program ayakta kaldı (14 sn)", surec.exitCode === null, "exitCode=" + surec.exitCode);
  ok("14 sn sonra hâlâ kayıt yapılabiliyor", await js("(function(){ veri.musteriler.push({id:'zz',ad:'Geç Kayıt',notlar:[]}); kaydet(); return true; })()"));
  await bekle(900);
  ok("Geç kayıt diske yazıldı", JSON.parse(fs.readFileSync(veriDosya, "utf8")).musteriler.length === 5);

  /* pencereyi kapat: en geç ~25 sn içinde program kendini kapatmalı */
  win.destroy();
  let kapandi = false;
  for (let i = 0; i < 70; i++) {
    if (surec.exitCode !== null) { kapandi = true; break; }
    await bekle(500);
  }
  ok("Pencere kapanınca program kapandı", kapandi, "exitCode=" + surec.exitCode);
  ok("Kapanışta veri sağlam", JSON.parse(fs.readFileSync(veriDosya, "utf8")).musteriler.length === 5);
  bitir();
}).catch(function (e) { hatalar.push("  ✗ TEST ÇÖKTÜ: " + e.stack); bitir(); });

function bitir() {
  try { if (surec && surec.exitCode === null) surec.kill(); } catch (e) {}
  const basarili = notlar.length;
  let m = ["=========== TARAYICI DAVRANIŞ TESTİ ==========="].concat(notlar);
  if (hatalar.length) m = m.concat(["", "--- HATALAR ---"], hatalar, ["", "SONUC: " + hatalar.length + " HATA / " + basarili + " BASARILI"]);
  else m.push("", "SONUC: HEPSI BASARILI (" + basarili + " kontrol)");
  const metin = m.join("\n") + "\n";
  try { fs.writeFileSync(kok("tarayici-sonuc.txt"), metin); } catch (e) {}
  process.stdout.write(metin);
  setTimeout(function () { app.exit(hatalar.length ? 1 : 0); }, 250);
}
