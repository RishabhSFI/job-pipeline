// app/api/favourite/route.js
// Stars or unstars a job. Body: { row: 5, on: true, link?: "<posting link>" }
// The sheet's Favourite column holds "★" for a favourite, empty otherwise.

import { NextResponse } from "next/server";
import { updateField } from "../../../lib/sheets.js";
import { logEvent } from "../../../lib/timeline.js";
import { jobId } from "../../../lib/jobId.js";

const FAVOURITE_MARK = "★";

export async function POST(request) {
  try {
    const { row, on, link } = await request.json();
    const rowNumber = Number(row);
    if (!Number.isInteger(rowNumber) || rowNumber < 2 || typeof on !== "boolean") {
      return NextResponse.json({ error: "Send { row, on: true|false }" }, { status: 400 });
    }
    await updateField(rowNumber, "Favourite", on ? FAVOURITE_MARK : "");
    if (link) logEvent(jobId(link), "note", on ? "Added to favourites" : "Removed from favourites");
    return NextResponse.json({ success: true });
  } catch (err) {
    return NextResponse.json({ success: false, error: err.message }, { status: 500 });
  }
}
