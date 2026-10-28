// app/api/notes/route.js
// Saves a job's Notes cell. Body: { row: 5, notes: "text" }
// Email-apply jobs keep their address in Notes, so the board warns before
// overwriting those.

import { NextResponse } from "next/server";
import { updateNotes } from "../../../lib/sheets.js";

const MAX_NOTES = 5000;

export async function POST(request) {
  try {
    const { row, notes } = await request.json();
    const rowNumber = Number(row);
    if (!Number.isInteger(rowNumber) || rowNumber < 2) {
      return NextResponse.json(
        { error: "row must be a sheet row number (2 or higher)" },
        { status: 400 },
      );
    }
    if (typeof notes !== "string" || notes.length > MAX_NOTES) {
      return NextResponse.json(
        { error: `notes must be text up to ${MAX_NOTES} characters` },
        { status: 400 },
      );
    }
    await updateNotes(rowNumber, notes);
    return NextResponse.json({ success: true });
  } catch (err) {
    return NextResponse.json(
      { success: false, error: err.message },
      { status: 500 },
    );
  }
}
