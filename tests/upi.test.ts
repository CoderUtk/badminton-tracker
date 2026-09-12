import { buildUpiLink, isValidUpiId } from "../src/lib/upi";

describe("isValidUpiId", () => {
  it("accepts a normal handle", () => {
    expect(isValidUpiId("utkarsh@okhdfcbank")).toBe(true);
    expect(isValidUpiId("  utkarsh.a-1_2@ybl  ")).toBe(true);
  });

  it("rejects anything that is not a VPA", () => {
    for (const bad of ["", "utkarsh", "@ybl", "a@", "utkarsh@1bank", "utk arsh@ybl", "a@ybl"]) {
      expect(isValidUpiId(bad)).toBe(false);
    }
  });
});

describe("buildUpiLink", () => {
  const base = { upiId: "utkarsh@ybl", payeeName: "Utkarsh", cents: 25000 };

  it("builds a payable intent with a two-decimal amount in INR", () => {
    expect(buildUpiLink(base)).toBe("upi://pay?pa=utkarsh%40ybl&pn=Utkarsh&am=250.00&cu=INR");
  });

  it("always sends two decimals, including for a whole-rupee amount", () => {
    expect(buildUpiLink({ ...base, cents: 100 })).toContain("am=1.00");
  });

  it("encodes spaces as %20, not +", () => {
    const link = buildUpiLink({ ...base, payeeName: "Ana Lee", note: "Court fee Thursday" })!;
    expect(link).toContain("pn=Ana%20Lee");
    expect(link).toContain("tn=Court%20fee%20Thursday");
    expect(link).not.toContain("+");
  });

  it("truncates a long note rather than risking a dropped query string", () => {
    const link = buildUpiLink({ ...base, note: "x".repeat(80) })!;
    expect(link).toContain(`tn=${"x".repeat(50)}`);
    expect(link).not.toContain("x".repeat(51));
  });

  it("refuses to build a link that cannot be paid", () => {
    expect(buildUpiLink({ ...base, cents: 0 })).toBeNull();
    expect(buildUpiLink({ ...base, cents: -100 })).toBeNull();
    expect(buildUpiLink({ ...base, upiId: "nope" })).toBeNull();
  });

  it("falls back to a payee name rather than sending an empty one", () => {
    expect(buildUpiLink({ ...base, payeeName: "   " })).toContain("pn=CourtSide");
  });
});
