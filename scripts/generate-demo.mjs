import { mkdir, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const scriptDir = dirname(fileURLToPath(import.meta.url));
const outputPath = resolve(scriptDir, "../public/demo-paper.pdf");

const lines = [
  { size: 19, x: 64, y: 728, text: "Robust Learning Systems under Distribution Shift" },
  { size: 10, x: 64, y: 705, text: "A. Researcher, B. Scientist, and C. Engineer" },
  { size: 10, x: 64, y: 676, text: "Abstract" },
  { size: 10, x: 64, y: 657, text: "We present an empirical study of robust inference in latent representation models." },
  { size: 10, x: 64, y: 642, text: "The proposed regularization method constrains the model while preserving accuracy." },
  { size: 10, x: 64, y: 627, text: "An ablation analysis measures the contribution of every component." },
  { size: 11, x: 64, y: 592, text: "1. Introduction" },
  { size: 10, x: 64, y: 569, text: "Reliable systems must remain robust when observations differ from training data." },
  { size: 10, x: 64, y: 554, text: "This requirement is especially important in scientific and safety-critical settings." },
  { size: 10, x: 64, y: 539, text: "Our empirical evaluation covers uncertainty, calibration, and generalization." },
  { size: 11, x: 64, y: 504, text: "2. Method" },
  { size: 10, x: 64, y: 481, text: "We learn a latent space and constrain its geometry using a structured objective." },
  { size: 10, x: 64, y: 466, text: "Regularization reduces variance without suppressing meaningful representations." },
  { size: 10, x: 64, y: 451, text: "Inference is performed with a lightweight approximation at test time." },
  { size: 11, x: 64, y: 416, text: "3. Results" },
  { size: 10, x: 64, y: 393, text: "The robust model improves mean accuracy from 81.4 percent to 87.9 percent." },
  { size: 10, x: 64, y: 378, text: "Ablation results indicate that both constraints contribute to the final score." },
  { size: 10, x: 64, y: 363, text: "These findings support the proposed approach across all evaluated datasets." },
];

const escapePdf = (value) => value.replaceAll("\\", "\\\\").replaceAll("(", "\\(").replaceAll(")", "\\)");
const stream = lines.map(({ size, x, y, text }) => `BT /F1 ${size} Tf ${x} ${y} Td (${escapePdf(text)}) Tj ET`).join("\n");

const objects = [
  "<< /Type /Catalog /Pages 2 0 R >>",
  "<< /Type /Pages /Kids [3 0 R] /Count 1 >>",
  "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 4 0 R >> >> /Contents 5 0 R >>",
  "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>",
  `<< /Length ${Buffer.byteLength(stream, "ascii")} >>\nstream\n${stream}\nendstream`,
];

let pdf = "%PDF-1.4\n";
const offsets = [0];
objects.forEach((object, index) => {
  offsets.push(Buffer.byteLength(pdf, "ascii"));
  pdf += `${index + 1} 0 obj\n${object}\nendobj\n`;
});
const xrefOffset = Buffer.byteLength(pdf, "ascii");
pdf += `xref\n0 ${objects.length + 1}\n`;
pdf += "0000000000 65535 f \n";
for (const offset of offsets.slice(1)) {
  pdf += `${String(offset).padStart(10, "0")} 00000 n \n`;
}
pdf += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xrefOffset}\n%%EOF\n`;

await mkdir(dirname(outputPath), { recursive: true });
await writeFile(outputPath, Buffer.from(pdf, "ascii"));
