# Image Splitter

Web app untuk memotong gambar kolase/grid menjadi cell-cell individual — dengan deteksi otomatis berbasis Kimi AI atau split manual.

## Features

- **Auto mode** — Kimi AI (kimi-k2.5) mendeteksi jumlah baris & kolom secara otomatis, lalu seam detection menyempurnakan posisi potongan di tengah separator
- **Manual mode** — Tentukan sendiri jumlah baris & kolom, split presisi tanpa AI
- **Seam detection** — Snap posisi potongan ke tengah separator band (hanya untuk gambar dengan separator; edge-to-edge pakai uniform split)
- **Trim borders** — Hapus sisa piksel separator dari tiap cell setelah dipotong
- **Upscale** — Perbesar tiap cell hingga 4× menggunakan Lanczos resampling
- **Output quality** — PNG lossless atau JPEG 1–100%
- **Download** — Per-cell atau ZIP semua sekaligus
- **Reassemble** — Susun ulang cell dengan drag-and-drop, atur ulang grid, lalu export
- **Dark / Light mode**

## Stack

- Next.js 15 (App Router) · TypeScript · Tailwind CSS v4 · shadcn/ui
- Sharp (server-side image processing)
- Kimi AI — model `kimi-k2.5` via Moonshot API

## Setup

```bash
npm install
```

Buat file `.env`:

```env
MOONSHOT_API_KEY=sk-...
```

Jalankan dev server:

```bash
npm run dev
```

## Usage

1. Upload gambar kolase
2. Pilih mode:
   - **Auto** — biarkan Kimi AI mendeteksi grid (butuh API key)
   - **Manual** — isi rows & cols sendiri
3. Atur opsi (trim, upscale, quality)
4. Klik **Split Image**
5. Download cell individual atau ZIP

## Kimi AI

- Dipakai hanya di **Auto mode** untuk mendeteksi jumlah baris & kolom
- Model: `kimi-k2.5` (1T params, 32B active, native multimodal)
- Limit produksi: **3 request/hari** per user (reset tiap hari)
- Di development (`NODE_ENV=development`) tidak ada limit

## Supported Images

| Tipe | Contoh | Mode yang disarankan |
|------|--------|----------------------|
| Grid dengan separator (putih/abu) | Instagram collage dengan border | Auto atau Manual |
| Edge-to-edge (tanpa separator) | Foto disusun langsung tanpa gap | Manual (isi rows & cols) |

## Environment Variables

| Variable | Keterangan |
|----------|------------|
| `MOONSHOT_API_KEY` | API key Moonshot untuk Kimi AI (wajib untuk Auto mode) |
