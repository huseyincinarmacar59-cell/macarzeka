import asyncio, json, sys, os
from playwright.async_api import async_playwright

URL = "http://mz.test:8123/index.html"
FAKE = open(os.path.join(os.path.dirname(os.path.abspath(__file__)),"fakepeer.js")).read()
hatalar = []

def ok(kosul, mesaj):
    print(("  ✓ " if kosul else "  ✗ ") + mesaj)
    if not kosul: hatalar.append(mesaj)

async def bekle(page, js, sure=8000):
    try:
        await page.wait_for_function(js, timeout=sure); return True
    except Exception:
        return False

async def sayilar(page):
    return await page.evaluate("({m:veri.musteriler.length,s:veri.satislar.length,o:veri.odemeler.length,n:veri.musteriler.reduce((a,m)=>a+(m.notlar||[]).length,0)})")

async def imza(page):
    return await page.evaluate("""JSON.stringify({
      m: veri.musteriler.map(m=>({...m, notlar:(m.notlar||[]).slice().sort((a,b)=>a.id<b.id?-1:1)})).sort((a,b)=>a.id<b.id?-1:1),
      s: veri.satislar.slice().sort((a,b)=>a.id<b.id?-1:1),
      o: veri.odemeler.slice().sort((a,b)=>a.id<b.id?-1:1)})""")

