// QR matrix generation for labels. Pure JS (npm:qrcode-generator), no canvas,
// no images: callers draw the modules themselves (see label-pdf.ts).

import qrcode from "npm:qrcode-generator@2.0.4";

export type EcLevel = "M" | "Q" | "H";

/**
 * Returns the QR module matrix for `text` as rows of booleans (true = dark).
 * Version (size) is chosen automatically ("typeNumber 0"). The matrix does NOT
 * include a quiet zone; renderers must leave >= 4 modules of blank margin.
 */
export function qrMatrix(text: string, ecLevel: EcLevel): boolean[][] {
  const qr = qrcode(0, ecLevel);
  qr.addData(text, "Byte");
  qr.make();
  const n = qr.getModuleCount();
  const rows: boolean[][] = new Array(n);
  for (let r = 0; r < n; r++) {
    const row: boolean[] = new Array(n);
    for (let c = 0; c < n; c++) row[c] = qr.isDark(r, c);
    rows[r] = row;
  }
  return rows;
}
