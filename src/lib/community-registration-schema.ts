import { z } from "zod";

export const FORM_ERROR_MESSAGE = "正しい形式で入力してください";
export const COMMUNITY_REGISTRATION_ENDPOINT = "/api/community-registration";
export const COMMUNITY_REGISTRATION_PATH = "/community/join/";
export const TURNSTILE_ACTION = "community_registration";

export const YEAR_OPTIONS = ["1年", "2年", "3年", "4年", "5・6年", "大学院生"] as const;

export const INTEREST_OPTIONS = [
  "イベント企画",
  "SNS発信",
  "デザイン",
  "カメラマン",
  "動画編集",
  "Web開発",
  "本格的なアプリ開発",
  "AIの使い方",
  "深層学習・AIエージェント",
  "まずは話を聞いてみたい"
] as const;

const universityEmailSchema = z
  .string()
  .trim()
  .max(254, FORM_ERROR_MESSAGE)
  .email(FORM_ERROR_MESSAGE)
  .transform((value) => value.toLowerCase())
  .refine((value) => value.slice(value.lastIndexOf("@") + 1) === "st.kitasato-u.ac.jp", FORM_ERROR_MESSAGE);

export const communityRegistrationFieldSchemas = {
  name: z.string().trim().min(2, FORM_ERROR_MESSAGE).max(20, FORM_ERROR_MESSAGE),
  email: universityEmailSchema,
  facultyDepartment: z.string().trim().min(5, FORM_ERROR_MESSAGE).max(30, FORM_ERROR_MESSAGE),
  studentId: z
    .string()
    .trim()
    .regex(/^[A-Za-z]{2}\d{5,6}$/, FORM_ERROR_MESSAGE)
    .transform((value) => value.toUpperCase()),
  year: z.enum(YEAR_OPTIONS, { error: FORM_ERROR_MESSAGE }),
  interests: z
    .array(z.enum(INTEREST_OPTIONS, { error: FORM_ERROR_MESSAGE }))
    .min(1, FORM_ERROR_MESSAGE)
    .max(INTEREST_OPTIONS.length, FORM_ERROR_MESSAGE)
    .refine((items) => new Set(items).size === items.length, FORM_ERROR_MESSAGE),
  motivation: z.string().trim().max(1000, FORM_ERROR_MESSAGE)
};

export const communityRegistrationFieldsSchema = z.object(communityRegistrationFieldSchemas);

export const communityRegistrationRequestSchema = communityRegistrationFieldsSchema.extend({
  requestId: z.string().uuid(FORM_ERROR_MESSAGE),
  turnstileToken: z.string().min(1, FORM_ERROR_MESSAGE).max(2048, FORM_ERROR_MESSAGE),
  website: z.string().max(0, FORM_ERROR_MESSAGE)
}).strict();

export type CommunityRegistrationFields = z.input<typeof communityRegistrationFieldsSchema>;
export type CommunityRegistrationRequest = z.output<typeof communityRegistrationRequestSchema>;

export function getFieldErrors(error: z.ZodError): Partial<Record<keyof CommunityRegistrationFields, string>> {
  const result: Partial<Record<keyof CommunityRegistrationFields, string>> = {};

  for (const issue of error.issues) {
    const field = issue.path[0];
    if (typeof field !== "string" || field in result) continue;
    if (["name", "email", "facultyDepartment", "studentId", "year", "interests", "motivation"].includes(field)) {
      result[field as keyof CommunityRegistrationFields] = FORM_ERROR_MESSAGE;
    }
  }

  return result;
}
