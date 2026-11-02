// Emergency numbers per country, from a fixed table and not from AI (PI-06). Pure, so it runs under node --test.
import type { Trip } from "@trip/schema";
import { sv } from "./sv.ts";

type Kind = keyof typeof sv.emergency.kinds;
/** The numbers of each country: the general one first, then police, ambulance, fire, non-emergency police and medical advice. */
const TABLE: Record<string, [Kind, string][]> = {
  SE: [["all", "112"], ["policeLow", "114 14"], ["advice", "1177"]],
  NO: [["all", "112"], ["ambulance", "113"], ["fire", "110"], ["policeLow", "02800"], ["advice", "116 117"]],
  DK: [["all", "112"], ["policeLow", "114"]],
  FI: [["all", "112"], ["advice", "116 117"]],
  DE: [["all", "112"], ["police", "110"], ["advice", "116 117"]],
  AT: [["all", "112"], ["police", "133"], ["ambulance", "144"], ["fire", "122"], ["advice", "1450"]],
  CH: [["all", "112"], ["police", "117"], ["ambulance", "144"], ["fire", "118"]],
  NL: [["all", "112"], ["policeLow", "0900-8844"]],
  BE: [["all", "112"], ["policeLow", "101"]],
  FR: [["all", "112"], ["ambulance", "15"], ["police", "17"], ["fire", "18"]],
  IT: [["all", "112"], ["ambulance", "118"], ["police", "113"], ["fire", "115"]],
  PL: [["all", "112"], ["ambulance", "999"], ["police", "997"], ["fire", "998"]],
  GB: [["all", "999"], ["all", "112"], ["advice", "111"], ["policeLow", "101"]],
  IE: [["all", "112"], ["all", "999"]],
  US: [["all", "911"]], CA: [["all", "911"]],
  ES: [["all", "112"]], PT: [["all", "112"]], GR: [["all", "112"]], HR: [["all", "112"]], CZ: [["all", "112"]], SK: [["all", "112"]],
  SI: [["all", "112"]], HU: [["all", "112"]], EE: [["all", "112"]], LV: [["all", "112"]], LT: [["all", "112"]], LU: [["all", "112"]], IS: [["all", "112"]],
};

export type EmergencyCountry = { country: string; name: string; numbers: { label: string; number: string }[]; eu?: true };

/** The emergency numbers of each country the trip's days are in, in the order of the days (PI-06). */
export function emergencyFor(t: Pick<Trip, "days">): EmergencyCountry[] {
  const names = new Intl.DisplayNames(["sv"], { type: "region" });
  const countries = [...new Set([...t.days].sort((a, b) => a.date.localeCompare(b.date)).flatMap((d) => (d.country ? [d.country] : [])))];
  return countries.map((c) => {
    const row = TABLE[c];
    return { country: c, name: names.of(c) ?? c, numbers: (row ?? [["all", "112"]]).map(([k, n]) => ({ label: sv.emergency.kinds[k], number: n })), ...(row ? {} : { eu: true as const }) };
  });
}

/** A number as a link that calls it. */
export const telHref = (n: string) => `tel:${n.replace(/[^\d+]/g, "")}`;
