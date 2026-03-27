import { NextResponse } from "next/server";
import { getActiveProvider } from "@/lib/project/manager";

export async function POST(
  req: Request,
  { params }: { params: Promise<{ issueId: string }> }
) {
  const provider = await getActiveProvider();
  if (!provider) {
    return NextResponse.json({ error: "No project provider configured" }, { status: 400 });
  }

  const { issueId } = await params;
  const { body } = await req.json();
  const comment = await provider.addComment(issueId, body);
  return NextResponse.json({ comment });
}
