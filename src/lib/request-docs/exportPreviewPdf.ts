/** Снимок превью бланка → PDF (A4). Картинки (печать/подпись/полоска) — в data URL. */

const STYLE_PROPS = [
  "color",
  "background-color",
  "background-image",
  "background-size",
  "background-repeat",
  "background-position",
  "border-top-color",
  "border-right-color",
  "border-bottom-color",
  "border-left-color",
  "border-top-width",
  "border-right-width",
  "border-bottom-width",
  "border-left-width",
  "border-top-style",
  "border-right-style",
  "border-bottom-style",
  "border-left-style",
  "border-top-left-radius",
  "border-top-right-radius",
  "border-bottom-right-radius",
  "border-bottom-left-radius",
  "outline-color",
  "box-shadow",
  "opacity",
  "font-family",
  "font-size",
  "font-weight",
  "font-style",
  "line-height",
  "letter-spacing",
  "text-align",
  "text-decoration-line",
  "text-decoration-style",
  "text-decoration-color",
  "text-transform",
  "white-space",
  "vertical-align",
  "padding-top",
  "padding-right",
  "padding-bottom",
  "padding-left",
  "margin-top",
  "margin-right",
  "margin-bottom",
  "margin-left",
  "display",
  "flex-direction",
  "flex-wrap",
  "align-items",
  "justify-content",
  "align-content",
  "gap",
  "row-gap",
  "column-gap",
  "grid-template-columns",
  "grid-template-rows",
  "width",
  "height",
  "min-width",
  "min-height",
  "max-width",
  "max-height",
  "overflow",
  "overflow-x",
  "overflow-y",
  "position",
  "top",
  "left",
  "right",
  "bottom",
  "z-index",
  "table-layout",
  "border-collapse",
  "box-sizing",
  "object-fit",
] as const;

type NodeSnap = {
  path: number[];
  styles: Record<string, string>;
  imgSrc?: string;
};

let colorProbe: CanvasRenderingContext2D | null = null;
const dataUrlCache = new Map<string, string>();

