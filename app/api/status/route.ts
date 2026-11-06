import { NextResponse } from "next/server";
import { hasDatabaseConfig } from "@/lib/supabase";

export const runtime = "nodejs";

export async function GET() {
  return NextResponse.json({
    geminiReady: Boolean(process.env.GEMINI_API_KEY),
    databaseConfigured: hasDatabaseConfig(),
    fileSearchReady: Boolean(process.env.GEMINI_FILE_SEARCH_STORE_ID),
    adminConfigured: Boolean(process.env.ADMIN_TOKEN),
  });
}
