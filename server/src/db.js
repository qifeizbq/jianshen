import Database from "better-sqlite3";
import fs from "node:fs";
import path from "node:path";
import { defaultProfile, defaultReadiness, defaultTrainingPlan, exerciseCatalog } from "./catalog.js";

const dataDir = path.join(process.cwd(), "data");
fs.mkdirSync(dataDir, { recursive: true });

const db = new Database(path.join(dataDir, "fit-ai.db"));
db.pragma("journal_mode = WAL");

db.exec(`
  CREATE TABLE IF NOT EXISTS profile (
    id INTEGER PRIMARY KEY CHECK (id = 1),
    data_json TEXT NOT NULL,
    updated_at TEXT NOT NULL
  );
  CREATE TABLE IF NOT EXISTS readiness (
    id INTEGER PRIMARY KEY CHECK (id = 1),
    data_json TEXT NOT NULL,
    updated_at TEXT NOT NULL
  );
  CREATE TABLE IF NOT EXISTS records (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    performed_at TEXT NOT NULL,
    exercise_name TEXT NOT NULL,
    weight REAL DEFAULT 0,
    sets_count INTEGER DEFAULT 0,
    reps_text TEXT NOT NULL,
    notes TEXT DEFAULT '',
    day_of_week INTEGER DEFAULT 0,
    created_at TEXT NOT NULL
  );
  CREATE TABLE IF NOT EXISTS ai_state (
    id INTEGER PRIMARY KEY CHECK (id = 1),
    data_json TEXT NOT NULL,
    updated_at TEXT NOT NULL
  );
  CREATE TABLE IF NOT EXISTS training_plan (
    id INTEGER PRIMARY KEY CHECK (id = 1),
    plan_json TEXT NOT NULL,
    updated_at TEXT NOT NULL
  );
  CREATE TABLE IF NOT EXISTS memory_entries (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    category TEXT NOT NULL,
    title TEXT NOT NULL,
    content TEXT NOT NULL,
    score REAL DEFAULT 0.5,
    source_trigger TEXT NOT NULL,
    metadata_json TEXT DEFAULT '{}',
    created_at TEXT NOT NULL
  );
  CREATE TABLE IF NOT EXISTS app_meta (
    key TEXT PRIMARY KEY,
    value_json TEXT NOT NULL,
    updated_at TEXT NOT NULL
  );
`);

function nowIso() {
  return new Date().toISOString();
}

function ensureSingleton(tableName, payload) {
  const isPlan = tableName === "training_plan";
  const columnName = isPlan ? "plan_json" : "data_json";
  const row = db.prepare(`SELECT id FROM ${tableName} WHERE id = 1`).get();
  if (!row) {
    db.prepare(`INSERT INTO ${tableName} (id, ${columnName}, updated_at) VALUES (1, ?, ?)`)
      .run(JSON.stringify(payload), nowIso());
    return;
  }
  db.prepare(`UPDATE ${tableName} SET ${columnName} = ?, updated_at = ? WHERE id = 1`)
    .run(JSON.stringify(payload), nowIso());
}

ensureSingleton("profile", defaultProfile);
ensureSingleton("readiness", defaultReadiness);
ensureSingleton("training_plan", defaultTrainingPlan);
ensureSingleton("ai_state", {
  lastSummary: "完成一次训练后，AI 会开始建立长期记忆与进阶建议。",
  recovery: "先记录训练，系统才能形成真正的闭环。",
  planSummary: "当前使用默认微周期，等待 AI 根据历史主动接管。",
  weeklyFocus: "优先建立稳定记录习惯。",
  todayDecision: "先从今天的主项动作开始，保证动作标准。",
  riskAlert: "暂未识别到特殊风险。",
  cycleGoal: "完成第一轮可回看的训练数据积累。",
  nextSessionTarget: "完成 1 次完整训练记录后，AI 会生成更具体目标。",
  nextFocus: ["完成主项记录", "写下主观感受", "保证恢复"],
  benchmarkFeatures: ["云端训练历史", "AI 复盘", "长期记忆"],
  prTargets: [],
  replacementIdeas: []
});

const catalogRow = db.prepare(`SELECT key FROM app_meta WHERE key = 'exercise_catalog'`).get();
if (!catalogRow) {
  db.prepare(`INSERT INTO app_meta (key, value_json, updated_at) VALUES (?, ?, ?)`)
    .run("exercise_catalog", JSON.stringify(exerciseCatalog), nowIso());
}

const customExercisesRow = db.prepare(`SELECT key FROM app_meta WHERE key = 'custom_exercises'`).get();
if (!customExercisesRow) {
  db.prepare(`INSERT INTO app_meta (key, value_json, updated_at) VALUES (?, ?, ?)`)
    .run("custom_exercises", JSON.stringify([]), nowIso());
}

