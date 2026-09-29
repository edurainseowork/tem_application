import { Router } from "express";
import { db } from "@workspace/db";
import { bannersTable } from "@workspace/db/schema";
import { eq, desc } from "drizzle-orm";

const router = Router();

// Get all banners
router.get("/", async (req, res) => {
  try {
    const banners = await db.select().from(bannersTable).orderBy(desc(bannersTable.createdAt));
    res.json({ success: true, data: banners });
  } catch (error) {
    res.status(500).json({ error: "Failed to fetch banners" });
  }
});

// Create a banner
router.post("/", async (req, res) => {
  const { imageUrl } = req.body;
  if (!imageUrl) {
    return res.status(400).json({ error: "imageUrl is required" });
  }
  
  try {
    const count = await db.select().from(bannersTable);
    if (count.length >= 5) {
      return res.status(400).json({ error: "Maximum 5 banners allowed. Delete one first." });
    }

    const newBanner = await db.insert(bannersTable).values({ imageUrl }).returning();
    res.json({ success: true, data: newBanner[0] });
  } catch (error: any) {
    res.status(500).json({ error: "Failed to create banner", details: error.message });
  }
});

// Delete a banner
router.delete("/:id", async (req, res) => {
  const { id } = req.params;
  try {
    await db.delete(bannersTable).where(eq(bannersTable.id, parseInt(id)));
    res.json({ success: true });
  } catch (error: any) {
    res.status(500).json({ error: "Failed to delete banner", details: error.message });
  }
});

export default router;
