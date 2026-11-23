import JSZip from "jszip";
import { describe, expect, it } from "vitest";
import { parseEpub, sanitizeChapterHtml } from "../../server/utils/epub-parser";
import { buildEpub } from "../../server/utils/epub-writer";

/** Epub с одной главой: css лежит отдельным файлом, как в настоящих. */
async function epub(body: string, css = "", head = "") {
  const zip = new JSZip();
  zip.file("META-INF/container.xml", '<rootfile full-path="OEBPS/c.opf"/>');
  zip.file(
    "OEBPS/c.opf",
    '<item id="a" href="text/a.xhtml" media-type="application/xhtml+xml"/><itemref idref="a"/>',
  );
  zip.file(
    "OEBPS/text/a.xhtml",
    `<html><head><link rel="stylesheet" href="../s.css"/>${head}</head><body>${body}</body></html>`,
  );
  zip.file("OEBPS/s.css", css);
  return parseEpub(await zip.generateAsync({ type: "nodebuffer" }));
}

describe("прозрачность из epub", () => {
  it("opacity в style остаётся, и цвет рядом с ней тоже", async () => {
    expect(
      await epub('<p><span style="color:#8ae8ff; opacity: 0.5;">а</span></p>'),
    ).toBe('<p><span style="color:#8ae8ff;opacity:0.5">а</span></p>');
  });

  it("класс из css: запасная строка уступает color-mix, ::selection мимо", async () => {
    const css =
      "/* а */ .invisible-text{color:rgba(128,128,128,0.15);color:color-mix(in srgb, currentColor 12%, transparent)}\n.invisible-text::selection{color:inherit}";
    expect(
      await epub('<p><span class="invisible-text">а</span></p>', css),
    ).toBe('<p><span class="invisible-text" style="--faint:0.12">а</span></p>');
  });

  it("opacity у invisible-text заменяет наши 6 %, а не умножается на них", async () => {
    expect(
      await epub(
        '<p><span class="invisible-text">а</span></p>',
        ".invisible-text{opacity:.3}",
      ),
    ).toBe('<p><span class="invisible-text" style="--faint:0.3">а</span></p>');
  });

  it("без стилей в epub invisible-text остаётся как был", async () => {
    const html = '<p><span class="invisible-text">а</span></p>';
    expect(await epub(html)).toBe(html);
  });

  it("чёрный с альфой берёт цвет темы, цветной остаётся своим", async () => {
    expect(
      await epub('<p><span style="color:rgba(0,0,0,.3)">а</span></p>'),
    ).toBe('<p><span class="invisible-text" style="--faint:0.3">а</span></p>');
    expect(
      await epub('<p><span class="x">а</span></p>', "span.x{color:#8ae8ff80}"),
    ).toBe(
      '<p><span class="x" style="color:rgba(138, 232, 255, 0.502)">а</span></p>',
    );
  });

  it("с абзаца, курсива и блока переезжает на span", async () => {
    expect(await epub('<p style="opacity:50%">а <em>б</em></p>')).toBe(
      '<p><span style="opacity:0.5">а <em>б</em></span></p>',
    );
    expect(await epub('<p style="opacity:0.5">а</p>')).toBe(
      '<p><span style="opacity:0.5">а</span></p>',
    );
    expect(await epub('<p>а <i style="opacity:.4">б</i></p>')).toBe(
      '<p>а <span style="opacity:0.4">б</span></p>',
    );
    expect(
      await epub(
        '<div class="f"><p>а</p><p>б<br/>в</p></div><p>г &amp; д</p>',
        "",
        "<style>.f{opacity:.5}</style>",
      ),
    ).toBe(
      '<div><p><span style="opacity:0.5">а</span></p><p><span style="opacity:0.5">б<br />в</span></p></div><p>г &amp; д</p>',
    );
  });

  it("непрозрачные цвета: из style остаются, из css не переносятся", async () => {
    const html =
      '<p><span class="c1">а</span> <span style="color:#ff0000">б</span></p>';
    expect(
      await epub(
        html,
        ".c1{color:#000000} @media (x){.c1{opacity:.1}} p .c1{opacity:.2}",
      ),
    ).toBe(html);
  });

  it("скачанный epub при обратной загрузке даёт тот же текст", async () => {
    const html =
      '<p><span class="invisible-text" style="--faint:0.12">а</span> <span style="opacity:0.5">б</span></p>';
    expect(sanitizeChapterHtml(html)).toBe(html);
    const file = await buildEpub({ id: "1", title: "т", contentHtml: html });
    expect((await parseEpub(file)).trim()).toBe(html);
  });

  it("чужое в значениях не проходит", () => {
    expect(
      sanitizeChapterHtml('<span style="--faint:url(x);opacity:9">а</span>'),
    ).toBe("<span>а</span>");
  });
});
