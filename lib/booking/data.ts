import type { Attorney, ConflictEntry, ConsultType, DayInfo } from "./types";

export const TIME_SLOTS = [
  "9:00 AM",
  "10:00 AM",
  "11:30 AM",
  "1:00 PM",
  "2:30 PM",
  "4:00 PM",
];

export const PRACTICE_AREAS = [
  "Family Law",
  "Criminal Defense",
  "Civil Litigation",
  "Estate Planning",
  "Immigration",
  "Business Law",
];

export const LANGUAGES = ["English", "Spanish", "Mandarin", "Vietnamese"];

export const LOCATIONS = ["Downtown Office", "Westside Office", "Remote/Video Only"];

export const CONSULT_TYPES: ConsultType[] = [
  {
    id: "free-phone",
    label: "Free 15-min Phone Screening",
    sub: "Quick call to see if we can help",
    price: "$0",
    priceLabel: "$0 due today",
  },
  {
    id: "video-30",
    label: "30-min Video Consultation",
    sub: "In-depth discussion over video",
    price: "$150",
    priceLabel: "$150",
  },
  {
    id: "inperson-60",
    label: "60-min In-Person Consultation",
    sub: "Meet at one of our offices",
    price: "$350",
    priceLabel: "$350",
  },
];

export const ATTORNEYS: Attorney[] = [
  {
    id: "chen",
    name: "Maria Chen",
    practiceAreas: ["Family Law", "Estate Planning"],
    languages: ["English", "Mandarin"],
    location: "Downtown Office",
    barAdmission: "State Bar of California, admitted 2011",
    bio: "Maria focuses on divorce, custody, and estate planning matters, helping clients navigate difficult family transitions with a steady, practical approach.",
    avail: [[0, 1, 3], [1, 2], [], [0, 2, 4], [1], [0, 1, 2, 3], []],
  },
  {
    id: "okafor",
    name: "David Okafor",
    practiceAreas: ["Criminal Defense"],
    languages: ["English"],
    location: "Westside Office",
    barAdmission: "State Bar of California, admitted 2008",
    bio: "David represents clients facing criminal charges from misdemeanors through serious felonies, with a focus on clear communication under pressure.",
    avail: [[2, 4], [0, 1, 2], [3], [], [0, 4], [1, 2], [0]],
  },
  {
    id: "ramirez",
    name: "Sofia Ramirez",
    practiceAreas: ["Immigration", "Family Law"],
    languages: ["English", "Spanish"],
    location: "Downtown Office",
    barAdmission: "State Bar of California, admitted 2015",
    bio: "Sofia helps individuals and families with visas, green cards, and citizenship, alongside related family law matters, in English and Spanish.",
    avail: [[0, 2, 3, 5], [1], [0, 1, 2], [4], [], [0, 3], [1, 2]],
  },
  {
    id: "whitfield",
    name: "James Whitfield",
    practiceAreas: ["Business Law", "Civil Litigation"],
    languages: ["English"],
    location: "Downtown Office",
    barAdmission: "State Bar of California, admitted 2005",
    bio: "James advises small and mid-sized businesses on formation, contracts, and disputes, and litigates civil matters when negotiation isn't enough.",
    avail: [[1], [0, 2, 3], [], [1, 4], [0, 2], [], [3, 5]],
  },
  {
    id: "anand",
    name: "Priya Anand",
    practiceAreas: ["Estate Planning", "Civil Litigation"],
    languages: ["English", "Vietnamese"],
    location: "Westside Office",
    barAdmission: "State Bar of California, admitted 2013",
    bio: "Priya builds wills, trusts, and estate plans tailored to each family, and handles related probate and civil disputes when they arise.",
    avail: [[0, 1, 2, 4], [3], [1, 2], [0], [2, 3, 5], [1], []],
  },
  {
    id: "reilly",
    name: "Tom Reilly",
    practiceAreas: ["Criminal Defense", "Civil Litigation"],
    languages: ["English", "Spanish"],
    location: "Remote/Video Only",
    barAdmission: "State Bar of California, admitted 2010",
    bio: "Tom practices entirely over secure video, giving clients flexible access to criminal defense and civil litigation counsel from anywhere in the state.",
    avail: [[0, 1, 2, 3, 4], [0, 1, 2, 3], [0, 1, 2], [0, 1], [0, 2, 4], [1, 3], [0, 2]],
  },
];

export const CONFLICT_DB: ConflictEntry[] = [
  { name: "Amara Smith", matter: "Smith v. Whitfield Holdings — breach of contract", attorneyId: "whitfield" },
  { name: "Daniel Ortiz", matter: "Ortiz Family Trust — estate dispute", attorneyId: "anand" },
  { name: "Priya Nair", matter: "Nair v. Reilly Construction — civil claim", attorneyId: "reilly" },
  { name: "Kevin Park", matter: "State v. Park — criminal defense", attorneyId: "okafor" },
];

export const TODAY = new Date("2026-08-06T00:00:00");
export const DOW = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
export const MON = [
  "Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec",
];

export function getNext7Days(): DayInfo[] {
  const days: DayInfo[] = [];
  for (let i = 0; i < 7; i++) {
    const d = new Date(TODAY);
    d.setDate(d.getDate() + i);
    days.push({
      dow: DOW[d.getDay()],
      day: d.getDate(),
      label: `${DOW[d.getDay()]}, ${MON[d.getMonth()]} ${d.getDate()}`,
    });
  }
  return days;
}

export function getAttorney(id: string | null): Attorney | undefined {
  if (!id) return undefined;
  return ATTORNEYS.find((a) => a.id === id);
}

export function initialsOf(name: string): string {
  return name
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((w) => w[0])
    .join("")
    .toUpperCase();
}
