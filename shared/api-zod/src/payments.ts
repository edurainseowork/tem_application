import * as zod from "zod";

// Razorpay checkout requests from the app. Prices are never accepted from the client.
export const CreatePaymentOrderBody = zod.object({
  courseId: zod.coerce.number({ required_error: "Course is required", invalid_type_error: "Invalid course" }).int().positive("Invalid course"),
  couponCode: zod.string().trim().max(30).optional().transform((code) => (code ? code.toUpperCase() : undefined)),
});

export type CreatePaymentOrderBody = zod.infer<typeof CreatePaymentOrderBody>;

const razorpayId = (prefix: string, label: string) =>
  zod.string({ required_error: `${label} is required` }).trim().regex(new RegExp(`^${prefix}_[A-Za-z0-9]+$`), `Invalid ${label}`);

export const VerifyPaymentBody = zod.object({
  razorpay_order_id: razorpayId("order", "order ID"),
  razorpay_payment_id: razorpayId("pay", "payment ID"),
  razorpay_signature: zod.string({ required_error: "Signature is required" }).trim().regex(/^[a-f0-9]{64}$/, "Invalid signature"),
});

export type VerifyPaymentBody = zod.infer<typeof VerifyPaymentBody>;

export const PaymentFailedBody = zod.object({
  razorpay_order_id: razorpayId("order", "order ID"),
  reason: zod.string().trim().max(500).optional(),
});

export type PaymentFailedBody = zod.infer<typeof PaymentFailedBody>;
