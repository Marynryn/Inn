import JSZip from "jszip";
import sanitizeHtml from "sanitize-html";
import { posix } from "node:path";
import { inlineTransparency } from "./epub-transparency";

const SANITIZE_OPTIONS: sanitizeHtml.IOptions = {
  allowedTags: ["p", "br", "em", "strong", "span", "hr", "div"],
  allowedAttributes: {
    span: ["style", "class"],
    p: ["style", "class"],
  },
  allowedStyles: {
    "*": {
      color: [/.*/],
      // Прозрачность: как она попадает в текст — в epub-transparency.ts.
      opacity: [/^(0|1|0?\.\d+)$/],
      "--faint": [/^(0|1|0?\.\d+)$/],
      "--op": [/^(0|1|0?\.\d+)$/],
      "font-style": [/italic/],
      "font-weight": [/bold/, /[6-9]\d\d/, /1000/],
      "font-size": [
        /^\d(\.\d+)?(em|rem)$/,
        /^([1-9]\d?|[1-4]\d\d|500)(\.\d+)?%$/,
        /^\d{1,3}px$/,
      ],
    },
  },
  // Рядом с opacity кладём её копию в --op: тёмная тема читалки прибавляет к
  // ней свои 4 %, а прочесть число из самой opacity стили не могут.
  transformTags: {
    span: (tagName, attribs) => {
      if (!attribs.style) return { tagName, attribs };
      const rest = attribs.style
        .split(";")
        .filter((decl) => decl.trim() && !/^\s*--op\s*:/.test(decl));
      const opacity = rest
        .map((decl) => decl.match(/^\s*opacity\s*:\s*([\d.]+)\s*$/)?.[1])
        .filter(Boolean)
        .pop();
      if (opacity) rest.push(`--op:${opacity}`);
      return { tagName, attribs: { ...attribs, style: rest.join(";") } };
    },
  },
};

export function sanitizeChapterHtml(raw: string): string {
  return sanitizeHtml(raw, SANITIZE_OPTIONS);
}

/** Стили одной главы epub: её <style> и подключённые css — по порядку в файле. */
async function collectCss(zip: JSZip, filePath: string, content: string) {
  let css = "";
  for (const [tag, inline] of content.matchAll(
    /<link\b[^>]*>|<style\b[^>]*>([\s\S]*?)<\/style>/gi,
  )) {
    if (inline !== undefined) {
      css += inline + "\n";
      continue;
    }
    const href = tag.match(/\bhref=["']([^"']+)["']/i)?.[1];
    if (!href || !/stylesheet/i.test(tag)) continue;
    const path = posix.join(posix.dirname(filePath), href);
    // В ссылке пробел закодирован, а в архиве файл лежит под обычным именем.
    const file = zip.file(path) ?? zip.file(path.replaceAll("%20", " "));
    css += ((await file?.async("string")) ?? "") + "\n";
  }
  return css;
}

export async function parseEpub(buffer: Buffer): Promise<string> {
  const zip = await JSZip.loadAsync(buffer);

  // Найти container.xml → rootfile
  const containerXml = await zip
    .file("META-INF/container.xml")
    ?.async("string");
  if (!containerXml) throw new Error("Невалидный epub: нет container.xml");

  const opfPath = containerXml.match(/full-path="([^"]+)"/)?.[1];
  if (!opfPath) throw new Error("Невалидный epub: нет rootfile");

  const opfDir = opfPath.includes("/")
    ? opfPath.slice(0, opfPath.lastIndexOf("/") + 1)
    : "";
  const opfContent = await zip.file(opfPath)?.async("string");
  if (!opfContent) throw new Error("Невалидный epub: нет OPF файла");

  // Извлечь href всех spine-элементов в порядке чтения
  const itemMatches = [
    ...opfContent.matchAll(
      /id="([^"]+)"[^>]+href="([^"]+)"[^>]+media-type="application\/xhtml/g,
    ),
  ];
  const itemMap = new Map(itemMatches.map((m) => [m[1], m[2]]));

  const spineMatches = [...opfContent.matchAll(/idref="([^"]+)"/g)];
  const htmlParts: string[] = [];

  for (const [, idref] of spineMatches) {
    const href = itemMap.get(idref);
    if (!href) continue;
    const filePath = opfDir + href;
    const content = await zip.file(filePath)?.async("string");
    if (!content) continue;

    // Вырезать содержимое <body>
    const bodyMatch = content.match(/<body[^>]*>([\s\S]*?)<\/body>/i);
    if (!bodyMatch?.[1]) continue;

    const body = bodyMatch[1].replace(/<h[1-6][^>]*>[\s\S]*?<\/h[1-6]>/gi, "");
    const css = await collectCss(zip, filePath, content);
    htmlParts.push(inlineTransparency(body, css));
  }

  return sanitizeHtml(htmlParts.join("\n"), SANITIZE_OPTIONS);
}
