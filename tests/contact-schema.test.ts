import { describe, expect, it } from "vitest";
import {
  CONTACT_FORM_ERROR_MESSAGE,
  contactCodeRequestSchema,
  contactFieldsSchema,
  contactIdentityFieldsSchema,
  contactSubmitRequestSchema,
  contactVerifyCodeRequestSchema
} from "../src/lib/contact-schema";

const validFields = {
  name: "松井優人",
  affiliation: "北里大学薬学部",
  email: "contact@example.com",
  details: "教育活動に関する共同企画について相談を希望します。"
};

describe("contact form schemas", () => {
  it("accepts the approved boundaries and arbitrary email domains", () => {
    const result = contactFieldsSchema.parse({
      name: "学生",
      affiliation: "大学",
      email: "A@EXAMPLE.COM",
      details: "あ".repeat(10)
    });

    expect(result.email).toBe("a@example.com");
    expect(contactFieldsSchema.safeParse({
      name: "あ".repeat(20),
      affiliation: "あ".repeat(20),
      email: "a".repeat(38) + "@example.com",
      details: "あ".repeat(1000)
    }).success).toBe(true);
  });

  it.each([
    ["name", { name: "松" }],
    ["name", { name: "あ".repeat(21) }],
    ["affiliation", { affiliation: "学" }],
    ["affiliation", { affiliation: "あ".repeat(21) }],
    ["email", { email: "a@b" }],
    ["email", { email: "a".repeat(39) + "@example.com" }],
    ["details", { details: "あ".repeat(9) }],
    ["details", { details: "あ".repeat(1001) }]
  ])("rejects invalid %s input with the fixed message", (_field, override) => {
    const result = contactFieldsSchema.safeParse({ ...validFields, ...override });

    expect(result.success).toBe(false);
    if (!result.success) expect(result.error.issues[0]?.message).toBe(CONTACT_FORM_ERROR_MESSAGE);
  });

  it("requires all three identity fields before a code can be requested", () => {
    expect(contactIdentityFieldsSchema.safeParse(validFields).success).toBe(true);
    expect(contactIdentityFieldsSchema.safeParse({ ...validFields, name: "松" }).success).toBe(false);
    expect(contactIdentityFieldsSchema.safeParse({ ...validFields, affiliation: "学" }).success).toBe(false);
    expect(contactIdentityFieldsSchema.safeParse({ ...validFields, email: "invalid" }).success).toBe(false);
  });

  it("keeps code issuance and final submission payloads strict", () => {
    const requestId = "1f386090-84e0-4c2f-a4d7-6f8f4f8ad141";
    const issue = {
      action: "request_code",
      name: validFields.name,
      affiliation: validFields.affiliation,
      email: validFields.email,
      requestId,
      turnstileToken: "verified-token",
      website: ""
    };
    const submission = {
      action: "submit",
      ...validFields,
      challengeId: requestId,
      requestId: "8ab3959a-7184-40ca-8208-b4cb481ede35",
      verificationProof: "a".repeat(43),
      website: ""
    };
    const verification = {
      action: "verify_code",
      name: validFields.name,
      affiliation: validFields.affiliation,
      email: validFields.email,
      challengeId: requestId,
      requestId: "4cf7ccfe-6142-4541-b6fe-2e8cb996db63",
      verificationCode: "123456",
      website: ""
    };

    expect(contactCodeRequestSchema.safeParse(issue).success).toBe(true);
    expect(contactCodeRequestSchema.safeParse({ ...issue, details: validFields.details }).success).toBe(false);
    expect(contactVerifyCodeRequestSchema.safeParse(verification).success).toBe(true);
    expect(contactVerifyCodeRequestSchema.safeParse({ ...verification, verificationCode: "12345" }).success).toBe(false);
    expect(contactSubmitRequestSchema.safeParse(submission).success).toBe(true);
    expect(contactSubmitRequestSchema.safeParse({ ...submission, verificationProof: "short" }).success).toBe(false);
    expect(contactSubmitRequestSchema.safeParse({ ...submission, role: "admin" }).success).toBe(false);
  });
});
