import { Router, type Request } from "express";
import { requireDeskRole } from "../middleware/auth";

// Mentor Desk and Teacher Assistance Desk APIs. Each router only admits its own role
// (requireDeskRole); desk accounts are blocked from every other API by restrictDeskRoles.

const deskProfile = (req: Request) => ({
  name: req.user?.name || (req.auth?.name as string | undefined) || req.auth?.email?.split("@")[0] || "",
  email: req.user?.email || req.auth?.email || "",
  role: req.user?.role,
});

// /api/mentor-desk
export const mentorDeskRouter = Router();
mentorDeskRouter.use(requireDeskRole("mentor"));
// GET /api/mentor-desk/me — the signed-in mentor
mentorDeskRouter.get("/me", (req, res) => {
  res.json({ success: true, data: deskProfile(req) });
});

// /api/teacher-assistant-desk
export const teacherAssistantDeskRouter = Router();
teacherAssistantDeskRouter.use(requireDeskRole("teacher_assistant"));
// GET /api/teacher-assistant-desk/me — the signed-in teacher assistance user
teacherAssistantDeskRouter.get("/me", (req, res) => {
  res.json({ success: true, data: deskProfile(req) });
});
