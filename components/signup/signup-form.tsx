"use client";

import { useState, useTransition, type CSSProperties, type ReactNode } from "react";
import { PasswordInput } from "@/components/booking/password-input";
import { checkSlug, completeSignup, startSignup, type SignupInput } from "@/lib/signup/actions";
import { slugify, slugProblem } from "@/lib/signup/rules";
import { colors, errorTextStyle, label, linkButton, portalLoginFieldStyle, primaryButton } from "@/lib/booking/ui";

const hint: CSSProperties = { fontSize: 12, color: "oklch(0.55 0.01 258)", marginTop: 4, lineHeight: 1.45 };
const fieldError: CSSProperties = { ...errorTextStyle, fontSize: 12.5, marginTop: 4 };
const sectionHeading: CSSProperties = { fontSize: 15, fontWeight: 700, color: colors.navyDark, margin: "8px 0 0" };
const row: CSSProperties = { display: "flex", gap: 10, flexWrap: "wrap" };
const cell: CSSProperties = { flex: "1 1 180px", minWidth: 0 };

function Field({ id, title, error, note, children }: { id: string; title: string; error?: string | null; note?: ReactNode; children: ReactNode }) {
  return (
    <div style={cell}>
      <label htmlFor={id} style={label}>
        {title}
      </label>
      {children}
      {error ? (
        <div id={`${id}-error`} style={fieldError}>
          {error}
        </div>
      ) : note ? (
        <div style={hint}>{note}</div>
      ) : null}
    </div>
  );
}