function toRgbSafe(value: string, fallback: string): string {
  if (!value || value === "none" || value === "transparent") return value || fallback;
  if (!/oklch|oklab|color-mix|lab\(|lch\(/i.test(value)) return value;
  try {
    if (!colorProbe) {
      const c = document.createElement("canvas");
      c.width = c.height = 1;
      colorProbe = c.getContext("2d");
    }
    if (!colorProbe) return fallback;
    colorProbe.fillStyle = "#000000";
    colorProbe.fillStyle = value;
    const resolved = String(colorProbe.fillStyle);
    return resolved && !/oklch|oklab/i.test(resolved) ? resolved : fallback;
  } catch {
    return fallback;
  }
}

function sanitizeValue(prop: string, value: string): string {
  if (!/oklch|oklab|color-mix|lab\(|lch\(/i.test(value)) return value;
  if (prop.startsWith("background-image")) {
    const m = value.match(/url\((['"]?)([^)'"]+)\1\)/i);
    return m ? `url("${m[2]}")` : "none";
  }
  if (prop === "box-shadow") return "none";
  if (prop.includes("background")) return toRgbSafe(value, "#ffffff");
  if (prop.includes("border") || prop.includes("outline")) return toRgbSafe(value, "#d4d4d4");
  return toRgbSafe(value, "#171717");
}

async function urlToDataUrl(url: string): Promise<string> {
  const abs = new URL(url, window.location.href).href;
  const cached = dataUrlCache.get(abs);
  if (cached) return cached;
  const res = await fetch(abs, { credentials: "same-origin" });
  if (!res.ok) throw new Error(`Не удалось загрузить ${abs}`);
  const blob = await res.blob();
  const dataUrl = await new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(blob);
  });
  dataUrlCache.set(abs, dataUrl);
  return dataUrl;
}

function extractBgUrl(bg: string): string | null {
  const m = bg.match(/url\((['"]?)([^)'"]+)\1\)/i);
  return m?.[2] ?? null;
}

function snapshotTree(root: HTMLElement): NodeSnap[] {
  const out: NodeSnap[] = [];
  const walk = (el: HTMLElement, path: number[]) => {
    const cs = window.getComputedStyle(el);
    const styles: Record<string, string> = {};
    for (const prop of STYLE_PROPS) {
      try {
        const raw = cs.getPropertyValue(prop);
        if (!raw) continue;
        styles[prop] = sanitizeValue(prop, raw);
      } catch {
        /* ignore */
      }
    }
    if (!styles.color || /oklch|oklab/i.test(styles.color)) styles.color = "#171717";

    const snap: NodeSnap = { path, styles };
    if (el instanceof HTMLImageElement) {
      snap.imgSrc = el.currentSrc || el.src || undefined;
    }
    // inline background с url — тоже запомним
    const inlineBg = el.style.backgroundImage;
    if (inlineBg && inlineBg !== "none" && !styles["background-image"]?.includes("url(")) {
      styles["background-image"] = inlineBg;
    }
    out.push(snap);

    Array.from(el.children).forEach((child, i) => {
      if (child instanceof HTMLElement) walk(child, [...path, i]);
    });
  };
  walk(root, []);
  return out;
}

function nodeAtPath(root: HTMLElement, path: number[]): HTMLElement | null {
  let node: Element = root;
  for (const idx of path) {
    const next = node.children[idx];
    if (!next) return null;
    node = next;
  }
  return node instanceof HTMLElement ? node : null;
}

function applySnapshot(clonedRoot: HTMLElement, snaps: NodeSnap[]) {
  for (const snap of snaps) {
    const node = nodeAtPath(clonedRoot, snap.path);
    if (!node) continue;
    for (const [prop, value] of Object.entries(snap.styles)) {
      try {
        node.style.setProperty(prop, value);
      } catch {
        /* ignore */
      }
    }
    if (snap.imgSrc && node instanceof HTMLImageElement) {
      node.removeAttribute("crossorigin");
      node.src = snap.imgSrc;
    }
  }
  // нижняя полоска часто height: 14px + bg — не даём схлопнуться
  clonedRoot.querySelectorAll<HTMLElement>("[aria-hidden='true']").forEach((el) => {
    if (!el.style.backgroundImage?.includes("url(")) return;
    if (!el.style.height || el.style.height === "0px") el.style.height = "14px";
    el.style.minHeight = el.style.minHeight || "14px";
    el.style.flexShrink = "0";
  });
}

async function embedAssets(clone: HTMLElement) {
  const imgs = Array.from(clone.querySelectorAll("img"));
  await Promise.all(
    imgs.map(async (img) => {
      const src = img.currentSrc || img.getAttribute("src") || "";
      if (!src || src.startsWith("data:")) {
        try {
          await img.decode();
        } catch {
          /* ignore */
        }
        return;
      }
      try {
        img.src = await urlToDataUrl(src);
        await img.decode();
      } catch {
        /* keep original */
      }
    }),
  );

  const nodes = [clone, ...Array.from(clone.querySelectorAll<HTMLElement>("*"))];
  await Promise.all(
    nodes.map(async (el) => {
      const bg = el.style.backgroundImage || "";
      const url = extractBgUrl(bg);
      if (!url || url.startsWith("data:")) return;
      try {
        const data = await urlToDataUrl(url);
        el.style.backgroundImage = `url("${data}")`;
      } catch {
        /* keep */
      }
    }),
  );
}

function disableModernColorSheets(): CSSStyleSheet[] {
  const disabled: CSSStyleSheet[] = [];
  for (const sheet of Array.from(document.styleSheets)) {
    try {
      let hit = false;
      const rules = sheet.cssRules;
      if (!rules) continue;
      for (let i = 0; i < rules.length; i++) {
        if (/oklch|oklab|color-mix/i.test(rules[i]?.cssText ?? "")) {
          hit = true;
          break;
        }
      }
      if (hit && !sheet.disabled) {
        sheet.disabled = true;
        disabled.push(sheet);
      }
    } catch {
      try {
        if (!sheet.disabled) {
          sheet.disabled = true;
          disabled.push(sheet);
        }
      } catch {
        /* ignore */
      }
    }
  }
  return disabled;
}

/** Инпуты/textarea → обычный текст (чтобы в PDF не было рамок режима правки). */
function flattenEditableControls(root: HTMLElement) {
  root.querySelectorAll("input, textarea, select").forEach((node) => {
    const el = node as HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement;
    if (el instanceof HTMLInputElement && (el.type === "hidden" || el.type === "checkbox" || el.type === "radio")) {
      el.remove();
      return;
    }
    let text = "";
    if (el instanceof HTMLSelectElement) {
      text = el.selectedOptions[0]?.text?.trim() || el.value;
    } else {
      text = el.value;
    }
    const span = document.createElement(el instanceof HTMLTextAreaElement ? "div" : "span");
    span.textContent = text;
    span.style.cssText = [
      "display:inline",
      "border:none",
      "outline:none",
      "box-shadow:none",
      "background:transparent",
      "padding:0",
      "margin:0",
      "color:inherit",
      "font:inherit",
      "line-height:inherit",
      "white-space:pre-wrap",
      "vertical-align:baseline",
    ].join(";");
    if (el instanceof HTMLTextAreaElement) {
      span.style.display = "block";
      span.style.width = "100%";
    }
    el.replaceWith(span);
  });
}

export async function downloadElementAsPdf(el: HTMLElement, filename: string) {
  const [{ default: html2canvas }, { jsPDF }] = await Promise.all([
    import("html2canvas"),
    import("jspdf"),
  ]);

  // Дождаться картинок на живом превью
  await Promise.all(
    Array.from(el.querySelectorAll("img")).map((img) =>
      img.decode().catch(() => undefined),
    ),
  );

  const snaps = snapshotTree(el);
  const width = Math.max(el.scrollWidth, el.offsetWidth, 720);

  const host = document.createElement("div");
  host.setAttribute("data-pdf-export-host", "1");
  host.style.cssText = [
    "position:fixed",
    "left:-14000px",
    "top:0",
    "z-index:-1",
    "background:#ffffff",
    `width:${width}px`,
    "pointer-events:none",
  ].join(";");

  const clone = el.cloneNode(true) as HTMLElement;
  clone.style.width = `${width}px`;
  clone.style.height = "auto";
  clone.style.maxHeight = "none";
  clone.style.overflow = "visible";
  clone.style.boxSizing = "border-box";
  host.appendChild(clone);
  document.body.appendChild(host);

  applySnapshot(clone, snaps);
  flattenEditableControls(clone);

  const footer = clone.querySelector<HTMLElement>("[data-letterhead-footer]");
  if (footer) {
    footer.style.flexShrink = "0";
    footer.style.height = "14px";
    footer.style.minHeight = "14px";
    footer.style.marginTop = "24px";
  }

  await embedAssets(clone);
  await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));

  const footerHcss = footer ? Math.max(footer.offsetHeight, 14) : 0;
  const captureH = Math.max(clone.scrollHeight, clone.offsetHeight, el.scrollHeight);
  const scale = 2;
  const disabled = disableModernColorSheets();

  try {
    const canvas = await html2canvas(clone, {
      scale,
      useCORS: true,
      allowTaint: true,
      backgroundColor: "#ffffff",
      logging: false,
      width,
      height: captureH,
      windowWidth: width,
      onclone: (doc, clonedEl) => {
        doc.querySelectorAll("style, link[rel='stylesheet']").forEach((n) => n.remove());
        applySnapshot(clonedEl, snaps);
        flattenEditableControls(clonedEl);
        const srcImgs = Array.from(clone.querySelectorAll("img"));
        const dstImgs = Array.from(clonedEl.querySelectorAll("img"));
        for (let i = 0; i < dstImgs.length; i++) {
          const s = srcImgs[i]?.src;
          if (s) dstImgs[i]!.src = s;
        }
        const srcAll = [clone, ...Array.from(clone.querySelectorAll<HTMLElement>("*"))];
        const dstAll = [clonedEl, ...Array.from(clonedEl.querySelectorAll<HTMLElement>("*"))];
        for (let i = 0; i < dstAll.length; i++) {
          const bg = srcAll[i]?.style.backgroundImage;
          if (bg) dstAll[i]!.style.backgroundImage = bg;
        }
        clonedEl.style.backgroundColor = "#ffffff";
        clonedEl.style.color = "#171717";
        clonedEl.style.overflow = "visible";
      },
    });

    const pdf = new jsPDF({ orientation: "portrait", unit: "mm", format: "a4" });
    const pageW = pdf.internal.pageSize.getWidth();
    const pageH = pdf.internal.pageSize.getHeight();

    // Полоску вырезаем из снимка и клеим к низу последней страницы A4
    const stripPx = footerHcss > 0
      ? Math.min(canvas.height, Math.round((footerHcss + 4) * scale))
      : 0;
    const contentPx = Math.max(1, canvas.height - stripPx);

    const contentCanvas = document.createElement("canvas");
    contentCanvas.width = canvas.width;
    contentCanvas.height = contentPx;
    const cctx = contentCanvas.getContext("2d");
    if (!cctx) throw new Error("PDF canvas unavailable");
    cctx.fillStyle = "#ffffff";
    cctx.fillRect(0, 0, contentCanvas.width, contentCanvas.height);
    cctx.drawImage(
      canvas,
      0,
      0,
      canvas.width,
      contentPx,
      0,
      0,
      canvas.width,
      contentPx,
    );

    let stripData: string | null = null;
    let stripHmm = 0;
    if (stripPx > 0) {
      const stripCanvas = document.createElement("canvas");
      stripCanvas.width = canvas.width;
      stripCanvas.height = stripPx;
      const sctx = stripCanvas.getContext("2d");
      if (sctx) {
        sctx.fillStyle = "#ffffff";
        sctx.fillRect(0, 0, stripCanvas.width, stripCanvas.height);
        sctx.drawImage(
          canvas,
          0,
          canvas.height - stripPx,
          canvas.width,
          stripPx,
          0,
          0,
          canvas.width,
          stripPx,
        );
        stripData = stripCanvas.toDataURL("image/png");
        stripHmm = (stripPx * pageW) / canvas.width;
      }
    }

    const contentData = contentCanvas.toDataURL("image/png");
    const contentHmm = (contentPx * pageW) / canvas.width;
    const usableH = stripData ? Math.max(pageH - stripHmm, 40) : pageH;
    const pages = Math.max(1, Math.ceil(contentHmm / usableH - 1e-6));

    for (let pageIndex = 0; pageIndex < pages; pageIndex++) {
      if (pageIndex > 0) pdf.addPage();
      const offset = pageIndex * usableH;
      pdf.addImage(contentData, "PNG", 0, -offset, pageW, contentHmm);

      const isLast = pageIndex === pages - 1;
      if (isLast && stripData) {
        // залить низ страницы белым и полоску — к самому краю A4
        const contentEndOnPage = contentHmm - offset;
        const whiteFrom = Math.min(Math.max(0, contentEndOnPage), pageH - stripHmm);
        pdf.setFillColor(255, 255, 255);
        pdf.rect(0, whiteFrom, pageW, pageH - whiteFrom, "F");
        pdf.addImage(stripData, "PNG", 0, pageH - stripHmm, pageW, stripHmm);
      }
    }

    const name = filename.replace(/\.(docx|xlsx)$/i, "").replace(/\.pdf$/i, "") + ".pdf";
    pdf.save(name);
  } finally {
    for (const sheet of disabled) {
      try {
        sheet.disabled = false;
      } catch {
        /* ignore */
      }
    }
    host.remove();
  }
}
