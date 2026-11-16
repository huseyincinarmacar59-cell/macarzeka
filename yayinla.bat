@echo off
chcp 65001 >nul
setlocal enabledelayedexpansion

rem ============================================================
rem  MacarZeka - tek komutla surum yayimlama (Windows)
rem
rem  Kullanim:   yayinla 1.4
rem
rem  Yaptigi is:
rem    1. Bekleyen degisiklikleri commit eder
rem    2. main dalini gonderir
rem    3. v1.4 etiketini olusturur ve gonderir
rem    4. GitHub derleyip surumu yayimlar (1-2 dakika)
rem
rem  Musteri kayitlarina (veriler.json) HIC dokunmaz; o dosya
rem  zaten depoya girmez.
rem ============================================================

if "%~1"=="" (
  echo.
  echo   Surum numarasi vermedin.
  echo.
  echo   Kullanim:  yayinla 1.4
  echo.
  exit /b 1
)

set "SURUM=%~1"
if "!SURUM:~0,1!"=="v" set "SURUM=!SURUM:~1!"

rem --- numara dogru bicimde mi? (1.4 veya 1.4.2) ---
echo !SURUM!| findstr /r /c:"^[0-9][0-9]*\.[0-9][0-9]*$" /c:"^[0-9][0-9]*\.[0-9][0-9]*\.[0-9][0-9]*$" >nul
if errorlevel 1 (
  echo.
  echo   "!SURUM!" gecerli bir surum numarasi degil.
  echo   Ornek: 1.4  veya  1.4.2
  echo.
  exit /b 1
)

where git >nul 2>&1
if errorlevel 1 (
  echo.
  echo   Bu bilgisayarda git kurulu degil.
  echo   Kurmak istemiyorsan GitHub uzerinden tek tikla yayimla:
  echo     Actions -^> "Surum yayimla" -^> "Run workflow" -^> !SURUM!
  echo.
  exit /b 1
)

git rev-parse --is-inside-work-tree >nul 2>&1
if errorlevel 1 (
  echo.
  echo   Bu klasor bir git deposu degil. macarzeka klasorunde calistir.
  echo.
  exit /b 1
)

echo.
echo   === MacarZeka !SURUM! yayimlaniyor ===
echo.

rem --- ayni surum zaten var mi? ---
git rev-parse -q --verify "refs/tags/v!SURUM!" >nul 2>&1
if not errorlevel 1 (
  echo   v!SURUM! etiketi zaten var. Daha buyuk bir numara ver.
  echo.
  exit /b 1
)

rem --- bekleyen degisiklik varsa commit et ---
git diff --quiet && git diff --cached --quiet
if errorlevel 1 (
  echo   [1/4] Degisiklikler kaydediliyor...
  git add -A
  git commit -q -m "Surum !SURUM!"
  if errorlevel 1 ( echo   Commit yapilamadi. & exit /b 1 )
) else (
  echo   [1/4] Bekleyen degisiklik yok.
)

echo   [2/4] Kod gonderiliyor...
git push -q origin HEAD
if errorlevel 1 ( echo   Kod gonderilemedi. Internet baglantisini kontrol et. & exit /b 1 )

echo   [3/4] v!SURUM! etiketi olusturuluyor...
git tag "v!SURUM!"
if errorlevel 1 ( echo   Etiket olusturulamadi. & exit /b 1 )

echo   [4/4] Etiket gonderiliyor...
git push -q origin "refs/tags/v!SURUM!"
if errorlevel 1 (
  echo   Etiket gonderilemedi, geri alindi.
  git tag -d "v!SURUM!" >nul 2>&1
  exit /b 1
)

echo.
echo   Tamam. GitHub simdi derliyor, 1-2 dakika surer.
echo.
echo   Takip et:
echo     https://github.com/huseyincinarmacar59-cell/macarzeka/actions
echo.
echo   Bitince surum burada olacak:
echo     https://github.com/huseyincinarmacar59-cell/macarzeka/releases/tag/v!SURUM!
echo.
echo   Kurulu programlar acilista bu surumu gorup guncelleme teklif edecek.
echo.
endlocal
