#!/usr/bin/env bash
# ============================================================
#  MacarZeka — tek komutla sürüm yayımlama
#
#  Kullanım:   ./yayinla.sh 1.4
#
#  Yaptığı iş:
#    1. Bekleyen değişiklikleri commit eder
#    2. main dalını gönderir
#    3. v1.4 etiketini oluşturur ve gönderir
#    4. GitHub derleyip sürümü yayımlar (1-2 dakika)
#
#  Müşteri kayıtlarına (veriler.json) HİÇ dokunmaz; o dosya
#  zaten .gitignore'da, depoya girmez.
# ============================================================
set -euo pipefail

DEPO="huseyincinarmacar59-cell/macarzeka"

hata() { printf '\n  %s\n\n' "$1" >&2; exit 1; }

[ $# -ge 1 ] || hata "Sürüm numarası vermedin.  Kullanım: ./yayinla.sh 1.4"

SURUM="${1#v}"

printf '%s' "$SURUM" | grep -Eq '^[0-9]+(\.[0-9]+){1,2}$' \
  || hata "\"$SURUM\" geçerli bir sürüm numarası değil. Örnek: 1.4 veya 1.4.2"

command -v git >/dev/null 2>&1 \
  || hata "git kurulu değil. GitHub'dan tek tıkla yayımla: Actions → Sürüm yayımla → Run workflow"

git rev-parse --is-inside-work-tree >/dev/null 2>&1 \
  || hata "Bu klasör bir git deposu değil. macarzeka klasöründe çalıştır."

printf '\n  === MacarZeka %s yayımlanıyor ===\n\n' "$SURUM"

if git rev-parse -q --verify "refs/tags/v$SURUM" >/dev/null; then
  hata "v$SURUM etiketi zaten var. Daha büyük bir numara ver."
fi
if git ls-remote --exit-code --tags origin "refs/tags/v$SURUM" >/dev/null 2>&1; then
  hata "v$SURUM GitHub'da zaten yayımlanmış. Daha büyük bir numara ver."
fi

if ! git diff --quiet || ! git diff --cached --quiet; then
  echo "  [1/4] Değişiklikler kaydediliyor..."
  git add -A
  git commit -q -m "Sürüm $SURUM"
else
  echo "  [1/4] Bekleyen değişiklik yok."
fi

echo "  [2/4] Kod gönderiliyor..."
git push -q origin HEAD

echo "  [3/4] v$SURUM etiketi oluşturuluyor..."
git tag "v$SURUM"

echo "  [4/4] Etiket gönderiliyor..."
if ! git push -q origin "refs/tags/v$SURUM"; then
  git tag -d "v$SURUM" >/dev/null 2>&1 || true
  hata "Etiket gönderilemedi, geri alındı."
fi

cat <<BILGI

  Tamam. GitHub şimdi derliyor, 1-2 dakika sürer.

  Takip et:
    https://github.com/$DEPO/actions

  Bitince sürüm burada olacak:
    https://github.com/$DEPO/releases/tag/v$SURUM

  Kurulu programlar açılışta bu sürümü görüp güncelleme teklif edecek.

BILGI
