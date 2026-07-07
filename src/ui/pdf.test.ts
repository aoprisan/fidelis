import { describe, expect, it } from "vitest";
import { buildImagePdf } from "./pdf";

/** Decode PDF bytes back to a Latin-1 string for structural assertions. */
function toLatin1(bytes: Uint8Array): string {
  let s = "";
  for (const b of bytes) s += String.fromCharCode(b);
  return s;
}

// A stand-in "JPEG": a couple of marker-ish bytes. buildImagePdf embeds bytes
// verbatim, so the actual content is irrelevant to the PDF structure.
const fakeJpeg = new Uint8Array([0xff, 0xd8, 0xff, 0xd9]);

describe("buildImagePdf", () => {
  const pdf = buildImagePdf(fakeJpeg, 800, 600);
  const text = toLatin1(pdf);

  it("emits a valid PDF header and trailer", () => {
    expect(text.startsWith("%PDF-1.3")).toBe(true);
    expect(text.trimEnd().endsWith("%%EOF")).toBe(true);
  });

  it("embeds the image via DCTDecode with correct dimensions and length", () => {
    expect(text).toContain("/Filter /DCTDecode");
    expect(text).toContain("/Width 800");
    expect(text).toContain("/Height 600");
    expect(text).toContain(`/Length ${fakeJpeg.length}`);
  });

  it("contains the raw image bytes verbatim", () => {
    expect(text).toContain(toLatin1(fakeJpeg));
  });

  it("declares a MediaBox scaled from pixels to points (96 -> 72 dpi)", () => {
    // 800px * 72/96 = 600pt, 600px * 72/96 = 450pt
    expect(text).toContain("/MediaBox [0 0 600 450]");
  });

  it("writes an xref table whose startxref points at the 'xref' keyword", () => {
    const startIdx = text.lastIndexOf("startxref");
    const offset = Number(text.slice(startIdx).split("\n")[1]);
    expect(text.slice(offset, offset + 4)).toBe("xref");
  });

  it("lists all five objects plus the free object in the xref count", () => {
    expect(text).toContain("xref\n0 6\n");
    expect(text).toContain("/Size 6");
  });
});
