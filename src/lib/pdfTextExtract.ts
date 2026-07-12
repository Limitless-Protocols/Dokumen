import type { PDFDocumentProxy } from 'pdfjs-dist'
import { buildPageText } from './textParser'

export async function extractTextFromPage(
  pdfDoc: PDFDocumentProxy,
  pageNum: number
): Promise<string> {
  try {
    const page = await pdfDoc.getPage(pageNum)
    const textContent = await page.getTextContent()

    const result = buildPageText(textContent.items)
    return result.text
  } catch {
    return ''
  }
}

export async function extractAllText(
  pdfDoc: PDFDocumentProxy
): Promise<string[]> {
  const pages: string[] = []

  for (let i = 1; i <= pdfDoc.numPages; i++) {
    const text = await extractTextFromPage(pdfDoc, i)
    pages.push(text)
  }

  return pages
}
