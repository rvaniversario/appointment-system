import "server-only";
import { createHash } from "node:crypto";

export interface ConsultationAgreement {
  /** Paragraphs, shown exactly as signed. */
  paragraphs: string[];
  /** Short id of this exact text, stored with each signature. */
  version: string;
  sha256: string;
}

function standardTemplate(firmName: string, cutoffHours: number): string {
  const notice = cutoffHours === 0 ? "at any time before it starts" : `up to ${cutoffHours} hour${cutoffHours === 1 ? "" : "s"} in advance`;
  return [
    `This Consultation Agreement confirms that you have scheduled a paid or complimentary consultation with ${firmName} to discuss the matter described in your intake form. This consultation is for the purpose of evaluating your legal situation and does not, by itself, create an attorney-client relationship or establish representation.`,
    "Any information you share during the consultation will be treated as confidential in accordance with the Code of Professional Responsibility and Accountability. If the firm agrees to represent you following the consultation, a separate engagement letter outlining scope, fees, and terms of representation will be provided for your signature.",
    `You may cancel or reschedule this consultation ${notice} without charge.`,
  ].join("\n\n");
}

/** The firm's own agreement text, or the standard one. Hashing it lets a signature prove which text was shown. */
export function buildAgreement(firm: { name: string; agreementText: string | null; cutoffHours: number }): ConsultationAgreement {
  const text = (firm.agreementText?.trim() || standardTemplate(firm.name, firm.cutoffHours)).replace(/\r\n/g, "\n");
  const sha256 = createHash("sha256").update(text).digest("hex");
  return {
    paragraphs: text.split(/\n{2,}/).map((p) => p.trim()).filter(Boolean),
    version: sha256.slice(0, 12),
    sha256,
  };
}
