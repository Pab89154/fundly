/**
 * Read a statement file and return plain text for the parser.
 * PDF: pdf.js text layer first, then Tesseract OCR if the PDF is a scan/image.
 */

function decodeBuffer(buf: ArrayBuffer): string {
  const bytes = new Uint8Array(buf)
  if (bytes.length >= 3 && bytes[0] === 0xef && bytes[1] === 0xbb && bytes[2] === 0xbf) {
    return new TextDecoder('utf-8').decode(bytes.subarray(3))
  }
  if (bytes.length >= 2 && bytes[0] === 0xff && bytes[1] === 0xfe) {
    return new TextDecoder('utf-16le').decode(bytes.subarray(2))
  }
  try {
    return new TextDecoder('utf-8', { fatal: true }).decode(bytes)
  } catch {
    return new TextDecoder('latin1').decode(bytes)
  }
}

function usefulTextScore(text: string): number {
  const lines = text
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean)
  let score = 0
  for (const line of lines) {
    if (/\d{1,4}[-/.]\d{1,2}[-/.]\d{2,4}/.test(line) && /\$?\d/.test(line)) score += 3
    else if (/\$\s?\d|\d+\.\d{2}/.test(line)) score += 1
  }
  return score
}

async function loadPdfJs() {
  const pdfjs = await import('pdfjs-dist')
  const pdfWorker = (await import('pdfjs-dist/build/pdf.worker.min.mjs?url')).default
  pdfjs.GlobalWorkerOptions.workerSrc = pdfWorker
  return pdfjs
}

async function extractPdfTextLayer(data: Uint8Array): Promise<string> {
  const { getDocument } = await loadPdfJs()
  // Copy so the worker transfer doesn't detach the caller's buffer.
  const loadingTask = getDocument({ data: data.slice(), useSystemFonts: true })
  const pdf = await loadingTask.promise
  const parts: string[] = []

  for (let pageNum = 1; pageNum <= pdf.numPages; pageNum++) {
    const page = await pdf.getPage(pageNum)
    const content = await page.getTextContent()
    type Frag = { x: number; str: string }
    const lineMap = new Map<number, Frag[]>()

    for (const item of content.items) {
      if (!('str' in item) || !item.str?.trim()) continue
      const transform = 'transform' in item ? item.transform : null
      const x = transform ? Number(transform[4]) || 0 : 0
      const y = transform ? Number(transform[5]) || 0 : 0
      const bucket = Math.round(y / 4) * 4
      const list = lineMap.get(bucket) ?? []
      list.push({ x, str: item.str })
      lineMap.set(bucket, list)
    }

    const sortedY = [...lineMap.keys()].sort((a, b) => b - a)
    for (const y of sortedY) {
      const frags = (lineMap.get(y) ?? []).sort((a, b) => a.x - b.x)
      const line = frags
        .map((f) => f.str)
        .join(' ')
        .replace(/\s+/g, ' ')
        .trim()
      if (line) parts.push(line)
    }
    parts.push('')
  }

  return parts.join('\n').trim()
}

async function extractPdfWithOcr(data: Uint8Array, onProgress?: (msg: string) => void): Promise<string> {
  const { createWorker } = await import('tesseract.js')
  const { getDocument } = await loadPdfJs()
  const loadingTask = getDocument({ data: data.slice(), useSystemFonts: true })
  const pdf = await loadingTask.promise
  const maxPages = Math.min(pdf.numPages, 12)
  const worker = await createWorker('eng')
  const pages: string[] = []

  try {
    for (let pageNum = 1; pageNum <= maxPages; pageNum++) {
      onProgress?.(`OCR page ${pageNum} of ${maxPages}…`)
      const page = await pdf.getPage(pageNum)
      const viewport = page.getViewport({ scale: 2 })
      const canvas = document.createElement('canvas')
      canvas.width = Math.ceil(viewport.width)
      canvas.height = Math.ceil(viewport.height)
      const ctx = canvas.getContext('2d')
      if (!ctx) continue

      await page.render({ canvas, canvasContext: ctx, viewport }).promise

      const {
        data: { text },
      } = await worker.recognize(canvas)
      if (text.trim()) pages.push(text.trim())
    }
  } finally {
    await worker.terminate()
  }

  return pages.join('\n\n').trim()
}

async function extractPdfText(
  buf: ArrayBuffer,
  onProgress?: (msg: string) => void,
): Promise<string> {
  const data = new Uint8Array(buf)

  onProgress?.('Reading PDF text…')
  let text = ''
  try {
    text = await extractPdfTextLayer(data)
  } catch (err) {
    console.warn('[pdf] text layer failed', err)
  }

  if (usefulTextScore(text) >= 2 || text.length > 200) {
    return text
  }

  // Scanned / image PDF — OCR
  onProgress?.('No text layer found — running OCR (may take a bit)…')
  try {
    const ocr = await extractPdfWithOcr(data, onProgress)
    if (ocr.trim()) return ocr
  } catch (err) {
    console.warn('[pdf] OCR failed', err)
  }

  if (text.trim()) return text
  throw new Error(
    'Could not read that PDF even with OCR. Try exporting a CSV from your bank or Apple Cash.',
  )
}

function ofxToCsvish(text: string): string {
  const rows = ['date,amount,description']
  const blocks = text.split(/<STMTTRN>/i).slice(1)
  for (const block of blocks) {
    const date =
      block.match(/<DTPOSTED>(\d{8})/i)?.[1] ||
      block.match(/<DTUSER>(\d{8})/i)?.[1] ||
      ''
    const amount = block.match(/<TRNAMT>([-+]?\d+(?:\.\d+)?)/i)?.[1] || ''
    const name =
      block.match(/<NAME>([^<\r\n]+)/i)?.[1]?.trim() ||
      block.match(/<MEMO>([^<\r\n]+)/i)?.[1]?.trim() ||
      'OFX import'
    if (!date || !amount) continue
    const iso = `${date.slice(0, 4)}-${date.slice(4, 6)}-${date.slice(6, 8)}`
    rows.push(`${iso},${amount},${name.replace(/,/g, ' ')}`)
  }
  return rows.length > 1 ? rows.join('\n') : text
}

export type StatementFileResult = {
  fileName: string
  text: string
  kind: 'csv' | 'ofx' | 'pdf' | 'text'
}

export type ReadStatementOptions = {
  onProgress?: (msg: string) => void
}

export async function readStatementFile(
  file: File,
  options?: ReadStatementOptions,
): Promise<StatementFileResult> {
  const name = file.name || 'statement'
  const lower = name.toLowerCase()
  const buf = await file.arrayBuffer()

  if (lower.endsWith('.pdf') || file.type === 'application/pdf') {
    const text = await extractPdfText(buf, options?.onProgress)
    return { fileName: name, text, kind: 'pdf' }
  }

  let text = decodeBuffer(buf)

  if (lower.endsWith('.ofx') || lower.endsWith('.qfx') || /OFXHEADER|<OFX>/i.test(text)) {
    text = ofxToCsvish(text)
    return { fileName: name, text, kind: 'ofx' }
  }

  if (lower.endsWith('.csv') || lower.endsWith('.tsv') || file.type.includes('csv')) {
    return { fileName: name, text, kind: 'csv' }
  }

  return { fileName: name, text, kind: 'text' }
}

export const STATEMENT_FILE_ACCEPT =
  '.csv,.tsv,.txt,.ofx,.qfx,.pdf,text/csv,text/plain,application/pdf,application/x-ofx,application/vnd.intu.qfx'
