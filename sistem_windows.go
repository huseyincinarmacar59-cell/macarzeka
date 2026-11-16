//go:build windows

package main

import (
	"os"
	"os/exec"
	"path/filepath"
	"syscall"
	"unsafe"
)

var (
	user32      = syscall.NewLazyDLL("user32.dll")
	mesajKutusu = user32.NewProc("MessageBoxW")
)

// Konsol penceresi olmadığı için hatayı Windows mesaj kutusunda gösterir.
func hataGoster(mesaj string) {
	b, _ := syscall.UTF16PtrFromString(mesaj)
	bas, _ := syscall.UTF16PtrFromString("MacarZeka")
	mesajKutusu.Call(0, uintptr(unsafe.Pointer(b)), uintptr(unsafe.Pointer(bas)), 0x00000010)
}

func klasorAc(yol string) {
	c := exec.Command("explorer.exe", yol)
	c.SysProcAttr = &syscall.SysProcAttr{HideWindow: true}
	c.Start()
}

func varsayilanTarayicidaAc(adres string) {
	c := exec.Command("rundll32", "url.dll,FileProtocolHandler", adres)
	c.SysProcAttr = &syscall.SysProcAttr{HideWindow: true}
	c.Start()
}

func kendiniDegistirebilir() bool { return true }

// Windows programı "MZ" imzasıyla başlar.
func programImzasiTamam(v []byte) bool {
	return len(v) > 2 && v[0] == 'M' && v[1] == 'Z'
}

// Güncellenmiş programı başlatır; bu kopya hemen ardından kapanır.
func yenidenBaslat() error {
	exe, err := os.Executable()
	if err != nil {
		return err
	}
	c := exec.Command(exe)
	c.Dir = filepath.Dir(exe)
	c.SysProcAttr = &syscall.SysProcAttr{HideWindow: true}
	return c.Start()
}
