"use client";

import { useState } from "react";
import { saveFirmProfile } from "@/lib/firm/actions";
import type { FirmProfileView } from "@/lib/firm/types";
import { field, Labeled, Panel, saveButton, SaveMessage, useSave } from "./form-ui";

export function FirmProfileForm({ firm }: { firm: FirmProfileView }) {
  const [name, setName] = useState(firm.name);
  const [contactEmail, setContactEmail] = useState(firm.contactEmail);
  const [contactPhone, setContactPhone] = useState(firm.contactPhone);
  const [cutoff, setCutoff] = useState(String(firm.cancellationCutoffHours));
  const [agreementText, setAgreementText] = useState(firm.agreementText);
  const { message, pending, run } = useSave();

  const save = () =>
    run(() =>
      saveFirmProfile({
        name,
        contactEmail: contactEmail.trim(),
        contactPhone,
        cancellationCutoffHours: Number.parseInt(cutoff, 10),
        agreementText,
      }),
    );

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        save();
      }}
    >
      <Panel title="Firm details">
        <div style={{ display: "grid", gap: 14 }}>
          <Labeled label="Firm name" hint="Shown on your booking pages, the client portal and receipts.">
            <input value={name} onChange={(e) => setName(e.target.value)} maxLength={200} required style={field} />
          </Labeled>
          <Labeled label="Booking page address" hint="Changing the address isn't possible yet, so links you've shared keep working.">
            <input value={`/f/${firm.slug}`} readOnly style={{ ...field, background: "oklch(0.96 0.003 90)" }} />
          </Labeled>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14 }}>
            <Labeled label="Contact email">
              <input type="email" value={contactEmail} onChange={(e) => setContactEmail(e.target.value)} maxLength={254} style={field} />
            </Labeled>
            <Labeled label="Contact phone">
              <input type="tel" value={contactPhone} onChange={(e) => setContactPhone(e.target.value)} maxLength={40} placeholder="(02) 8123 4567" style={field} />
            </Labeled>
          </div>
        </div>
      </Panel>

      <Panel title="Cancellation policy">
        <Labeled
          label="Online changes close this many hours before a consultation"
          hint="Until then, clients can cancel or reschedule in the portal. A canceled paid booking shows on Billing as a refund due. 0 to 336 hours."
        >
          <input
            type="number"
            min={0}
            max={336}
            step={1}
            value={cutoff}
            onChange={(e) => setCutoff(e.target.value)}
            style={{ ...field, width: 120 }}
            aria-label="Cancellation cutoff in hours"
          />
        </Labeled>
      </Panel>

      <Panel title="Consultation agreement">
        <Labeled
          label="Agreement text"
          hint="Clients sign this when they book. Leave blank to use the standard agreement, which states your cancellation cutoff. Separate paragraphs with a blank line. Each signature records which exact text was signed."
        >
          <textarea value={agreementText} onChange={(e) => setAgreementText(e.target.value)} maxLength={20000} rows={10} style={{ ...field, resize: "vertical" }} aria-label="Consultation agreement" />
        </Labeled>
      </Panel>

      <div style={{ display: "flex", gap: 12, alignItems: "center" }}>
        <button type="submit" disabled={pending} style={saveButton}>
          {pending ? "Saving…" : "Save firm settings"}
        </button>
        <SaveMessage message={message} />
      </div>
    </form>
  );
}
