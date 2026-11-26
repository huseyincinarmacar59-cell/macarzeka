import asyncio, json, os
from playwright.async_api import async_playwright
ARGS=["--no-sandbox","--host-resolver-rules=MAP mz.test 127.0.0.1","--unsafely-treat-insecure-origin-as-secure=http://mz.test:8123"]
URL="http://mz.test:8123/index.html"
# Gerçek klasör seçme penceresi otomatikleştirilemez: aynı API'yi taşıyan tarayıcı içi klasöre (OPFS) yönlendir
MOCK = """window.showDirectoryPicker = async () => { const k = await navigator.storage.getDirectory(); return k.getDirectoryHandle('MacarZeka Kayitlar', {create:true}); };
// Bu test ortamındaki Chrome, klasör tutamağını IndexedDB'ye yazınca sekmeyi kapatıyor; hatırlamayı localStorage işaretiyle taklit et.
window.MZ_KLASOR_DEPO = {
  al: async () => localStorage.getItem('__klasor') ? (await navigator.storage.getDirectory()).getDirectoryHandle('MacarZeka Kayitlar') : null,
  koy: async (v) => { if (v) localStorage.setItem('__klasor','1'); else localStorage.removeItem('__klasor'); return true; } };"""
hatalar=[]
def ok(k,m):
    print(("  ✓ " if k else "  ✗ ")+m)
    if not k: hatalar.append(m)
OKU = """async (ad) => { const k = await navigator.storage.getDirectory(); const d = await k.getDirectoryHandle('MacarZeka Kayitlar'); 
  try { const f = await (await d.getFileHandle(ad)).getFile(); return await f.text(); } catch(e) { return null; } }"""
YEDEKLER = """async () => { const k = await navigator.storage.getDirectory(); const d = await k.getDirectoryHandle('MacarZeka Kayitlar');
  try { const y = await d.getDirectoryHandle('yedekler'); const a=[]; for await (const n of y.keys()) a.push(n); return a; } catch(e) { return []; } }"""