/** Firm signup: details, then the code we email to confirm the address. */
export function SignupForm({ siteHost }: { siteHost: string }) {
  const [form, setForm] = useState({
    firstName: "",
    lastName: "",
    email: "",
    firmName: "",
    slug: "",
    signerIsAttorney: true,
    attorneyName: "",
    ibpRollNo: "",
    admittedYear: "",
    attested: false,
  });
  const [slugEdited, setSlugEdited] = useState(false);
  const [attorneyEdited, setAttorneyEdited] = useState(false);
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [code, setCode] = useState("");
  const [step, setStep] = useState<"details" | "code">("details");
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);
  const [pending, start] = useTransition();
  // Separate, so checking the address on blur never disables Continue mid-click.
  const [, startSlugCheck] = useTransition();

  const set = <K extends keyof typeof form>(key: K, value: (typeof form)[K]) => {
    setForm((f) => {
      const next = { ...f, [key]: value };
      if (key === "firmName" && !slugEdited) next.slug = slugify(String(value));
      if ((key === "firstName" || key === "lastName" || key === "signerIsAttorney") && next.signerIsAttorney && !attorneyEdited) {
        next.attorneyName = `${next.firstName} ${next.lastName}`.trim();
      }
      if (key === "signerIsAttorney" && !value && !attorneyEdited) next.attorneyName = "";
      return next;
    });
    setErrors((e) => ({ ...e, [key]: "" }));
  };

  const input = (): SignupInput => form;

  /** A problem with one field shows under it; anything else (including the code) shows above the button. */
  const showFailure = (result: { error: string; field?: string }) => {
    if (result.field && result.field !== "code") {
      setErrors((e) => ({ ...e, [result.field as string]: result.error }));
      setError("Please fix the highlighted field.");
    } else setError(result.error);
  };

  const submitDetails = () => {
    setError(null);
    setInfo(null);
    if (password !== confirm) {
      setErrors((e) => ({ ...e, password: "Passwords do not match." }));
      return;
    }
    start(async () => {
      const result = await startSignup(input());
      if (!result.ok) return showFailure(result);
      if (!result.codeRequired) {
        // Development without email: no code to wait for.
        const done = await completeSignup({ ...input(), code: "", password });
        showFailure(done);
        return;
      }
      setStep("code");
      setInfo(`We sent a 6-digit code to ${form.email.trim().toLowerCase()}. It expires in 10 minutes.`);
    });
  };

  const submitCode = () => {
    setError(null);
    start(async () => {
      // Redirects to two-factor setup on success.
      const result = await completeSignup({ ...input(), code, password });
      if (result.field && result.field !== "code") setStep("details");
      showFailure(result);
    });
  };

  const resend = () => {
    setError(null);
    start(async () => {
      const result = await startSignup(input());
      if (!result.ok) return showFailure(result);
      setInfo("We sent a new code. Use the most recent one.");
      setCode("");
    });
  };

  const onSlugBlur = () =>
    startSlugCheck(async () => {
      const local = slugProblem(form.slug);
      if (local) return setErrors((e) => ({ ...e, slug: local }));
      const result = await checkSlug(form.slug);
      if (!result.ok) setErrors((e) => ({ ...e, slug: result.error }));
    });

  if (step === "code") {
    return (
      <form
        onSubmit={(e) => {
          e.preventDefault();
          submitCode();
        }}
        style={{ display: "flex", flexDirection: "column", gap: 14 }}
      >
        {info && (
          <div role="status" style={{ fontSize: 14, color: "oklch(0.4 0.01 258)" }}>
            {info}
          </div>
        )}
        <Field id="signup-code" title="Code from your email">
          <input
            id="signup-code"
            inputMode="numeric"
            autoComplete="one-time-code"
            value={code}
            onChange={(e) => setCode(e.target.value.replace(/\D/g, "").slice(0, 6))}
            style={{ ...portalLoginFieldStyle, letterSpacing: 4, fontSize: 18 }}
          />
        </Field>
        {error && (
          <div role="alert" style={errorTextStyle}>
            {error}
          </div>
        )}
        <button type="submit" disabled={pending || code.length !== 6} style={{ ...primaryButton, opacity: pending || code.length !== 6 ? 0.6 : 1 }}>
          {pending ? "Creating your firm…" : "Create firm and set up two-factor"}
        </button>
        <div style={{ display: "flex", gap: 16, flexWrap: "wrap" }}>
          <button type="button" onClick={resend} disabled={pending} style={linkButton}>
            Send a new code
          </button>
          <button
            type="button"
            onClick={() => {
              setStep("details");
              setError(null);
              setInfo(null);
            }}
            style={linkButton}
          >
            Change details
          </button>
        </div>
      </form>
    );
  }

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        submitDetails();
      }}
      style={{ display: "flex", flexDirection: "column", gap: 14 }}
      noValidate
    >
      <h2 style={sectionHeading}>About you</h2>
      <div style={row}>
        <Field id="signup-first" title="First name" error={errors.firstName}>
          <input id="signup-first" autoComplete="given-name" value={form.firstName} onChange={(e) => set("firstName", e.target.value)} style={portalLoginFieldStyle} />
        </Field>
        <Field id="signup-last" title="Last name" error={errors.lastName}>
          <input id="signup-last" autoComplete="family-name" value={form.lastName} onChange={(e) => set("lastName", e.target.value)} style={portalLoginFieldStyle} />
        </Field>
      </div>
      <Field id="signup-email" title="Work email" error={errors.email} note="You'll sign in with this. We'll send a code to confirm it.">
        <input id="signup-email" type="email" autoComplete="email" value={form.email} onChange={(e) => set("email", e.target.value)} style={portalLoginFieldStyle} />
      </Field>
      <div style={row}>
        <Field id="signup-password" title="Choose a password" error={errors.password} note="At least 12 characters, with an uppercase letter, a lowercase letter and a number.">
          <PasswordInput id="signup-password" autoComplete="new-password" value={password} onChange={(e) => setPassword(e.target.value)} style={portalLoginFieldStyle} />
        </Field>
        <Field id="signup-confirm" title="Confirm password">
          <PasswordInput id="signup-confirm" autoComplete="new-password" value={confirm} onChange={(e) => setConfirm(e.target.value)} style={portalLoginFieldStyle} />
        </Field>
      </div>

      <h2 style={sectionHeading}>Your firm</h2>
      <Field id="signup-firm" title="Firm name" error={errors.firmName}>
        <input id="signup-firm" autoComplete="organization" value={form.firmName} onChange={(e) => set("firmName", e.target.value)} style={portalLoginFieldStyle} />
      </Field>
      <Field
        id="signup-slug"
        title="Booking page address"
        error={errors.slug}
        note={
          <>
            Clients book at <strong>{siteHost}/f/{form.slug || "your-firm"}</strong>. Lowercase letters, numbers and hyphens.
          </>
        }
      >
        <input
          id="signup-slug"
          value={form.slug}
          onChange={(e) => {
            setSlugEdited(true);
            set("slug", e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, ""));
          }}
          onBlur={onSlugBlur}
          style={portalLoginFieldStyle}
        />
      </Field>

      <fieldset style={{ border: "none", padding: 0, margin: 0, display: "flex", flexDirection: "column", gap: 8 }}>
        <legend style={{ ...label, marginBottom: 6 }}>Your role</legend>
        {[
          { value: true, text: "I'm an attorney at this firm" },
          { value: false, text: "I manage the office (I'm not the attorney)" },
        ].map((o) => (
          <label key={String(o.value)} style={{ display: "flex", gap: 8, alignItems: "center", fontSize: 14.5, cursor: "pointer" }}>
            <input type="radio" name="signer" checked={form.signerIsAttorney === o.value} onChange={() => set("signerIsAttorney", o.value)} />
            {o.text}
          </label>
        ))}
      </fieldset>

      <h2 style={sectionHeading}>{form.signerIsAttorney ? "Your attorney details" : "The firm's first attorney"}</h2>
      <p style={{ ...hint, marginTop: -6, fontSize: 13 }}>
        We check these against the Supreme Court&apos;s list of lawyers before your booking page goes live. You can add more
        attorneys later.
      </p>
      <Field id="signup-attorney" title="Attorney's full name" error={errors.attorneyName} note="As clients will see it on your booking page.">
        <input
          id="signup-attorney"
          value={form.attorneyName}
          onChange={(e) => {
            setAttorneyEdited(true);
            set("attorneyName", e.target.value);
          }}
          style={portalLoginFieldStyle}
        />
      </Field>
      <div style={row}>
        <Field id="signup-roll" title="Roll of Attorneys number" error={errors.ibpRollNo}>
          <input id="signup-roll" inputMode="numeric" value={form.ibpRollNo} onChange={(e) => set("ibpRollNo", e.target.value.replace(/\D/g, ""))} style={portalLoginFieldStyle} />
        </Field>
        <Field id="signup-year" title="Year admitted to the bar" error={errors.admittedYear}>
          <input id="signup-year" inputMode="numeric" maxLength={4} value={form.admittedYear} onChange={(e) => set("admittedYear", e.target.value.replace(/\D/g, ""))} style={portalLoginFieldStyle} />
        </Field>
      </div>

      <label style={{ display: "flex", gap: 10, alignItems: "flex-start", fontSize: 13.5, lineHeight: 1.5, cursor: "pointer" }}>
        <input id="signup-attest" type="checkbox" checked={form.attested} onChange={(e) => set("attested", e.target.checked)} style={{ marginTop: 3 }} />
        <span>
          I&apos;m authorized to sign up this firm, and the attorney details above are accurate.
          {errors.attested && <span style={{ ...fieldError, display: "block" }}>{errors.attested}</span>}
        </span>
      </label>

      {error && (
        <div role="alert" style={errorTextStyle}>
          {error}
        </div>
      )}
      <button type="submit" disabled={pending} style={{ ...primaryButton, opacity: pending ? 0.6 : 1 }}>
        {pending ? "Checking…" : "Continue"}
      </button>
    </form>
  );
}
