// app/api/kit/route.js
// Returns config/applyKit.json for the dashboard's Apply kit. The file is
// read on every request, so edits show up on the next refresh.

import { NextResponse } from "next/server";
import { loadApplyKit } from "../../../lib/applyKit.js";

export async function GET() {
  try {
    return NextResponse.json({ success: true, kit: loadApplyKit() });
  } catch (err) {
    return NextResponse.json(
      { success: false, error: err.message },
      { status: 500 },
    );
  }
}
