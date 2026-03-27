import { NextResponse } from "next/server";
import { analyzeUntriagedIssues, applyTriageSuggestions } from "@/lib/project/triage";

export async function GET() {
  try {
    const result = await analyzeUntriagedIssues();
    return NextResponse.json(result);
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 400 });
  }
}

export async function POST(req: Request) {
  try {
    const { suggestions } = await req.json();
    const result = await applyTriageSuggestions(suggestions);
    return NextResponse.json(result);
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 400 });
  }
}
