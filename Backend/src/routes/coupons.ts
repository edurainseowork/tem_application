import { Router } from "express";
import { db } from "@workspace/db";
import { couponCoursesTable, couponRedemptionsTable, couponsTable, coursesTable, type Coupon } from "@workspace/db/schema";
import { ApplyCouponBody, CouponBody, normalizeCouponCode } from "@workspace/api-zod";
import { and, asc, eq, inArray, isNull, lt, ne, or, sql } from "drizzle-orm";
import { requireAdmin, requireAuth } from "../middlewares/auth.js";

const router = Router();

type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0];

const parseId = (value: string) => {
  const id = Number(value);
  return Number.isInteger(id) && id > 0 ? id : null;
};

const isExhausted = (coupon: Coupon) => coupon.usageLimit !== null && coupon.usedCount >= coupon.usageLimit;

const getCouponCourseIds = async (couponIds: number[]) => {
  const map = new Map<number, number[]>(couponIds.map((id) => [id, []]));
  if (couponIds.length === 0) return map;
  const rows = await db.select().from(couponCoursesTable).where(inArray(couponCoursesTable.couponId, couponIds));
  for (const row of rows) map.get(row.couponId)?.push(row.courseId);
  return map;
};

const serializeCoupon = (coupon: Coupon, courseIds: number[]) => ({
  ...coupon,
  courseIds,
  // Coupons created before course selection existed have no courses and apply to every course
  appliesToAllCourses: courseIds.length === 0,
  status: !coupon.isActive || isExhausted(coupon) ? "expired" : "active",
});

export const calculateDiscount = (price: number, discountPercent: number) => {
  const discountAmount = Math.round((price * discountPercent) / 100);
  return { originalPrice: price, discountAmount, finalPrice: price - discountAmount };
};

type CouponCheck =
  | { ok: true; coupon: Coupon }
  | { ok: false; status: number; error: string };

// Checks that a coupon exists, is still usable and applies to the given course (when one is given)
export const checkCoupon = async (rawCode: string, courseId?: number): Promise<CouponCheck> => {
  const [coupon] = await db.select().from(couponsTable).where(eq(couponsTable.code, normalizeCouponCode(rawCode)));
  if (!coupon) return { ok: false, status: 404, error: "Invalid coupon code" };
  if (!coupon.isActive || isExhausted(coupon)) return { ok: false, status: 400, error: "This coupon has expired" };

  if (courseId !== undefined) {
    const courseIds = (await getCouponCourseIds([coupon.id])).get(coupon.id) ?? [];
    if (courseIds.length > 0 && !courseIds.includes(courseId)) {
      return { ok: false, status: 400, error: "This coupon is not valid for this course" };
    }
  }
  return { ok: true, coupon };
};

/**
 * Records one use of a coupon. The usage check and increment happen in a single UPDATE, so concurrent
 * redemptions can never push a private coupon past its frequency; it is deactivated by the use that reaches it.
 * Returns null when the coupon has no uses left. With a razorpayOrderId, retries for the same order are not double counted.
 */
export const redeemCoupon = async (
  tx: Tx,
  couponId: number,
  details: { courseId?: number; firebaseUid?: string; razorpayOrderId?: string },
  { enforceLimit = true } = {},
) => {
  const [redemption] = await tx.insert(couponRedemptionsTable).values({
    couponId,
    courseId: details.courseId ?? null,
    firebaseUid: details.firebaseUid ?? null,
    razorpayOrderId: details.razorpayOrderId ?? null,
  }).onConflictDoNothing().returning({ id: couponRedemptionsTable.id });
  if (!redemption) {
    const [coupon] = await tx.select().from(couponsTable).where(eq(couponsTable.id, couponId));
    return coupon ?? null;
  }

  const [coupon] = await tx.update(couponsTable)
    .set({
      usedCount: sql`${couponsTable.usedCount} + 1`,
      isActive: sql`${couponsTable.usageLimit} IS NULL OR ${couponsTable.usedCount} + 1 < ${couponsTable.usageLimit}`,
    })
    .where(enforceLimit
      ? and(eq(couponsTable.id, couponId), eq(couponsTable.isActive, true), or(isNull(couponsTable.usageLimit), lt(couponsTable.usedCount, couponsTable.usageLimit)))
      : eq(couponsTable.id, couponId))
    .returning();
  if (!coupon) throw new CouponExhaustedError();
  return coupon;
};

export class CouponExhaustedError extends Error {
  constructor() {
    super("This coupon has reached its usage limit");
  }
}

