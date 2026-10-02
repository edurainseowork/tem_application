import * as zod from "zod";

export const COUPON_CODE_REGEX = /^[A-Z0-9_-]{3,30}$/;

// Coupon codes are stored and matched in upper case
export const normalizeCouponCode = (code: string) => code.trim().toUpperCase();

export const CouponBody = zod
  .object({
    code: zod
      .string({ required_error: "Coupon code is required" })
      .transform(normalizeCouponCode)
      .pipe(zod.string().regex(COUPON_CODE_REGEX, "Coupon code must be 3–30 characters: letters, numbers, - or _")),
    discountPercent: zod.coerce
      .number({ invalid_type_error: "Discount must be a number" })
      .int("Discount must be a whole number")
      .min(1, "Discount must be between 1 and 100%")
      .max(100, "Discount must be between 1 and 100%"),
    isPublic: zod.boolean({ required_error: "Coupon type is required" }),
    courseIds: zod
      .array(zod.coerce.number().int().positive(), { required_error: "Select at least one course" })
      .min(1, "Select at least one course")
      .transform((ids) => [...new Set(ids)]),
    usageLimit: zod.coerce
      .number({ invalid_type_error: "Frequency must be a number" })
      .int("Frequency must be a whole number")
      .positive("Frequency must be a positive number")
      .max(1_000_000, "Frequency is too large")
      .nullish(),
  })
  .superRefine((value, ctx) => {
    if (!value.isPublic && value.usageLimit == null) {
      ctx.addIssue({ code: zod.ZodIssueCode.custom, path: ["usageLimit"], message: "Frequency is required for private coupons" });
    }
  })
  // Public coupons are unlimited
  .transform((value) => ({ ...value, usageLimit: value.isPublic ? null : value.usageLimit ?? null }));

export type CouponBody = zod.infer<typeof CouponBody>;

export const ApplyCouponBody = zod.object({
  code: zod.string({ required_error: "Coupon code is required" }).trim().min(1, "Coupon code is required").transform(normalizeCouponCode),
  courseId: zod.coerce.number({ required_error: "Course is required" }).int().positive("Invalid course"),
});

export type ApplyCouponBody = zod.infer<typeof ApplyCouponBody>;
