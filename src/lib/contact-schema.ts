import { z } from "zod";

export const CONTACT_ENDPOINT = "/api/contact";
export const CONTACT_PATH = "/contact/";
export const CONTACT_TURNSTILE_ACTION = "contact_verification";
export const CONTACT_FORM_ERROR_MESSAGE = "正しい形式で入力してください";

const nameSchema = z
  .string()
  .trim()
  .min(2, CONTACT_FORM_ERROR_MESSAGE)
  .max(20, CONTACT_FORM_ERROR_MESSAGE);

const affiliationSchema = z
  .string()
  .trim()
  .min(2, CONTACT_FORM_ERROR_MESSAGE)
  .max(20, CONTACT_FORM_ERROR_MESSAGE);

const emailSchema = z
  .string()
  .trim()
  .min(5, CONTACT_FORM_ERROR_MESSAGE)
  .max(50, CONTACT_FORM_ERROR_MESSAGE)
  .email(CONTACT_FORM_ERROR_MESSAGE)
  .transform((value) => value.toLowerCase());

const detailsSchema = z
  .string()
  .trim()
  .min(10, CONTACT_FORM_ERROR_MESSAGE)
  .max(1000, CONTACT_FORM_ERROR_MESSAGE);

export const contactIdentityFieldSchemas = {
  name: nameSchema,
  affiliation: affiliationSchema,
  email: emailSchema
};

export const contactFieldSchemas = {
  ...contactIdentityFieldSchemas,
  details: detailsSchema
};

export const contactIdentityFieldsSchema = z.object(contactIdentityFieldSchemas);
export const contactFieldsSchema = z.object(contactFieldSchemas);

const requestMetadataSchema = {
  requestId: z.string().uuid(CONTACT_FORM_ERROR_MESSAGE),
  website: z.string().max(0, CONTACT_FORM_ERROR_MESSAGE)
};

export const contactCodeRequestSchema = contactIdentityFieldsSchema.extend({
  action: z.literal("request_code"),
  ...requestMetadataSchema,
  turnstileToken: z.string().min(1, CONTACT_FORM_ERROR_MESSAGE).max(2048, CONTACT_FORM_ERROR_MESSAGE)
}).strict();

export const contactVerifyCodeRequestSchema = contactIdentityFieldsSchema.extend({
  action: z.literal("verify_code"),
  ...requestMetadataSchema,
  challengeId: z.string().uuid(CONTACT_FORM_ERROR_MESSAGE),
  verificationCode: z.string().regex(/^\d{6}$/, CONTACT_FORM_ERROR_MESSAGE)
}).strict();

export const contactSubmitRequestSchema = contactFieldsSchema.extend({
  action: z.literal("submit"),
  ...requestMetadataSchema,
  challengeId: z.string().uuid(CONTACT_FORM_ERROR_MESSAGE),
  verificationProof: z.string().regex(/^[A-Za-z0-9_-]{43}$/, CONTACT_FORM_ERROR_MESSAGE)
}).strict();

export const contactApiRequestSchema = z.discriminatedUnion("action", [
  contactCodeRequestSchema,
  contactVerifyCodeRequestSchema,
  contactSubmitRequestSchema
]);

export type ContactFields = z.input<typeof contactFieldsSchema>;
export type ContactIdentityFields = z.input<typeof contactIdentityFieldsSchema>;
export type ContactApiRequest = z.output<typeof contactApiRequestSchema>;
export type ContactCodeRequest = z.output<typeof contactCodeRequestSchema>;
export type ContactVerifyCodeRequest = z.output<typeof contactVerifyCodeRequestSchema>;
export type ContactSubmitRequest = z.output<typeof contactSubmitRequestSchema>;

export function getContactFieldErrors(error: z.ZodError) {
  const result: Partial<Record<keyof ContactFields | "verificationCode", string>> = {};

  for (const issue of error.issues) {
    const field = issue.path[0];
    if (typeof field !== "string" || field in result) continue;
    if (["name", "affiliation", "email", "details", "verificationCode"].includes(field)) {
      result[field as keyof typeof result] = CONTACT_FORM_ERROR_MESSAGE;
    }
  }

  return result;
}
