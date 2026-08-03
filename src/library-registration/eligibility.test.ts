import { describe, expect, it } from "vitest";
import cases from "../../contracts/library-registration/eligibility-cases.json";
import {
  evaluateEligibility,
  isStudentNumberValid,
  normalizeStudentNumber
} from "./eligibility";
import type {
  AccountFacts,
  EligibilityStatus,
  ExistingRegistration,
  ReasonCode,
  RegistrationInput
} from "./eligibility";

type EligibilityCase = {
  name: string;
  account: AccountFacts;
  registration: RegistrationInput;
  existingRegistration: ExistingRegistration;
  expectedStatus: EligibilityStatus;
  expectedReasons: ReasonCode[];
  expectedStudentNumber: string;
};

describe("Phase 3 eligibility contract", () => {
  for (const testCase of cases as EligibilityCase[]) {
    it(testCase.name, () => {
      const result = evaluateEligibility(testCase.account, testCase.registration, {
        existingRegistration: testCase.existingRegistration
      });

      expect(result.status).toBe(testCase.expectedStatus);
      expect(result.reasons).toEqual(testCase.expectedReasons);
      expect(result.normalizedStudentNumber).toBe(testCase.expectedStudentNumber);
    });
  }
});

describe("student number normalization", () => {
  it("normalizes width, case and edge whitespace", () => {
    expect(normalizeStudentNumber(" ｍｐ１２３４５ ")).toBe("MP12345");
  });

  it("does not remove internal whitespace", () => {
    expect(isStudentNumberValid("PP 23000")).toBe(false);
  });
});
