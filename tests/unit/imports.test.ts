import { describe, expect, it } from "vitest";
import { parseDate, parseMoney, parsePercent } from "@/lib/imports/values";
import { suggestMapping, detectSourceSystem } from "@/lib/imports/mapping";
import { clusterNames, normalizeCategory, normalizeResolution, normalizeStatus, cleanPersonName, AUTO_ACCEPT } from "@/lib/imports/normalize";
import { DEFAULT_CATEGORIES } from "@/lib/taxonomy";

const cats = DEFAULT_CATEGORIES.employment;

describe("value parsing", () => {
  it("parses money in common spreadsheet formats", () => {
    expect(parseMoney("$1,234.50")).toBe(1234.5);
    expect(parseMoney("450K")).toBe(450_000);
    expect(parseMoney("1.2M")).toBe(1_200_000);
    expect(parseMoney("(2,000)")).toBe(-2000);
    expect(parseMoney("N/A")).toBeNull();
    expect(parseMoney("abc")).toBeNull();
    expect(parseMoney(98000)).toBe(98000);
  });
  it("parses dates in ISO, US, long-form and Excel serial formats", () => {
    expect(parseDate("2023-03-14")).toBe("2023-03-14");
    expect(parseDate("3/14/2023")).toBe("2023-03-14");
    expect(parseDate("03/14/23")).toBe("2023-03-14");
    expect(parseDate("Mar 14, 2023")).toBe("2023-03-14");
    expect(parseDate("14-Mar-2023")).toBe("2023-03-14");
    expect(parseDate(44999)).toBe("2023-03-14");
    expect(parseDate("2/30/2023")).toBeNull();
    expect(parseDate("soon")).toBeNull();
  });
  it("parses probabilities as fractions", () => {
    expect(parsePercent("65%")).toBe(0.65);
    expect(parsePercent("0.65")).toBe(0.65);
    expect(parsePercent(65)).toBe(0.65);
    expect(parsePercent("140")).toBeNull();
  });
});

describe("column mapping", () => {
  it("maps a messy case-management export onto canonical fields", () => {
    const headers = ["Matter #", "Case Name", "Practice Type", "Atty", "Referred By", "Open Date", "Date Closed", "Disposition", "Settlement $", "Costs", "Fee", "Internal Code"];
    const rows = [{ "Matter #": "1182", "Case Name": "Okonkwo v. Meridian", "Practice Type": "wrongful term.", Atty: "J. Ross", "Referred By": "Bar LRS", "Open Date": "3/14/2021", "Date Closed": "8/2/2022", Disposition: "Settled", "Settlement $": "$475,000", Costs: "$41,200", Fee: "$190,000", "Internal Code": "X9" }];
    const m = Object.fromEntries(suggestMapping(headers, rows).map((c) => [c.column, c.field]));
    expect(m).toMatchObject({
      "Matter #": "external_id", "Case Name": "name", "Practice Type": "category", Atty: "lead_attorney", "Referred By": "referral_source",
      "Open Date": "opened_on", "Date Closed": "closed_on", Disposition: "resolution_type", "Settlement $": "gross_recovery", Costs: "litigation_expenses", Fee: "attorney_fee",
    });
    expect(m["Internal Code"]).toBeNull();
  });
  it("never maps two columns to the same field", () => {
    const fields = suggestMapping(["Settlement", "Settlement Amount"], [{ Settlement: "100000", "Settlement Amount": "100000" }]).map((c) => c.field).filter(Boolean);
    expect(new Set(fields).size).toBe(fields.length);
  });
  it("recognizes export signatures without claiming an integration", () => {
    expect(detectSourceSystem(["Matter Number", "Responsible Attorney", "Practice Area", "Status"])).toBe("Clio");
  });
});

describe("normalization", () => {
  it("normalizes the spec's messy category labels with confidence", () => {
    expect(normalizeCategory("wrongful term.", cats)).toMatchObject({ value: "wrongful_termination", method: "exact" });
    expect(normalizeCategory("FEHA retaliation", cats)).toMatchObject({ value: "retaliation" });
    expect(normalizeCategory("term - retaliation", cats)).toMatchObject({ value: "retaliation" });
    expect(normalizeCategory("Age Discrimination (ADEA)", cats).value).toBe("discrimination");
  });
  it("routes unrecognized categories to review instead of guessing", () => {
    const r = normalizeCategory("Qzx misc thing", cats);
    expect(r.confidence).toBeLessThan(AUTO_ACCEPT);
  });
  it("normalizes status and resolution vocabularies", () => {
    expect(normalizeStatus("Settled", false).value).toBe("closed");
    expect(normalizeStatus("", true).value).toBe("closed");
    expect(normalizeResolution("Defense verdict").value).toBe("judgment_defense");
    expect(normalizeResolution("Settled at mediation").value).toBe("settlement");
    expect(normalizeResolution("Voluntary dismissal").value).toBe("dismissal");
  });
  it("clusters attorney name variants and flags merges for review", () => {
    expect(cleanPersonName("ROSS, JANE")).toBe("Jane Ross");
    const r = clusterNames([{ raw: "Jane Ross", count: 40 }, { raw: "ROSS, JANE", count: 3 }, { raw: "J. Ross", count: 2 }, { raw: "Ana Keller", count: 10 }], [], true);
    expect(r.get("ROSS, JANE")).toMatchObject({ value: "Jane Ross" });
    expect(r.get("J. Ross")!.value).toBe("Jane Ross");
    expect(r.get("J. Ross")!.confidence).toBeLessThan(AUTO_ACCEPT);
    expect(r.get("Ana Keller")!.confidence).toBeGreaterThanOrEqual(AUTO_ACCEPT);
  });
});