async def main():
    async with async_playwright() as p:
        br = await p.chromium.launch(executable_path=os.environ.get("CHROME","/usr/bin/google-chrome"), args=["--no-sandbox","--host-resolver-rules=MAP mz.test 127.0.0.1","--unsafely-treat-insecure-origin-as-secure=http://mz.test:8123"])
        sayfalar = []
        for ad in ["A", "B"]:
            ctx = await br.new_context(viewport={"width": 1360, "height": 880})
            await ctx.add_init_script(FAKE)
            pg = await ctx.new_page()
            pg.on("pageerror", lambda e, ad=ad: (print(f"  [{ad} JS HATASI] {e}"), hatalar.append(f"{ad} JS: {e}")))
            pg.on("dialog", lambda d: asyncio.ensure_future(d.accept()))
            await pg.goto(URL); await pg.wait_for_timeout(400)
            sayfalar.append(pg)
        A, B = sayfalar

        print("1) Başlangıç verisi")
        await A.evaluate("ornekYukle()")
        await B.evaluate("""(()=>{ veri.musteriler.push({id:'bmus1',ad:'Hasan Kaya',tel:'0535',koy:'Yenice',arazi:'',hesapSahibiId:null,iliski:'',notlar:[{id:'bnot1',tarih:'2026-11-20',metin:'B notu'}]});
            veri.satislar.push({id:'bsat1',musteriId:'bmus1',urun:'Tohum',miktar:'1',tarih:'2026-11-20',tutar:500,vade:'',vadeNot:''}); kaydet(); ciz(); })()""")
        a0, b0 = await sayilar(A), await sayilar(B)
        print("   A:", a0, " B:", b0)

        print("2) Eşleştirme")
        await A.click('[data-git="ayarlar"]'); await B.click('[data-git="ayarlar"]')
        await A.click('#ekran [data-esl="ac"]')
        await A.screenshot(path="ekran-1-ana.png")
        await A.click('[data-esl="kodOlustur"]')
        ok(await bekle(A, "document.querySelectorAll('.esl-kod span:not(.ara)').length===6"), "A kod gösterdi")
        kod = await A.evaluate("[...document.querySelectorAll('.esl-kod span:not(.ara)')].map(x=>x.textContent).join('')")
        print("   kod:", kod)
        await A.screenshot(path="ekran-2-kod.png")
        await B.click('#ekran [data-esl="ac"]'); await B.click('[data-esl="kodGirEkrani"]')
        await B.fill("#eslAdGir", "Ofis")
        await B.click('[data-esl-hane="0"]')
        await B.keyboard.type(kod, delay=40)
        await B.screenshot(path="ekran-3-gir.png")
        ok(await B.evaluate("!document.getElementById('eslGirBtn').disabled"), "Eşleştir düğmesi açıldı")
        await B.click("#eslGirBtn")
        ok(await bekle(A, "!!document.querySelector('[data-esl=\"onayla\"]')"), "A'ya onay isteği geldi")
        await A.screenshot(path="ekran-4-onay.png")
        await B.screenshot(path="ekran-5-bekle.png")
        await A.click('[data-esl="onayla"]')
        ok(await bekle(B, "!!document.querySelector('.esl-tamam')", 10000), "B'de 'Eşleşti' görüldü")
        await B.screenshot(path="ekran-6-tamam.png")
        await A.wait_for_timeout(800)
        a1, b1 = await sayilar(A), await sayilar(B)
        print("   A:", a1, " B:", b1)
        ok(a1 == b1 and a1["m"] == a0["m"] + b0["m"] and a1["s"] == a0["s"] + b0["s"], "kayıtlar birleşti (hiçbiri kaybolmadı)")
        ok(await imza(A) == await imza(B), "iki taraf birebir aynı")
        await B.click('[data-esl="yonet"]')
        await B.screenshot(path="ekran-7-yonet.png")
        await A.click('[data-esl="yonet"]'); await A.click('[data-esl="kapat"]'); await B.click('[data-esl="kapat"]')

        print("3) Canlı değişiklik")
        await A.evaluate("veri.satislar.push({id:'canli1',musteriId:'bmus1',urun:'Gübre',miktar:'2',tarih:'2026-11-26',tutar:1200,vade:'',vadeNot:''}); kaydet(); ciz();")
        ok(await bekle(B, "veri.satislar.some(s=>s.id==='canli1')", 4000), "A'daki yeni satış B'ye geçti")
        oid = await B.evaluate("veri.odemeler[0].id")
        await B.evaluate(f"veri.odemeler=veri.odemeler.filter(x=>x.id!=='{oid}'); kaydet(); ciz();")
        ok(await bekle(A, f"!veri.odemeler.some(x=>x.id==='{oid}')", 4000), "B'de silinen ödeme A'dan da silindi")
        await B.evaluate("msAl('bmus1').notlar.push({id:'canlinot',tarih:'2026-11-26',metin:'canlı not'}); kaydet();")
        ok(await bekle(A, "msAl('bmus1').notlar.some(n=>n.id==='canlinot')", 4000), "not eşitlendi")
        await A.evaluate("msAl('bmus1').tel='0555 999'; kaydet();")
        ok(await bekle(B, "msAl('bmus1').tel==='0555 999' && msAl('bmus1').notlar.length===2", 4000), "müşteri düzenlemesi geçti, notlar korundu")
        # ekranda görünüyor mu
        await B.click('[data-git="musteriler"]'); await B.wait_for_timeout(200)
        await A.evaluate("veri.musteriler.push({id:'ekran1',ad:'Ekranda Görünen',tel:'',koy:'',arazi:'',hesapSahibiId:null,iliski:'',notlar:[]}); kaydet(); ciz();")
        ok(await bekle(B, "document.getElementById('ekran').innerText.includes('Ekranda Görünen')", 4000), "B'nin ekranı kendiliğinden yenilendi")
        await B.screenshot(path="ekran-8-liste.png")

        print("4) Yazarken ekran bozulmuyor")
        await B.click('[data-git="yeni"]'); await B.wait_for_timeout(200)
        alan = await B.evaluate("(()=>{const i=document.querySelector('#ekran input[type=text], #ekran input:not([type])'); return i? (i.id||'?') : null})()")
        if alan:
            await B.fill('#' + alan, 'Yazılıyor')
            await A.evaluate("veri.satislar.push({id:'yazar1',musteriId:'bmus1',urun:'X',miktar:'',tarih:'2026-11-26',tutar:10,vade:'',vadeNot:''}); kaydet();")
            await B.wait_for_timeout(1500)
            ok(await B.evaluate(f"document.getElementById('{alan}') && document.getElementById('{alan}').value==='Yazılıyor'"), "form alanındaki yazı silinmedi")
            ok(await B.evaluate("veri.satislar.some(s=>s.id==='yazar1')"), "veri yine de geldi")
        await B.click('[data-git="panel"]')

        print("5) Biri kapalıyken değişiklik + çakışma")
        await B.evaluate("window.__cevrimdisi(true)")
        await A.wait_for_timeout(500)
        await A.evaluate("veri.musteriler.push({id:'off1',ad:'Çevrimdışı Eklenen',tel:'',koy:'',arazi:'',hesapSahibiId:null,iliski:'',notlar:[]}); kaydet();")
        await B.evaluate("veri.musteriler.push({id:'off2',ad:'B Kapalıyken',tel:'',koy:'',arazi:'',hesapSahibiId:null,iliski:'',notlar:[]}); kaydet();")
        await B.evaluate("msAl('bmus1').koy='B köyü'; kaydet();")
        await A.wait_for_timeout(30)
        await A.evaluate("msAl('bmus1').koy='A köyü (daha yeni)'; kaydet();")
        # A, B kapalıyken müşteriyi siler; B o müşteriye satış ekler
        await A.evaluate("veri.musteriler.push({id:'silinecek',ad:'Silinecek',tel:'',koy:'',arazi:'',hesapSahibiId:null,iliski:'',notlar:[]}); kaydet();")
        await A.wait_for_timeout(100)
        await B.screenshot(path="ekran-9-cevrimdisi.png")
        await B.evaluate("window.__cevrimdisi(false)")
        ok(await bekle(B, "veri.musteriler.some(m=>m.id==='off1')", 15000), "B açılınca kaçırdığı kayıt geldi")
        ok(await bekle(A, "veri.musteriler.some(m=>m.id==='off2')", 8000), "A da B'nin kayıtlarını aldı")
        await A.wait_for_timeout(800)
        ok(await A.evaluate("msAl('bmus1').koy") == "A köyü (daha yeni)" and await B.evaluate("msAl('bmus1').koy") == "A köyü (daha yeni)", "çakışmada en son değişiklik kazandı")
        ok(await imza(A) == await imza(B), "iki taraf yine birebir aynı")

        await B.evaluate("window.__cevrimdisi(true)"); await A.wait_for_timeout(300)
        await A.evaluate("""(()=>{const mid='silinecek'; veri.musteriler=veri.musteriler.filter(x=>x.id!==mid); veri.satislar=veri.satislar.filter(x=>x.musteriId!==mid); kaydet();})()""")
        await B.evaluate("veri.satislar.push({id:'yetim1',musteriId:'silinecek',urun:'Y',miktar:'',tarih:'2026-11-26',tutar:99,vade:'',vadeNot:''}); msAl('silinecek').notlar.push({id:'yetimnot',tarih:'2026-11-26',metin:'x'}); kaydet();")
        await B.evaluate("window.__cevrimdisi(false)")
        await bekle(B, "Object.values(Esitleme._durum().baglar).some(b=>b.dogru && b.esitlendi)", 30000)
        await A.wait_for_timeout(1500)
        ok(not await A.evaluate("veri.satislar.some(s=>s.id==='yetim1')") and not await B.evaluate("veri.satislar.some(s=>s.id==='yetim1') || veri.musteriler.some(m=>m.id==='silinecek')"), "silinen müşteriye eklenen satış iki tarafta da temizlendi")
        ok(await imza(A) == await imza(B), "silme sonrası iki taraf aynı")

        print("6) Yenileme sonrası kalıcılık")
        await B.reload(); await B.wait_for_timeout(500)
        ok(await bekle(B, "Esitleme._durum().M.grup && Object.values(Esitleme._durum().baglar).some(b=>b.dogru)", 15000), "B yenilenince kendiliğinden yeniden bağlandı")
        await A.evaluate("veri.satislar.push({id:'sonra1',musteriId:'bmus1',urun:'Z',miktar:'',tarih:'2026-11-26',tutar:5,vade:'',vadeNot:''}); kaydet();")
        ok(await bekle(B, "veri.satislar.some(s=>s.id==='sonra1')", 5000), "yenilemeden sonra canlı eşitleme sürüyor")
        cip = await B.evaluate("document.getElementById('eslCip').innerText")
        print("   kenar çubuğu:", cip.replace("\n", " | "))
        ok("Eşitlendi" in cip, "kenar çubuğu 'Eşitlendi' gösteriyor")
        await B.screenshot(path="ekran-10-cip.png")

        print("7) Yedekten geri yükleme eşleşmeyi bozmuyor")
        await B.evaluate("(()=>{const v=JSON.parse(JSON.stringify(veri)); delete v.esitleme; v.musteriler.push({id:'yedek1',ad:'Yedekten',tel:'',koy:'',arazi:'',hesapSahibiId:null,iliski:'',notlar:[]}); var lis=veri.lisans; veri=v; if(lis) veri.lisans=lis; kaydet(); ciz();})()")
        ok(await bekle(A, "veri.musteriler.some(m=>m.id==='yedek1')", 5000), "yedek yükleme sonrası eşitleme çalışıyor")
        ok(await B.evaluate("!!(veri.esitleme && veri.esitleme.grup)"), "eşleşme bilgisi korundu")

        print("8) Eşleşmeyi kaldırma")
        await B.click('[data-git="ayarlar"]'); await B.click('#ekran [data-esl="ac"]'); await B.click('[data-esl="ayril"]')
        ok(await bekle(A, "Object.keys(Esitleme._durum().M.grup.uyeler).length===1", 6000), "A, B'nin ayrıldığını öğrendi")
        await B.wait_for_timeout(600)
        ok(await B.evaluate("!veri.esitleme.grup") and await B.evaluate("veri.musteriler.length>0"), "B'de kayıtlar duruyor, eşleşme yok")
        await A.click('[data-git="ayarlar"]'); await A.click('#ekran [data-esl="ac"]'); await A.wait_for_timeout(200)
        await A.screenshot(path="ekran-11-tek.png")

        # mobil görünüm
        await B.set_viewport_size({"width": 390, "height": 844})
        await B.click('[data-esl="kodOlustur"]') if await B.query_selector('[data-esl="kodOlustur"]') else None
        await B.wait_for_timeout(500)
        await B.screenshot(path="ekran-12-mobil.png")
        await br.close()
    print("\nSONUÇ:", "HEPSİ GEÇTİ" if not hatalar else f"{len(hatalar)} HATA: " + "; ".join(hatalar))

asyncio.run(main())