async def main():
    async with async_playwright() as p:
        br=await p.chromium.launch(executable_path=os.environ.get("CHROME","/usr/bin/google-chrome"),args=ARGS)
        ctx=await br.new_context(viewport={"width":1360,"height":880})
        await ctx.add_init_script(open(os.path.join(os.path.dirname(os.path.abspath(__file__)),"fakepeer.js")).read()); await ctx.add_init_script(MOCK)
        pg=await ctx.new_page(); pg.on("pageerror",lambda e:(print("JS HATASI",e),hatalar.append(str(e))))
        pg.on("dialog", lambda d: asyncio.ensure_future(d.accept()))
        await pg.goto(URL)
        print("1) İlk açılış")
        try: await pg.wait_for_selector("#klsPerde", timeout=4000); g=True
        except: g=False
        ok(g, "klasör seçme penceresi çıktı")
        await pg.screenshot(path="ekran-k1-soru.png")
        await pg.click('#klsPerde [data-kls="sec"]')
        await pg.wait_for_function("KlasorKayit._durum().durum==='acik'", timeout=4000)
        ok(True, "klasör bağlandı")
        print("2) Her değişiklikte dosyaya yazma")
        await pg.evaluate("ornekYukle()"); await pg.wait_for_timeout(700)
        t=await pg.evaluate(OKU,"veriler.json")
        ok(t and len(json.loads(t)["musteriler"])==4, "veriler.json'a 4 müşteri yazıldı")
        y=await pg.evaluate(YEDEKLER); print("   yedekler:",y)
        ok(any(n.startswith("veriler-") for n in y), "günlük yedek alındı")
        await pg.evaluate("veri.musteriler[0].tel='0500 000'; kaydet();"); await pg.wait_for_timeout(600)
        t=await pg.evaluate(OKU,"veriler.json")
        ok("0500 000" in t, "düzenleme anında dosyaya geçti")
        d=await pg.evaluate("document.getElementById('durum').innerText"); print("   sol alt:",d.replace("\n"," | "))
        ok("Kaydedildi" in d and "MacarZeka Kayitlar" in d, "sol altta klasör adı ve saat görünüyor")
        await pg.click('[data-git="ayarlar"]'); await pg.wait_for_timeout(200)
        await pg.screenshot(path="ekran-k2-ayarlar.png")
        print("3) Yenileme")
        await pg.reload(); await pg.wait_for_timeout(800)
        ok(await pg.evaluate("KlasorKayit._durum().durum")=="acik" and await pg.evaluate("veri.musteriler.length")==4, "yenileyince klasör hatırlandı")
        ok(not await pg.query_selector("#klsPerde"), "tekrar sormadı")
        print("4) Edge verisi silindi")
        await pg.evaluate("localStorage.clear();")
        await pg.reload(); await pg.wait_for_timeout(300)
        ok(await pg.evaluate("veri.musteriler.length")==0, "tarayıcı boş açıldı")
        await pg.wait_for_selector("#klsPerde", timeout=4000)
        await pg.click('#klsPerde [data-kls="sec"]')
        await pg.wait_for_load_state("load"); await pg.wait_for_timeout(1200)
        ok(await pg.evaluate("veri.musteriler.length")==4, "aynı klasör seçilince kayıtlar geri geldi")
        ok(await pg.evaluate("veri.musteriler[0].tel")=="0500 000", "son değişiklik dahil")
        print("5) Klasör başka, tarayıcı başka veri")
        await pg.evaluate("""(async()=>{ const k=await navigator.storage.getDirectory(); const d=await k.getDirectoryHandle('MacarZeka Kayitlar');
           const w=await (await d.getFileHandle('veriler.json')).createWritable(); await w.write(JSON.stringify({surum:1,kz:Date.now()+999999,musteriler:[{id:'x1',ad:'Klasördeki Kişi',notlar:[]}],satislar:[],odemeler:[]})); await w.close(); })()""")
        await pg.evaluate("localStorage.removeItem('__klasor'); localStorage.removeItem('macarzeka_klasor_sonra');")
        await pg.reload(); await pg.wait_for_selector("#klsPerde", timeout=4000); await pg.click('#klsPerde [data-kls="sec"]')
        ok(await pg.wait_for_selector('[data-kls="secimTamam"]', timeout=3000) is not None, "hangisini kullanayım diye sordu")
        await pg.screenshot(path="ekran-k3-secim.png")
        await pg.click('input[value="yerel"]'); await pg.click('[data-kls="secimTamam"]'); await pg.wait_for_timeout(800)
        t=await pg.evaluate(OKU,"veriler.json")
        ok(len(json.loads(t)["musteriler"])==4, "bu bilgisayardaki klasöre yazıldı")
        y=await pg.evaluate(YEDEKLER)
        ok(any("degistirilmeden" in n for n in y), "eski dosya yedeklere kopyalandı")
        print("6) Klasör dosyası daha yeni (başka yerden güncellenmiş)")
        await pg.evaluate("""(async()=>{ const k=await navigator.storage.getDirectory(); const d=await k.getDirectoryHandle('MacarZeka Kayitlar');
           const v=JSON.parse(await (await (await d.getFileHandle('veriler.json')).getFile()).text()); v.musteriler.push({id:'yeni9',ad:'Dosyada Yeni',notlar:[]}); v.kz=Date.now()+5000;
           const w=await (await d.getFileHandle('veriler.json')).createWritable(); await w.write(JSON.stringify(v)); await w.close(); })()""")
        await pg.reload(); await pg.wait_for_timeout(900)
        ok(await pg.evaluate("veri.musteriler.some(m=>m.id==='yeni9')"), "açılışta klasördeki yeni hâl yüklendi")
        await br.close()
    print("\nSONUÇ:", "HEPSİ GEÇTİ" if not hatalar else f"{len(hatalar)} HATA: "+"; ".join(hatalar))
asyncio.run(main())
