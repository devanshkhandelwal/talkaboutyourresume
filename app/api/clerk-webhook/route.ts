import { NextRequest, NextResponse } from "next/server";
import { verifyWebhook } from "@clerk/nextjs/webhooks";
import { dbEnabled, deleteInterviews } from "@/lib/db";
import { trackEvent } from "@/lib/limits";

// Clerk calls this when accounts are created or deleted (Clerk dashboard →
// Webhooks → endpoint /api/clerk-webhook, events user.created and user.deleted).
// Deleting an account deletes everything saved for it. Signed with Svix; the
// secret is CLERK_WEBHOOK_SIGNING_SECRET.
export async function POST(req: NextRequest) {
  if (!process.env.CLERK_WEBHOOK_SIGNING_SECRET) {
    return NextResponse.json({ error: "Webhook not configured." }, { status: 503 });
  }
  let evt;
  try {
    evt = await verifyWebhook(req);
  } catch (err) {
    console.error("[clerk-webhook] verification failed", err);
    return NextResponse.json({ error: "Invalid signature." }, { status: 400 });
  }

  if (evt.type === "user.created") {
    await trackEvent("account_created");
  } else if (evt.type === "user.deleted" && evt.data.id) {
    if (dbEnabled) await deleteInterviews(evt.data.id);
    await trackEvent("account_deleted");
  }
  return NextResponse.json({ ok: true });
}
