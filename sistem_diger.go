//go:build !windows

package main

import (
	"fmt"
	"os"
	"os/exec"
	"path/filepath"
	"runtime"
)

func hataGoster(mesaj string) { fmt.Println("HATA: " + mesaj) }

func klasorAc(yol string) {
	if runtime.GOOS == "darwin" {
		exec.Command("open", yol).Start()
		return
	}
	exec.Command("xdg-open", yol).Start()
}

func varsayilanTarayicidaAc(adres string) {
	if runtime.GOOS == "darwin" {
		exec.Command("open", adres).Start()
		return
	}
	exec.Command("xdg-open", adres).Start()
}

func kendiniDegistirebilir() bool { return true }

// ELF (Linux) veya Mach-O (macOS) imzası.
func programImzasiTamam(v []byte) bool {
	if len(v) < 4 {
		return false
	}
	if v[0] == 0x7f && v[1] == 'E' && v[2] == 'L' && v[3] == 'F' {
		return true
	}
	switch {
	case v[0] == 0xCF && v[1] == 0xFA && v[2] == 0xED && v[3] == 0xFE,
		v[0] == 0xCE && v[1] == 0xFA && v[2] == 0xED && v[3] == 0xFE,
		v[0] == 0xCA && v[1] == 0xFE && v[2] == 0xBA && v[3] == 0xBE:
		return true
	}
	return false
}

func yenidenBaslat() error {
	exe, err := os.Executable()
	if err != nil {
		return err
	}
	c := exec.Command(exe)
	c.Dir = filepath.Dir(exe)
	return c.Start()
}
