import { describe, expect, it } from "vitest";
import {
  communityRegistrationFieldsSchema,
  communityRegistrationRequestSchema,
  FORM_ERROR_MESSAGE,
  INTEREST_OPTIONS
} from "../src/lib/community-registration-schema";

const validFields = {
  name: "松井 優人",
  email: "sample@st.kitasato-u.ac.jp",
  facultyDepartment: "薬学部 薬学科",
  studentId: "PP00000",
  year: "1年",
  interests: [INTEREST_OPTIONS[0]],
  motivation: ""
};

describe("communityRegistrationFieldsSchema", () => {
  it("accepts every specified boundary and leaves motivation optional", () => {
    const result = communityRegistrationFieldsSchema.parse({
      ...validFields,
      name: "学生",
      facultyDepartment: "薬学部薬学科",
      studentId: "ab123456",
      motivation: ""
    });

    expect(result.studentId).toBe("AB123456");
    expect(result.email).toBe("sample@st.kitasato-u.ac.jp");
  });

  it.each([
    ["name", { name: "松" }],
    ["name", { name: "あ".repeat(21) }],
    ["email", { email: "sample@example.com" }],
    ["email", { email: "sample@sub.st.kitasato-u.ac.jp" }],
    ["facultyDepartment", { facultyDepartment: "薬学部" }],
    ["facultyDepartment", { facultyDepartment: "あ".repeat(31) }],
    ["studentId", { studentId: "P00000" }],
    ["studentId", { studentId: "PP0000" }],
    ["studentId", { studentId: "PP0000000" }],
    ["year", { year: "" }],
    ["interests", { interests: [] }],
    ["motivation", { motivation: "あ".repeat(1001) }]
  ])("rejects invalid %s input with the fixed UI message", (_field, override) => {
    const result = communityRegistrationFieldsSchema.safeParse({ ...validFields, ...override });

    expect(result.success).toBe(false);
    if (!result.success) expect(result.error.issues[0]?.message).toBe(FORM_ERROR_MESSAGE);
  });

  it("rejects bot honeypot values and unknown request fields", () => {
    const base = {
      ...validFields,
      requestId: "1f386090-84e0-4c2f-a4d7-6f8f4f8ad141",
      turnstileToken: "verified-token",
      website: ""
    };

    expect(communityRegistrationRequestSchema.safeParse({ ...base, website: "https://spam.example" }).success).toBe(false);
    expect(communityRegistrationRequestSchema.safeParse({ ...base, role: "admin" }).success).toBe(false);
  });
});
