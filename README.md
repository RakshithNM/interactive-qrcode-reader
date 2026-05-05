# interactive-qrcode-reader

An interactive web app that shows how a QR code is built from text.

## What it does

- Turns text into a live, scannable QR code
- Breaks the input into QR segments and encoding chunks
- Shows how data bytes become QR blocks and error-correction codewords
- Highlights finder, timing, alignment, format, version, and data modules
- Lets you click segments, blocks, legend items, and modules to inspect them

## Run locally

```bash
npm install
npm run dev
```

## Build

```bash
npm run build
```
