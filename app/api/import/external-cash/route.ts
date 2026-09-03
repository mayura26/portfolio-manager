import { revalidatePath } from "next/cache";
import { type NextRequest, NextResponse } from "next/server";
import { importExternalCashStatement } from "@/lib/import/external-cash";

export async function POST(request: NextRequest): Promise<NextResponse> {
  let formData: FormData;
  try {
    formData = await request.formData();
  } catch {
    return NextResponse.json(
      { ok: false, error: "Invalid form data" },
      { status: 400 },
    );
  }

  const groupId = formData.get("groupId");
  const file = formData.get("file");

  if (typeof groupId !== "string" || !groupId.trim()) {
    return NextResponse.json(
      { ok: false, error: "groupId is required" },
      { status: 400 },
    );
  }

  if (!(file instanceof File)) {
    return NextResponse.json(
      { ok: false, error: "file is required" },
      { status: 400 },
    );
  }

  const lowerName = file.name.toLowerCase();
  const lowerType = file.type.split(";")[0]?.trim().toLowerCase();
  const acceptedTypes = new Set([
    "",
    "application/pdf",
    "text/csv",
    "application/csv",
    "application/vnd.ms-excel",
  ]);
  const acceptedExtension =
    lowerName.endsWith(".pdf") || lowerName.endsWith(".csv");

  if (!acceptedTypes.has(lowerType ?? "") && !acceptedExtension) {
    return NextResponse.json(
      { ok: false, error: "Please upload a PDF or CSV statement." },
      { status: 400 },
    );
  }

  try {
    const cleanGroupId = groupId.trim();
    const result = await importExternalCashStatement(file, cleanGroupId);
    revalidatePath(`/groups/${cleanGroupId}/cash`);
    revalidatePath(`/groups/${cleanGroupId}`);
    revalidatePath("/dashboard");
    return NextResponse.json({ ok: true, ...result });
  } catch (err) {
    return NextResponse.json(
      {
        ok: false,
        error: err instanceof Error ? err.message : "Import failed",
      },
      { status: 422 },
    );
  }
}
