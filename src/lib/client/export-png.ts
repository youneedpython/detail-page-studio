import { toBlob } from "html-to-image";
import { exportFileName, planExport } from "./export-plan";

export async function downloadPng(element: HTMLElement, name: string) {
  const blob = await toBlob(element, { width: 860, pixelRatio: 1, backgroundColor: "#ffffff" });
  if (!blob) throw new Error("PNG conversion failed");
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url; link.download = name;
  document.body.append(link);
  try { link.click(); } finally { link.remove(); setTimeout(() => URL.revokeObjectURL(url), 0); }
}

export async function exportPng(root: HTMLElement, productName: string, mode: "all" | "sections") {
  root.setAttribute("data-exporting", "");
  const page = root.querySelector<HTMLElement>("[data-detail-page]")!;
  const sections = Array.from(page.children) as HTMLElement[];
  try {
    await document.fonts?.ready;
    // A photo that fails to load (e.g. a revoked URL) should not abort the whole export.
    await Promise.all(Array.from(root.querySelectorAll("img")).map(image => image.decode().catch(() => undefined)));
    const groups = mode === "sections" ? sections.map((_, index) => [index]) : planExport(sections.map(section => Math.ceil(section.getBoundingClientRect().height)));
    for (let part = 0; part < groups.length; part++) {
      sections.forEach((section, index) => {
        section.hidden = !groups[part].includes(index);
        // Hidden siblings still match `.detail-section + .detail-section`; drop the divider above each image's first section.
        section.toggleAttribute("data-export-first", index === groups[part][0]);
      });
      await downloadPng(page, exportFileName(productName, part + 1, mode === "sections" ? "section" : groups.length));
      if (part < groups.length - 1) await new Promise(resolve => setTimeout(resolve, 300));
    }
    return groups.length;
  } finally {
    sections.forEach(section => { section.hidden = false; section.removeAttribute("data-export-first"); });
    root.removeAttribute("data-exporting");
  }
}
