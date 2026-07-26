import { NextRequest } from "next/server";
import { ok } from "@/lib/api";
import { knownQuestionsFor, KNOWN_QUESTIONS } from "@/lib/anchors/knownQuestions";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const anchorId = req.nextUrl.searchParams.get("anchor");
  return ok(req, {
    questions: anchorId ? knownQuestionsFor(anchorId) : KNOWN_QUESTIONS,
  });
}