const findCodeConflict = async (code: string, excludeId?: number) => {
  const [existing] = await db.select({ id: couponsTable.id }).from(couponsTable)
    .where(and(sql`upper(${couponsTable.code}) = ${code}`, excludeId ? ne(couponsTable.id, excludeId) : undefined));
  return !!existing;
};

const findMissingCourses = async (courseIds: number[]) => {
  const found = await db.select({ id: coursesTable.id }).from(coursesTable).where(inArray(coursesTable.id, courseIds));
  const foundIds = new Set(found.map((course) => course.id));
  return courseIds.filter((id) => !foundIds.has(id));
};

// ---------- Public / student endpoints ----------

// Validate a coupon, optionally for a specific course (returns the discounted price when a course is given)
router.post("/validate", async (req, res) => {
  const { code, courseId: rawCourseId } = req.body ?? {};
  if (!code || typeof code !== "string") {
    res.status(400).json({ error: "Coupon code is required" });
    return;
  }
  const courseId = rawCourseId === undefined || rawCourseId === null ? undefined : parseId(String(rawCourseId));
  if (courseId === null) {
    res.status(400).json({ error: "Invalid course" });
    return;
  }

  try {
    const result = await checkCoupon(code, courseId);
    if (!result.ok) {
      res.status(result.status).json({ valid: false, error: result.error });
      return;
    }

    const { coupon } = result;
    let pricing = {};
    if (courseId !== undefined) {
      const [course] = await db.select({ price: coursesTable.price }).from(coursesTable).where(eq(coursesTable.id, courseId));
      if (!course) {
        res.status(404).json({ valid: false, error: "Course not found" });
        return;
      }
      pricing = calculateDiscount(course.price, coupon.discountPercent);
    }

    res.json({ valid: true, code: coupon.code, discountPercent: coupon.discountPercent, ...pricing });
  } catch (error) {
    console.error("Failed to validate coupon", error);
    res.status(500).json({ error: "Failed to validate coupon" });
  }
});

// Active public coupons for a course, so the app can suggest them
router.get("/public", async (req, res) => {
  const courseId = parseId(String(req.query.courseId ?? ""));
  if (!courseId) {
    res.status(400).json({ error: "courseId is required" });
    return;
  }

  try {
    const coupons = await db.select().from(couponsTable)
      .where(and(eq(couponsTable.isPublic, true), eq(couponsTable.isActive, true)))
      .orderBy(asc(couponsTable.id));
    const courseIdsByCoupon = await getCouponCourseIds(coupons.map((coupon) => coupon.id));
    const applicable = coupons.filter((coupon) => {
      const courseIds = courseIdsByCoupon.get(coupon.id) ?? [];
      return courseIds.length === 0 || courseIds.includes(courseId);
    });
    res.json({ success: true, data: applicable.map(({ code, discountPercent }) => ({ code, discountPercent })) });
  } catch (error) {
    console.error("Failed to fetch public coupons", error);
    res.status(500).json({ error: "Failed to fetch coupons" });
  }
});

// Use a coupon for a course purchase (signed-in students)
router.post("/redeem", requireAuth, async (req, res) => {
  const parsed = ApplyCouponBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.issues[0]?.message || "Invalid request" });
    return;
  }

  try {
    const { code, courseId } = parsed.data;
    const result = await checkCoupon(code, courseId);
    if (!result.ok) {
      res.status(result.status).json({ error: result.error });
      return;
    }
    const [course] = await db.select({ price: coursesTable.price }).from(coursesTable).where(eq(coursesTable.id, courseId));
    if (!course) {
      res.status(404).json({ error: "Course not found" });
      return;
    }

    const coupon = await db.transaction((tx) => redeemCoupon(tx, result.coupon.id, { courseId, firebaseUid: res.locals.firebaseUser.uid }));
    res.json({ success: true, code: result.coupon.code, discountPercent: result.coupon.discountPercent, ...calculateDiscount(course.price, result.coupon.discountPercent), couponActive: coupon?.isActive ?? false });
  } catch (error) {
    if (error instanceof CouponExhaustedError) {
      res.status(400).json({ error: "This coupon has expired" });
      return;
    }
    console.error("Failed to redeem coupon", error);
    res.status(500).json({ error: "Failed to apply coupon" });
  }
});

// ---------- Admin endpoints ----------

// List all coupons with their courses and usage
router.get("/", requireAdmin, async (_req, res) => {
  try {
    const coupons = await db.select().from(couponsTable).orderBy(asc(couponsTable.id));
    const courseIdsByCoupon = await getCouponCourseIds(coupons.map((coupon) => coupon.id));
    res.json({ success: true, data: coupons.map((coupon) => serializeCoupon(coupon, courseIdsByCoupon.get(coupon.id) ?? [])) });
  } catch (error) {
    console.error("Failed to fetch coupons", error);
    res.status(500).json({ error: "Failed to fetch coupons" });
  }
});

