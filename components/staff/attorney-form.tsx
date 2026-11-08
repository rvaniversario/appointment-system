"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { linkAttorneyAccount, saveAttorney, saveOwnAttorneyProfile } from "@/lib/firm/actions";
import type { AttorneyAdminView, MemberView, OfficeView } from "@/lib/firm/types";
import { field, Labeled, Panel, saveButton, SaveMessage, splitList, useSave } from "./form-ui";

const blank: AttorneyAdminView = {
  id: "",
  slug: "",
  fullName: "",
  ibpRollNo: "",
  admittedYear: "",
  practiceAreas: [],
  languages: [],
  officeId: "",
  bio: "",
  meetingUrl: "",
  isActive: true,
  photoUrl: null,
  memberId: null,
  memberName: null,
};

/**
 * Partners and admins edit every field. An attorney editing their own profile (selfOnly)
 * changes only the public details; credentials, page address, office and status are locked.
 */
export function AttorneyForm({
  attorney = blank,
  offices,
  selfOnly = false,
}: {
  attorney?: AttorneyAdminView;
  offices: OfficeView[];
  selfOnly?: boolean;
}) {
  const router = useRouter();
  const [fullName, setFullName] = useState(attorney.fullName);
  const [slug, setSlug] = useState(attorney.slug);
  const [ibpRollNo, setIbpRollNo] = useState(attorney.ibpRollNo);
  const [admittedYear, setAdmittedYear] = useState(attorney.admittedYear);
  const [practiceAreas, setPracticeAreas] = useState(attorney.practiceAreas.join(", "));
  const [languages, setLanguages] = useState(attorney.languages.join(", "));
  const [officeId, setOfficeId] = useState(attorney.officeId);
  const [bio, setBio] = useState(attorney.bio);
  const [meetingUrl, setMeetingUrl] = useState(attorney.meetingUrl);
  const [isActive, setIsActive] = useState(attorney.isActive);
  const { message, pending, run } = useSave();
  const locked = { readOnly: selfOnly, style: selfOnly ? { ...field, background: "oklch(0.96 0.003 90)" } : field };

  const save = () =>
    run(async () => {
      if (selfOnly) {
        return saveOwnAttorneyProfile({ practiceAreas: splitList(practiceAreas), languages: splitList(languages), bio, meetingUrl: meetingUrl.trim() });
      }
      const result = await saveAttorney({
        id: attorney.id,
        fullName,
        slug: slug.trim(),
        ibpRollNo,
        admittedYear: admittedYear.trim(),
        practiceAreas: splitList(practiceAreas),
        languages: splitList(languages),
        officeId,
        bio,
        meetingUrl: meetingUrl.trim(),
        isActive,
      });
      if (result.ok && !attorney.id) router.push(`/staff/firm/attorneys/${result.id}?created=1`);
      return result.ok ? { ok: true as const } : result;
    });

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        save();
      }}
    >
      <Panel title="Public profile">
        <div style={{ display: "grid", gap: 14 }}>
          <div style={{ display: "grid", gridTemplateColumns: "2fr 1fr", gap: 12 }}>
            <Labeled label="Full name">
              <input value={fullName} onChange={(e) => setFullName(e.target.value)} maxLength={200} required {...locked} />
            </Labeled>
            <Labeled label="Page address" hint={attorney.id ? undefined : "Made from the name if left blank."}>
              <input value={slug} onChange={(e) => setSlug(e.target.value.toLowerCase())} maxLength={60} placeholder="maria-santos" {...locked} />
            </Labeled>
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 12 }}>
            <Labeled label="IBP Roll No.">
              <input value={ibpRollNo} onChange={(e) => setIbpRollNo(e.target.value)} maxLength={40} {...locked} />
            </Labeled>
            <Labeled label="Year admitted">
              <input inputMode="numeric" value={admittedYear} onChange={(e) => setAdmittedYear(e.target.value)} maxLength={4} {...locked} />
            </Labeled>
            <Labeled label="Office">
              <select value={officeId} onChange={(e) => setOfficeId(e.target.value)} disabled={selfOnly} style={locked.style}>
                <option value="">No office</option>
                {offices.map((o) => (
                  <option key={o.id} value={o.id}>
                    {o.name}
                  </option>
                ))}
              </select>
            </Labeled>
          </div>
          <Labeled label="Practice areas" hint="Separate with commas, e.g. Family Law, Immigration. Clients filter the directory by these.">
            <input value={practiceAreas} onChange={(e) => setPracticeAreas(e.target.value)} style={field} />
          </Labeled>
          <Labeled label="Languages" hint="Separate with commas, e.g. English, Filipino.">
            <input value={languages} onChange={(e) => setLanguages(e.target.value)} style={field} />
          </Labeled>
          <Labeled label="Bio">
            <textarea value={bio} onChange={(e) => setBio(e.target.value)} maxLength={5000} rows={6} style={{ ...field, resize: "vertical" }} />
          </Labeled>
          <Labeled label="Standing meeting link" hint="Video consultations get this link by default. Use a full https:// Zoom or Google Meet link.">
            <input type="url" value={meetingUrl} onChange={(e) => setMeetingUrl(e.target.value)} maxLength={500} style={field} />
          </Labeled>
          {!selfOnly && (
            <label style={{ display: "flex", gap: 8, alignItems: "center", fontSize: 14 }}>
              <input type="checkbox" checked={isActive} onChange={(e) => setIsActive(e.target.checked)} />
              Listed on the booking page and open for bookings
            </label>
          )}
        </div>
      </Panel>
      <div style={{ display: "flex", gap: 12, alignItems: "center" }}>
        <button type="submit" disabled={pending} style={saveButton}>
          {pending ? "Saving…" : attorney.id ? "Save profile" : "Add attorney"}
        </button>
        <SaveMessage message={message} />
      </div>
    </form>
  );
}

/** Which staff account signs in as this attorney. Partners and admins only. */
export function LinkAccountForm({ attorney, members }: { attorney: AttorneyAdminView; members: MemberView[] }) {
  const [profileId, setProfileId] = useState(attorney.memberId ?? "");
  const { message, pending, run } = useSave();
  // Members with no attorney profile yet, plus whoever is linked now.
  const choices = members.filter((m) => !m.attorneyName || m.profileId === attorney.memberId);
  return (
    <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
      <select aria-label="Staff account" value={profileId} onChange={(e) => setProfileId(e.target.value)} style={{ ...field, width: "auto", minWidth: 240 }}>
        <option value="">Not linked</option>
        {choices.map((m) => (
          <option key={m.profileId} value={m.profileId}>
            {m.name} ({m.email})
          </option>
        ))}
      </select>
      <button
        type="button"
        disabled={pending || profileId === (attorney.memberId ?? "")}
        onClick={() => run(() => linkAttorneyAccount({ attorneyId: attorney.id, profileId: profileId || null }))}
        style={saveButton}
      >
        {pending ? "Saving…" : "Save"}
      </button>
      <SaveMessage message={message} />
    </div>
  );
}