function getMetaJson(key, fallback) {
  const row = db.prepare("SELECT value_json FROM app_meta WHERE key = ?").get(key);
  if (!row?.value_json) {
    return fallback;
  }
  try {
    return JSON.parse(row.value_json);
  } catch {
    return fallback;
  }
}

function saveMetaJson(key, payload) {
  const row = db.prepare("SELECT key FROM app_meta WHERE key = ?").get(key);
  if (!row) {
    db.prepare("INSERT INTO app_meta (key, value_json, updated_at) VALUES (?, ?, ?)")
      .run(key, JSON.stringify(payload), nowIso());
    return;
  }
  db.prepare("UPDATE app_meta SET value_json = ?, updated_at = ? WHERE key = ?")
    .run(JSON.stringify(payload), nowIso(), key);
}

export function getProfile() {
  return JSON.parse(db.prepare("SELECT data_json FROM profile WHERE id = 1").get().data_json);
}

export function saveProfile(profile) {
  ensureSingleton("profile", profile);
  return getProfile();
}

export function getReadiness() {
  return JSON.parse(db.prepare("SELECT data_json FROM readiness WHERE id = 1").get().data_json);
}

export function saveReadiness(readiness) {
  ensureSingleton("readiness", readiness);
  return getReadiness();
}

export function getPlan() {
  return JSON.parse(db.prepare("SELECT plan_json FROM training_plan WHERE id = 1").get().plan_json);
}

export function savePlan(plan) {
  ensureSingleton("training_plan", plan);
  return getPlan();
}

export function getAIState() {
  return JSON.parse(db.prepare("SELECT data_json FROM ai_state WHERE id = 1").get().data_json);
}

export function saveAIState(state) {
  ensureSingleton("ai_state", state);
  return getAIState();
}

export function listExercises() {
  const baseExercises = getMetaJson("exercise_catalog", exerciseCatalog);
  const customExercises = getMetaJson("custom_exercises", []);
  return [...baseExercises, ...customExercises];
}

export function listCustomExercises() {
  return getMetaJson("custom_exercises", []);
}

export function saveCustomExercises(exercises) {
  saveMetaJson("custom_exercises", exercises);
  return listCustomExercises();
}

export function addCustomExercise(exercise) {
  const current = listCustomExercises();
  const filtered = current.filter((item) => item.name !== exercise.name);
  filtered.push(exercise);
  saveCustomExercises(filtered);
  return listCustomExercises();
}

export function listRecords(limit = 120) {
  return db.prepare(`
    SELECT id, performed_at, exercise_name, weight, sets_count, reps_text, notes, day_of_week, created_at
    FROM records
    ORDER BY datetime(performed_at) DESC, id DESC
    LIMIT ?
  `).all(limit).map((row) => ({
    id: row.id,
    performedAt: row.performed_at,
    exerciseName: row.exercise_name,
    weight: row.weight,
    sets: row.sets_count,
    reps: row.reps_text,
    notes: row.notes,
    dayOfWeek: row.day_of_week,
    createdAt: row.created_at
  }));
}

export function addRecord(record) {
  db.prepare(`
    INSERT INTO records (performed_at, exercise_name, weight, sets_count, reps_text, notes, day_of_week, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    record.performedAt,
    record.exerciseName,
    record.weight ?? 0,
    record.sets ?? 0,
    record.reps ?? "",
    record.notes ?? "",
    record.dayOfWeek ?? new Date(record.performedAt).getDay(),
    nowIso()
  );
}

export function addMemoryEntry(entry) {
  db.prepare(`
    INSERT INTO memory_entries (category, title, content, score, source_trigger, metadata_json, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `).run(
    entry.category,
    entry.title,
    entry.content,
    entry.score ?? 0.5,
    entry.sourceTrigger,
    JSON.stringify(entry.metadata ?? {}),
    nowIso()
  );
}

export function listMemory(limit = 50) {
  return db.prepare(`
    SELECT id, category, title, content, score, source_trigger, metadata_json, created_at
    FROM memory_entries
    ORDER BY datetime(created_at) DESC, id DESC
    LIMIT ?
  `).all(limit).map((row) => ({
    id: row.id,
    category: row.category,
    title: row.title,
    content: row.content,
    score: row.score,
    sourceTrigger: row.source_trigger,
    metadata: JSON.parse(row.metadata_json || "{}"),
    createdAt: row.created_at
  }));
}

export function getStats() {
  const records = listRecords(500);
  const uniqueDays = new Set(records.map((record) => record.performedAt.slice(0, 10)));
  const maxWeight = records.reduce((max, record) => Math.max(max, Number(record.weight) || 0), 0);
  const totalVolume = records.reduce((sum, record) => {
    const repsNumber = Number.parseInt(String(record.reps), 10);
    return sum + (Number(record.weight) || 0) * (record.sets || 0) * (Number.isNaN(repsNumber) ? 0 : repsNumber);
  }, 0);

  return {
    totalRecords: records.length,
    totalTrainingDays: uniqueDays.size,
    maxWeight,
    totalVolume
  };
}

