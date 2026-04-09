import express from "express";
import cors from "cors";
import path from "node:path";
import fs from "node:fs";
import { fileURLToPath } from "node:url";
import { z } from "zod";
import {
  addRecord,
  getAIState,
  getPlan,
  getProfile,
  getReadiness,
  getStats,
  listCustomExercises,
  listExercises,
  listMemory,
  listRecords,
  savePlan,
  saveProfile,
  saveReadiness
} from "./db.js";
import {
  applySuggestedDayPlan,
  applySuggestedExercises,
  applySuggestedWeekPlan,
  chatWithCoach,
  generateDailyBriefing,
  generateDietAdvice,
  regeneratePlan,
  runCoachWorkflow
} from "./workflow.js";
import { getAIConfig } from "./ai.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const app = express();
const port = Number(process.env.PORT || 8787);

app.use(cors());
app.use(express.json({ limit: "1mb" }));

const profileSchema = z.object({
  name: z.string().min(1).max(80).default("本机训练者"),
  weight: z.number().min(30).max(250),
  height: z.number().min(120).max(230),
  age: z.number().min(12).max(90),
  goal: z.string().min(1),
  experience: z.string().min(1),
  daysPerWeek: z.number().min(1).max(7),
  dailyMinutes: z.number().min(15).max(240),
  focusAreas: z.string().max(200),
  injuries: z.string().max(200),
  equipmentText: z.string().max(1000)
});

const readinessSchema = z.object({
  sleep: z.number().min(1).max(5),
  energy: z.number().min(1).max(5),
  soreness: z.number().min(1).max(5),
  stress: z.number().min(1).max(5)
});

const recordSchema = z.object({
  performedAt: z.string().min(1),
  exerciseName: z.string().min(1),
  weight: z.number().min(0).max(500),
  sets: z.number().min(1).max(20),
  reps: z.string().min(1).max(30),
  notes: z.string().max(300).optional().default(""),
  dayOfWeek: z.number().min(0).max(6)
});

const customExerciseSchema = z.object({
  name: z.string().min(1).max(80),
  muscleGroup: z.string().min(1).max(40),
  targetMuscles: z.array(z.string().min(1).max(40)).max(8).default([]),
  equipment: z.string().min(1).max(80).default("自定义器材 / 动作"),
  description: z.array(z.string().min(1).max(120)).max(6).default([]),
  tips: z.array(z.string().min(1).max(120)).max(6).default([]),
  recommendedWeight: z.string().min(1).max(40).default("自重"),
  defaultSets: z.number().min(1).max(10).default(3),
  defaultReps: z.string().min(1).max(30).default("10-12"),
  bvid: z.string().max(40).optional().default(""),
  videoTitle: z.string().max(120).optional().default("")
});

const chatSchema = z.object({
  message: z.string().min(1).max(1000)
});

const dayPlanSchema = z.object({
  day: z.number().min(0).max(6),
  title: z.string().min(1).max(80),
  duration: z.string().min(1).max(40),
  focus: z.string().min(1).max(120),
  exercises: z.array(z.string().min(1).max(80)).max(8)
});

function sendError(res, error, code = 400) {
  res.status(code).json({ error: error.message || "请求失败" });
}

app.get("/api/bootstrap", async (_req, res) => {
  try {
    res.json({
      profile: getProfile(),
      readiness: getReadiness(),
      aiState: getAIState(),
      plan: getPlan(),
      records: listRecords(180),
      exercises: listExercises(),
      customExercises: listCustomExercises(),
      memory: listMemory(40),
      stats: getStats(),
      aiConfig: getAIConfig()
    });
  } catch (error) {
    sendError(res, error, 500);
  }
});

app.post("/api/profile", async (req, res) => {
  try {
    const saved = saveProfile(profileSchema.parse(req.body));
    const aiState = await runCoachWorkflow("profile_updated");
    res.json({ profile: saved, aiState });
  } catch (error) {
    sendError(res, error);
  }
});

