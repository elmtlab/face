import { NextResponse } from "next/server";
import { getRoleDefinition } from "@/lib/roles/registry";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ slug: string }> },
) {
  const { slug } = await params;
  const role = getRoleDefinition(slug);

  if (!role) {
    return NextResponse.json(
      { error: `Role "${slug}" not found` },
      { status: 404 },
    );
  }

  return NextResponse.json({ role });
}
