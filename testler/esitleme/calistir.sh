#!/usr/bin/env bash
# Bilgisayar eşleştirme uçtan uca testi.
# İki ayrı tarayıcı profili açılır, 6 haneli kodla eşleşir; canlı değişiklik,
# çakışma, çevrimdışı birleşme, silme ve yenileme senaryoları denenir.
set -euo pipefail
cd "$(dirname "$0")"
KOK=../..
rm -rf site && mkdir site
cp $KOK/index.html $KOK/*.png $KOK/manifest.json site/
# Test sayfası sahte tanışma sunucusuna (ws://127.0.0.1:9100) bağlanabilsin diye CSP kaldırılır.
python3 -c "import re;p='site/index.html';s=open(p).read();open(p,'w').write(re.sub(r'<meta http-equiv=\"Content-Security-Policy\"[^>]*>','',s,count=1))"
node relay.js & R=$!
(cd site && python3 -m http.server 8123 >/dev/null 2>&1) & H=$!
trap 'kill $R $H 2>/dev/null; rm -rf site' EXIT
sleep 1
python3 test_esitleme.py
