import { type NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { extractForecastFromText } from "@/lib/forecasts-extract";
import { fetchQuotes } from "@/lib/yahoo";

export const runtime = "nodejs";

const MAX_SIZE_BYTES = 5 * 1024 * 1024;
const ACCEPTED_MIME = new Set([
  "application/pdf",
  "text/markdown",
  "text/plain",
  "text/x-markdown",
]);

export async function POST(
  request: NextRequest,
  context: { params: Promise<{ id: string }> },
): Promise<NextResponse> {
  const { id } = await context.params;
  const instrument = await db.instrument.findUnique({ where: { id } });
  if (!instrument) {
    return NextResponse.json(
      { ok: false, error: "Instrument not found" },
      { status: 404 },
    );
  }

  let formData: FormData;
  try {
    formData = await request.formData();
  } catch {
    return NextResponse.json(
      { ok: false, error: "Invalid form data" },
      { status: 400 },
    );
  }

  const file = formData.get("file");
  if (!(file instanceof File)) {
    return NextResponse.json(
      { ok: false, error: "file is required" },
      { status: 400 },
    );
  }
  if (file.size > MAX_SIZE_BYTES) {
    return NextResponse.json(
      { ok: false, error: "File exceeds 5 MB limit" },
      { status: 413 },
    );
  }

  const mime = file.type || guessMimeFromName(file.name);
  if (!ACCEPTED_MIME.has(mime)) {
    return NextResponse.json(
      {
        ok: false,
        error: "Only PDF, Markdown, or plain text files are accepted",
      },
      { status: 415 },
    );
  }

  let text: string;
  try {
    text =
      mime === "application/pdf"
        ? await extractPdfText(file)
        : await file.text();
  } catch (err) {
    return NextResponse.json(
      {
        ok: false,
        error: `Could not read file: ${err instanceof Error ? err.message : String(err)}`,
      },
      { status: 422 },
    );
  }

  const trimmed = text.trim();
  if (trimmed.length === 0) {
    return NextResponse.json(
      { ok: false, error: "No readable text found in the file" },
      { status: 422 },
    );
  }

  const settings = await db.settings.findUnique({ where: { id: "singleton" } });
  const model = settings?.watchlistAiModel ?? "gpt-5.4";
  const reasoningEffort =
    (settings?.watchlistAiReasoning as
      | "minimal"
      | "low"
      | "medium"
      | "high"
      | undefined) ?? "medium";

  const quotes = await fetchQuotes([instrument.yahooSymbol]).catch(() => []);
  const currentPrice = quotes[0]?.price ?? null;

  let extracted: Awaited<ReturnType<typeof extractForecastFromText>>;
  try {
    extracted = await extractForecastFromText({
      text: trimmed,
      symbol: instrument.symbol,
      name: instrument.name,
      currency: instrument.currency,
      currentPrice,
      model,
      reasoningEffort,
    });
  } catch (err) {
    return NextResponse.json(
      {
        ok: false,
        error: `Extraction failed: ${err instanceof Error ? err.message : String(err)}`,
      },
      { status: 502 },
    );
  }

  const document = await db.instrumentForecastDocument.create({
    data: {
      instrumentId: instrument.id,
      filename: file.name,
      mimeType: mime,
      byteSize: file.size,
      extractedText: trimmed.slice(0, 200_000),
    },
  });

  return NextResponse.json({
    ok: true,
    documentId: document.id,
    currentPrice,
    extracted,
  });
}

function guessMimeFromName(name: string): string {
  const lower = name.toLowerCase();
  if (lower.endsWith(".pdf")) return "application/pdf";
  if (lower.endsWith(".md") || lower.endsWith(".markdown")) {
    return "text/markdown";
  }
  if (lower.endsWith(".txt")) return "text/plain";
  return "application/octet-stream";
}

async function extractPdfText(file: File): Promise<string> {
  // Avoid pdf-parse's debug-mode auto-test-file load by importing the internal lib.
  const mod = await import("pdf-parse/lib/pdf-parse.js");
  const pdfParse = (mod as unknown as { default?: typeof mod } & typeof mod)
    .default ?? mod;
  const buf = Buffer.from(await file.arrayBuffer());
  const parsed = await pdfParse(buf);
  return parsed.text ?? "";
}
