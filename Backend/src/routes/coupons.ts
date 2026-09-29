import { Router } from "express";
import { db } from "@workspace/db";
import { couponsTable } from "@workspace/db/schema";
import { eq } from "drizzle-orm";

const router = Router();

// Validate a coupon
router.post("/validate", async (req, res) => {
  const { code } = req.body;
  
  if (!code) {
    return res.status(400).json({ error: "Coupon code is required" });
  }

  try {
    const coupons = await db.select().from(couponsTable).where(eq(couponsTable.code, code.toUpperCase()));
    const coupon = coupons[0];
    
    if (!coupon) {
      return res.status(404).json({ error: "Invalid coupon code" });
    }
    
    res.json({ valid: true, discountPercent: coupon.discountPercent });
    return;
  } catch (error) {
    res.status(500).json({ error: "Failed to validate coupon" });
    return;
  }
});

export default router;
