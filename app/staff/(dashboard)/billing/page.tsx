import Link from "next/link";
import { FirmPayments } from "@/components/staff/firm-payments";
import { card, colors } from "@/lib/booking/ui";
import { getFeesByAttorney, getStaffContext } from "@/lib/staff/queries";

export const metadata = { title: "Billing" };

const th = { padding: "10px 12px", textAlign: "left" as const, fontSize: 12, color: "oklch(0.5 0.01 258)" };
const td = { padding: "10px 12px", borderTop: "1px solid oklch(0.93 0.005 90)", fontSize: 13.5 };

export default async function StaffBillingPage({ searchParams }: PageProps<"/staff/billing">) {
  const ctx = await getStaffContext();
  const { month } = await searchParams;
  const fees = await getFeesByAttorney(ctx, typeof month === "string" ? month : undefined);

  return (
    <>
      <FirmPayments />
      <section>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: 12 }}>
          <h2 style={{ fontFamily: "var(--font-lora), serif", fontSize: 22, fontWeight: 600, color: colors.navyDark, margin: 0 }}>
            Online fees by attorney
          </h2>
          <Link href="/staff/analytics" style={{ fontSize: 13, color: colors.green, fontWeight: 600, textDecoration: "none" }}>
            More in Analytics →
          </Link>
        </div>
        <div style={{ ...card("0"), overflowX: "auto" }}>
          {fees.rows.length === 0 ? (
            <div style={{ padding: "18px 20px", fontSize: 14, color: "oklch(0.55 0.01 258)" }}>No online fees in {fees.label}.</div>
          ) : (
            <table style={{ width: "100%", borderCollapse: "collapse" }}>
              <thead>
                <tr>
                  <th style={th}>Attorney</th>
                  <th style={th}>Paid consultations, {fees.label}</th>
                  <th style={th}>Collected, net of refunds</th>
                </tr>
              </thead>
              <tbody>
                {fees.rows.map((r) => (
                  <tr key={r.attorneyName}>
                    <td style={td}>{r.attorneyName}</td>
                    <td style={td}>{r.consults}</td>
                    <td style={{ ...td, fontWeight: 600 }}>{r.collectedLabel}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </section>
    </>
  );
}