router.get("/:id", requireAdmin, async (req, res) => {
  const id = parseId(req.params.id as string);
  if (!id) {
    res.status(400).json({ error: "Invalid coupon ID" });
    return;
  }
  try {
    const [coupon] = await db.select().from(couponsTable).where(eq(couponsTable.id, id));
    if (!coupon) {
      res.status(404).json({ error: "Coupon not found" });
      return;
    }
    const courseIds = (await getCouponCourseIds([id])).get(id) ?? [];
    res.json({ success: true, data: serializeCoupon(coupon, courseIds) });
  } catch (error) {
    console.error("Failed to fetch coupon", error);
    res.status(500).json({ error: "Failed to fetch coupon" });
  }
});

router.post("/", requireAdmin, async (req, res) => {
  const parsed = CouponBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.issues[0]?.message || "Invalid coupon details", issues: parsed.error.issues });
    return;
  }

  try {
    const { code, discountPercent, isPublic, courseIds, usageLimit } = parsed.data;
    if (await findCodeConflict(code)) {
      res.status(409).json({ error: `Coupon code ${code} already exists` });
      return;
    }
    const missing = await findMissingCourses(courseIds);
    if (missing.length > 0) {
      res.status(400).json({ error: `Course not found: ${missing.join(", ")}` });
      return;
    }

    const coupon = await db.transaction(async (tx) => {
      const [created] = await tx.insert(couponsTable).values({ code, discountPercent, isPublic, usageLimit, usedCount: 0, isActive: true }).returning();
      await tx.insert(couponCoursesTable).values(courseIds.map((courseId) => ({ couponId: created.id, courseId })));
      return created;
    });
    res.status(201).json({ success: true, data: serializeCoupon(coupon, courseIds) });
  } catch (error: any) {
    if (error?.code === "23505") {
      res.status(409).json({ error: "Coupon code already exists" });
      return;
    }
    console.error("Failed to create coupon", error);
    res.status(500).json({ error: "Failed to create coupon" });
  }
});

router.put("/:id", requireAdmin, async (req, res) => {
  const id = parseId(req.params.id as string);
  if (!id) {
    res.status(400).json({ error: "Invalid coupon ID" });
    return;
  }
  const parsed = CouponBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.issues[0]?.message || "Invalid coupon details", issues: parsed.error.issues });
    return;
  }

  try {
    const { code, discountPercent, isPublic, courseIds, usageLimit } = parsed.data;
    const [existing] = await db.select().from(couponsTable).where(eq(couponsTable.id, id));
    if (!existing) {
      res.status(404).json({ error: "Coupon not found" });
      return;
    }
    if (await findCodeConflict(code, id)) {
      res.status(409).json({ error: `Coupon code ${code} already exists` });
      return;
    }
    if (usageLimit !== null && usageLimit < existing.usedCount) {
      res.status(400).json({ error: `Frequency cannot be lower than the current usage (${existing.usedCount})` });
      return;
    }
    const missing = await findMissingCourses(courseIds);
    if (missing.length > 0) {
      res.status(400).json({ error: `Course not found: ${missing.join(", ")}` });
      return;
    }

    const coupon = await db.transaction(async (tx) => {
      const [updated] = await tx.update(couponsTable).set({
        code,
        discountPercent,
        isPublic,
        usageLimit,
        // Raising the frequency (or switching to public) re-activates a coupon that had hit its limit
        isActive: usageLimit === null ? true : sql`${couponsTable.usedCount} < ${usageLimit}`,
      }).where(eq(couponsTable.id, id)).returning();
      await tx.delete(couponCoursesTable).where(eq(couponCoursesTable.couponId, id));
      await tx.insert(couponCoursesTable).values(courseIds.map((courseId) => ({ couponId: id, courseId })));
      return updated;
    });
    res.json({ success: true, data: serializeCoupon(coupon, courseIds) });
  } catch (error: any) {
    if (error?.code === "23505") {
      res.status(409).json({ error: "Coupon code already exists" });
      return;
    }
    console.error("Failed to update coupon", error);
    res.status(500).json({ error: "Failed to update coupon" });
  }
});

router.delete("/:id", requireAdmin, async (req, res) => {
  const id = parseId(req.params.id as string);
  if (!id) {
    res.status(400).json({ error: "Invalid coupon ID" });
    return;
  }
  try {
    await db.delete(couponsTable).where(eq(couponsTable.id, id));
    res.json({ success: true });
  } catch (error) {
    console.error("Failed to delete coupon", error);
    res.status(500).json({ error: "Failed to delete coupon" });
  }
});

export default router;
