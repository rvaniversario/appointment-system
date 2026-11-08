/** The signed-in user's editable profile, as handed from server layouts to the client. */
export interface AccountProfile {
  id: string;
  email: string;
  firstName: string;
  middleName: string;
  lastName: string;
  /** YYYY-MM-DD, or "" when not set. */
  dateOfBirth: string;
  /** Local format (09XXXXXXXXX), or "" when not set. */
  mobile: string;
  /** Agreed to booking texts by SMS (RA 10173 consent; can be withdrawn any time). */
  smsOptIn: boolean;
  /** Short-lived signed URL: avatars are in a private bucket. */
  photoUrl: string | null;
}
