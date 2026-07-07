/**
 * A tiny, dependency-free PDF writer: wraps a single JPEG image in a one-page
 * PDF. JPEG bytes go in verbatim via the `/DCTDecode` filter, which every PDF
 * reader supports, so no compression or image re-encoding is needed here.
 *
 * The byte layout (header, five objects, cross-reference table, trailer) is
 * assembled deterministically and the xref offsets are computed from actual
 * byte lengths — keeping this pure and unit-testable.
 */

/** Screen pixels → PostScript points (PDF's unit), assuming 96 DPI. */
const PX_TO_PT = 72 / 96;

/** Encode an ASCII string to bytes. All structural text here is ASCII. */
function ascii(s: string): Uint8Array {
  const out = new Uint8Array(s.length);
  for (let i = 0; i < s.length; i++) out[i] = s.charCodeAt(i) & 0xff;
  return out;
}

/**
 * Build a single-page PDF (as bytes) that displays `jpeg` filling the page.
 * The page is sized to the image's pixel dimensions converted to points.
 */
export function buildImagePdf(
  jpeg: Uint8Array,
  widthPx: number,
  heightPx: number,
): Uint8Array {
  const w = +(widthPx * PX_TO_PT).toFixed(2);
  const h = +(heightPx * PX_TO_PT).toFixed(2);
  const content = `q ${w} 0 0 ${h} 0 0 cm /Im0 Do Q\n`;

  const parts: Uint8Array[] = [];
  let len = 0;
  const offsets: number[] = [];
  const put = (chunk: Uint8Array | string) => {
    const u = typeof chunk === "string" ? ascii(chunk) : chunk;
    parts.push(u);
    len += u.length;
  };
  const obj = () => offsets.push(len);

  put("%PDF-1.3\n");

  obj();
  put("1 0 obj\n<< /Type /Catalog /Pages 2 0 R >>\nendobj\n");

  obj();
  put("2 0 obj\n<< /Type /Pages /Kids [3 0 R] /Count 1 >>\nendobj\n");

  obj();
  put(
    `3 0 obj\n<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${w} ${h}] ` +
      `/Resources << /XObject << /Im0 4 0 R >> >> /Contents 5 0 R >>\nendobj\n`,
  );

  obj();
  put(
    `4 0 obj\n<< /Type /XObject /Subtype /Image /Width ${widthPx} ` +
      `/Height ${heightPx} /ColorSpace /DeviceRGB /BitsPerComponent 8 ` +
      `/Filter /DCTDecode /Length ${jpeg.length} >>\nstream\n`,
  );
  put(jpeg);
  put("\nendstream\nendobj\n");

  obj();
  put(`5 0 obj\n<< /Length ${content.length} >>\nstream\n${content}endstream\nendobj\n`);

  const xrefStart = len;
  const size = offsets.length + 1; // + the free object 0
  let xref = `xref\n0 ${size}\n0000000000 65535 f \n`;
  for (const off of offsets) xref += `${String(off).padStart(10, "0")} 00000 n \n`;
  xref += `trailer\n<< /Size ${size} /Root 1 0 R >>\nstartxref\n${xrefStart}\n%%EOF\n`;
  put(xref);

  const out = new Uint8Array(len);
  let pos = 0;
  for (const p of parts) {
    out.set(p, pos);
    pos += p.length;
  }
  return out;
}
