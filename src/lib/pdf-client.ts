// Reads a PDF inside the student's browser, so the file never has to be uploaded and there is no size limit
// from Vercel. pdf.js is loaded only when needed. Its worker file is /pdf.worker.min.mjs (copied into
// /public by scripts/copy-pdf-worker.mjs when you run npm install, npm run dev, or npm run build).

export const MAX_PDF_PAGES = 2500;

export class PdfReadError extends Error {
  constructor(public code: "password" | "too_many_pages" | "unreadable" | "no_text", message: string) {
    super(message);
  }
}

export async function extractPdfPages(file: File, onProgress: (done: number, total: number) => void, signal?: AbortSignal): Promise<string[]> {
  const pdfjs = await import("pdfjs-dist/legacy/build/pdf.mjs");
  pdfjs.GlobalWorkerOptions.workerSrc = "/pdf.worker.min.mjs";
  let task;
  let doc;
  try {
    const data = new Uint8Array(await file.arrayBuffer());
    task = pdfjs.getDocument({ data });
    doc = await task.promise;
  } catch (e) {
    const name = (e as { name?: string })?.name ?? "";
    if (name === "PasswordException") throw new PdfReadError("password", "This PDF is password-protected. Remove the password, then try again.");
    throw new PdfReadError("unreadable", "This PDF could not be read. It may be damaged. Try another copy, or paste the text.");
  }
  try {
    if (doc.numPages > MAX_PDF_PAGES) throw new PdfReadError("too_many_pages", `That PDF has ${doc.numPages} pages. This version reads up to ${MAX_PDF_PAGES}. Split it into parts.`);
    const pages: string[] = [];
    for (let n = 1; n <= doc.numPages; n++) {
      if (signal?.aborted) throw new DOMException("Stopped", "AbortError");
      const page = await doc.getPage(n);
      const content = await page.getTextContent();
      let text = "";
      for (const item of content.items) {
        if (!("str" in item)) continue;
        text += item.str;
        text += item.hasEOL ? "\n" : " ";
      }
      pages.push(text);
      page.cleanup();
      if (n % 5 === 0 || n === doc.numPages) {
        onProgress(n, doc.numPages);
        await new Promise((r) => setTimeout(r, 0)); // let the screen update
      }
    }
    return pages;
  } catch (e) {
    if (e instanceof PdfReadError || (e instanceof DOMException && e.name === "AbortError")) throw e;
    throw new PdfReadError("unreadable", "This PDF could not be read all the way through. Try another copy, or paste the text.");
  } finally {
    void task?.destroy();
  }
}