app.post("/api/readiness", async (req, res) => {
  try {
    const saved = saveReadiness(readinessSchema.parse(req.body));
    const aiState = await runCoachWorkflow("readiness_updated");
    res.json({ readiness: saved, aiState });
  } catch (error) {
    sendError(res, error);
  }
});

app.post("/api/records", async (req, res) => {
  try {
    addRecord(recordSchema.parse(req.body));
    const aiState = await runCoachWorkflow("record_added");
    res.json({
      records: listRecords(180),
      aiState,
      memory: listMemory(40),
      stats: getStats()
    });
  } catch (error) {
    sendError(res, error);
  }
});

app.get("/api/memory", (_req, res) => {
  try {
    res.json({ memory: listMemory(60) });
  } catch (error) {
    sendError(res, error, 500);
  }
});

app.post("/api/ai/workflow", async (req, res) => {
  try {
    const trigger = z.string().default("manual_refresh").parse(req.body?.trigger || "manual_refresh");
    const aiState = await runCoachWorkflow(trigger);
    res.json({ aiState, memory: listMemory(40) });
  } catch (error) {
    sendError(res, error, 500);
  }
});

app.post("/api/ai/plan", async (_req, res) => {
  try {
    const plan = await regeneratePlan();
    res.json({ plan, aiState: getAIState() });
  } catch (error) {
    sendError(res, error, 500);
  }
});

app.post("/api/ai/chat", async (req, res) => {
  try {
    const payload = chatSchema.parse(req.body);
    res.json(await chatWithCoach(payload.message));
  } catch (error) {
    sendError(res, error, 500);
  }
});

app.post("/api/plan/apply-week", async (req, res) => {
  try {
    const plan = applySuggestedWeekPlan(req.body);
    const aiState = await runCoachWorkflow("chat_apply_week_plan");
    res.json({ plan, aiState, memory: listMemory(40) });
  } catch (error) {
    sendError(res, error, 500);
  }
});

app.post("/api/plan/apply-day", async (req, res) => {
  try {
    const dayPlan = dayPlanSchema.parse(req.body);
    const plan = applySuggestedDayPlan(dayPlan);
    const aiState = await runCoachWorkflow("chat_apply_day_plan");
    res.json({ plan, aiState, memory: listMemory(40) });
  } catch (error) {
    sendError(res, error, 500);
  }
});

app.post("/api/plan/save", async (req, res) => {
  try {
    const plan = savePlan(req.body);
    const aiState = await runCoachWorkflow("plan_saved");
    res.json({ plan, aiState, memory: listMemory(40) });
  } catch (error) {
    sendError(res, error, 500);
  }
});

app.post("/api/exercises/custom", async (req, res) => {
  try {
    const list = Array.isArray(req.body) ? req.body.map((item) => customExerciseSchema.parse(item)) : [customExerciseSchema.parse(req.body)];
    const saved = applySuggestedExercises(list);
    const aiState = await runCoachWorkflow("custom_exercise_added");
    res.json({ customExercises: listCustomExercises(), added: saved, exercises: listExercises(), aiState, memory: listMemory(40) });
  } catch (error) {
    sendError(res, error, 500);
  }
});

app.post("/api/ai/daily-briefing", async (_req, res) => {
  try {
    res.json({ briefing: await generateDailyBriefing() });
  } catch (error) {
    sendError(res, error, 500);
  }
});

app.post("/api/ai/diet", async (_req, res) => {
  try {
    res.json({ advice: await generateDietAdvice() });
  } catch (error) {
    sendError(res, error, 500);
  }
});

const clientDist = path.resolve(__dirname, "../../client/dist");
if (fs.existsSync(clientDist)) {
  app.use(express.static(clientDist));
  app.use((req, res, next) => {
    if (req.path.startsWith("/api")) {
      next();
      return;
    }
    res.sendFile(path.join(clientDist, "index.html"));
  });
}

app.listen(port, () => {
  console.log(`Fit AI server listening on http://localhost:${port}`);
});

