import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { createAdminClient } from "@/lib/supabase/admin";
import type { Json } from "@/lib/supabase/database.types";
import { readCheckoutPayments } from "@/lib/payments/paymongo";
import { settlePaidPayment } from "@/lib/payments/settle";
import { verifyPaymongoSignature } from "@/lib/payments/signature";

/**
 * PayMongo events for one firm's linked account. Each firm's account has its own webhook
 * and signing secret, so the firm is in the URL and the signature proves the sender.
 */
export async function POST(request: NextRequest, ctx: RouteContext<"/api/webhooks/paymongo/[firmId]">) {
  const { firmId } = await ctx.params;
  // Any id Postgres accepts; zod's uuid() also rejects ids with a non-RFC 4122 variant.
  if (!z.guid().safeParse(firmId).success) return new NextResponse(null, { status: 404 });

  // Verify against the exact bytes PayMongo signed, before parsing anything.
  const rawBody = await request.text();
  const admin = createAdminClient();
  const { data: account } = await admin
    .from("firm_payment_accounts")
    .select("account_id, webhook_secret, livemode")
    .eq("firm_id", firmId)
    .maybeSingle();
  if (!account?.webhook_secret || !account.account_id) return new NextResponse(null, { status: 404 });

  const valid = verifyPaymongoSignature({
    header: request.headers.get("paymongo-signature"),
    rawBody,
    secret: account.webhook_secret,
    livemode: account.livemode,
  });
  if (!valid) return new NextResponse(null, { status: 401 });

  let event: { data?: { id?: string; attributes?: { type?: string; livemode?: boolean; data?: { id?: string; attributes?: Record<string, unknown> } } } };
  try {
    event = JSON.parse(rawBody);
  } catch {
    return new NextResponse(null, { status: 400 });
  }
  const eventId = event.data?.id;
  const type = event.data?.attributes?.type ?? "";
  const resource = event.data?.attributes?.data;
  if (!eventId) return new NextResponse(null, { status: 400 });

  // Already handled? PayMongo may deliver an event more than once.
  const { count } = await admin
    .from("webhook_events")
    .select("id", { count: "exact", head: true })
    .eq("provider", "paymongo")
    .eq("account_id", account.account_id)
    .eq("id", eventId);
  if (count) return NextResponse.json({ received: true, duplicate: true });

  if (type === "checkout_session.payment.paid" && resource?.id) {
    const paid = readCheckoutPayments(resource.attributes ?? {});
    const { data: payment } = await admin
      .from("payments")
      .select("id")
      .eq("firm_id", firmId)
      .eq("provider_checkout_id", resource.id)
      .maybeSingle();
    if (payment && paid) {
      const outcome = await settlePaidPayment({
        paymentRowId: payment.id,
        providerPaymentId: paid.paymentId,
        amountCentavos: paid.amountCentavos,
      });
      console.info("[payments] checkout paid", { outcome });
    }
  }

  if (type === "payment.refunded" && resource?.id) {
    await admin
      .from("payments")
      .update({ status: "refunded" })
      .eq("firm_id", firmId)
      .eq("provider_payment_id", resource.id);
  }

  // Record it last, so an event that failed part-way can be delivered again.
  await admin.from("webhook_events").insert({
    id: eventId,
    provider: "paymongo",
    account_id: account.account_id,
    type,
    payload: JSON.parse(rawBody) as Json,
  });

  return NextResponse.json({ received: true });
}
