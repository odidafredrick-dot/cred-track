import { NextResponse } from "next/server";

export async function GET() {
  if (process.env.NODE_ENV === "production") {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const username = process.env.AFRICAS_TALKING_USERNAME;
  const apiKey = process.env.AFRICAS_TALKING_API_KEY;

  if (!username || !apiKey) {
    return NextResponse.json(
      { ok: false, error: "Missing Africa's Talking credentials" },
      { status: 400 }
    );
  }

  const url = `https://api.africastalking.com/version1/user?username=${encodeURIComponent(
    username
  )}`;

  const response = await fetch(url, {
    method: "GET",
    headers: {
      apiKey,
      Accept: "application/json",
    },
  });

  if (!response.ok) {
    return NextResponse.json(
      { ok: false, status: response.status },
      { status: response.status }
    );
  }

  return NextResponse.json({ ok: true, status: response.status });
}
