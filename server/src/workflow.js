import { defaultTrainingPlan } from "./catalog.js";
import {
  addCustomExercise,
  addMemoryEntry,
  getAIState,
  getPlan,
  getProfile,
  getReadiness,
  getStats,
  listExercises,
  listMemory,
  listRecords,
  saveAIState,
  savePlan
} from "./db.js";
import { requestAIJson, requestAIText } from "./ai.js";

const DAY_LABELS = ["周日", "周一", "周二", "周三", "周四", "周五", "周六"];

function getTodayLabel(date = new Date()) {
  return DAY_LABELS[date.getDay()];
}

function normalizeMuscleGroup(groupName = "") {
  if (groupName.includes("胸")) return "chest";
  if (groupName.includes("背")) return "back";
  if (groupName.includes("肩")) return "shoulder";
  if (groupName.includes("手臂") || groupName.includes("二头") || groupName.includes("三头")) return "arm";
  return "other";
}

function getMuscleGroupLabel(key) {
  return {
    chest: "胸部",
    back: "背部",
    shoulder: "肩部",
    arm: "手臂",
    other: "辅助部位"
  }[key] || "辅助部位";
}

function clonePlan() {
  return JSON.parse(JSON.stringify(defaultTrainingPlan));
}

function buildContext() {
  const profile = getProfile();
  const readiness = getReadiness();
  const records = listRecords(180).reverse();
  const plan = getPlan();
  const exercises = listExercises();
  const memory = listMemory(20);
  const stats = getStats();

  const muscleStats = records.reduce(
    (acc, record) => {
      const exercise = exercises.find((item) => item.name === record.exerciseName);
      acc[normalizeMuscleGroup(exercise?.muscleGroup)] += 1;
      return acc;
    },
    { chest: 0, back: 0, shoulder: 0, arm: 0, other: 0 }
  );

  return {
    profile,
    readiness,
    records,
    plan,
    exercises,
    memory,
    stats,
    muscleStats,
    todayDay: new Date().getDay(),
    todayLabel: getTodayLabel()
  };
}

function buildPromptContext(context) {
  return {
    profile: context.profile,
    readiness: context.readiness,
    stats: context.stats,
    muscleStats: context.muscleStats,
    today: {
      label: context.todayLabel,
      plan: context.plan[context.todayDay] || {}
    },
    weeklyPlan: Object.entries(context.plan).map(([day, item]) => ({
      day: Number(day),
      label: DAY_LABELS[Number(day)],
      title: item.title,
      focus: item.focus,
      exercises: item.exercises
    })),
    recentRecords: context.records.slice(-12).map((record) => ({
      performedAt: record.performedAt,
      exerciseName: record.exerciseName,
      weight: record.weight,
      sets: record.sets,
      reps: record.reps,
      notes: record.notes
    })),
    recentMemory: context.memory.slice(0, 8).map((entry) => ({
      category: entry.category,
      title: entry.title,
      content: entry.content
    })),
    exerciseNames: context.exercises.map((item) => item.name)
  };
}

function buildFallbackCoachState(context) {
  const todayPlan = context.plan[context.todayDay] || { title: "主动恢复", exercises: [] };
  const weakness = Object.entries(context.muscleStats).sort((a, b) => a[1] - b[1])[0]?.[0] || "back";
  const weaknessLabel = getMuscleGroupLabel(weakness);
  const readinessScore = (
    context.readiness.sleep +
    context.readiness.energy +
    (6 - context.readiness.soreness) +
    (6 - context.readiness.stress)
  ) / 4;

  const prTargets = (todayPlan.exercises || []).slice(0, 3).map((exerciseName, index) => ({
    exercise: exerciseName,
    target: index === 0 ? "优先争取 +1 次或 +2.5kg" : "维持动作质量并稳定完成目标次数",
    reason: "当前先把主项做稳，再逐步推进重量和次数。"
  }));

  return {
    lastSummary: context.records.length
      ? `最近一次训练已经入库，系统会围绕“${todayPlan.title}”继续推进下一轮建议。`
      : "先完成一次完整训练记录，AI 才能真正开始建立长期记忆与进阶逻辑。",
    recovery: context.readiness.soreness >= 4
      ? "今天酸痛偏高，建议最后一组保留 1-2 次余力，不要每组都顶满。"
      : "恢复压力暂时可控，可以按计划稳步推进。",
    planSummary: `当前优先补齐${weaknessLabel}训练量，并维持每周 ${context.profile.daysPerWeek} 天训练节奏。`,
    weeklyFocus: `本周重点是补强${weaknessLabel}，同时继续追踪主项动作的真实进步。`,
    todayDecision: todayPlan.exercises?.length
      ? `今天主计划是“${todayPlan.title}”，优先把前两个动作做标准，再根据状态决定是否冲重量。`
      : "今天更适合主动恢复，优先步行、拉伸、补水和睡眠补偿。",
    riskAlert: context.profile.injuries && context.profile.injuries !== "无"
      ? `需要继续规避：${context.profile.injuries}`
      : "当前没有明显红灯，注意动作轨迹和恢复节奏即可。",
    cycleGoal: `先让“${todayPlan.title}”相关主项形成连续 2-3 次可追踪的进步。`,
    nextSessionTarget: prTargets[0]
      ? `${prTargets[0].exercise} 优先推进，目标：${prTargets[0].target}`
      : "先完成一次完整训练，再生成更细的下次目标。",
    nextFocus: [
      "持续记录主项重量、组数和次数",
      "每次训练后写一句主观感受",
      "每周至少保留 1 天完整恢复"
    ],
    benchmarkFeatures: ["云端训练历史", "AI 自动复盘", "长期记忆沉淀"],
    prTargets,
    replacementIdeas: (todayPlan.exercises || []).slice(0, 2).map((exerciseName, index) => ({
      source: exerciseName,
      replacement: todayPlan.exercises[index + 1] || exerciseName,
      reason: "如果器材被占用或局部不适，可以切到同天次要动作继续完成训练。"
    })),
    memoryEntries: [
      {
        category: "progress",
        title: "系统开始接管训练节奏",
        content: `AI 已将本周重点锁定为补强${weaknessLabel}，后续会继续围绕这个目标推进。`,
        score: 0.72
      }
    ]
  };
}

function normalizePlan(rawPlan) {
  const normalized = clonePlan();
  Object.entries(rawPlan || {}).forEach(([dayKey, value]) => {
    const day = Number(dayKey);
    if (Number.isNaN(day) || day < 0 || day > 6) return;
    normalized[day] = {
      title: String(value?.title || normalized[day].title),
      duration: String(value?.duration || normalized[day].duration),
      focus: String(value?.focus || normalized[day].focus),
      exercises: Array.isArray(value?.exercises)
        ? value.exercises.map((item) => String(item).trim()).filter(Boolean)
        : normalized[day].exercises
    };
  });
  return normalized;
}

function normalizeExerciseDraft(draft = {}) {
  return {
    name: String(draft.name || "").trim(),
    muscleGroup: String(draft.muscleGroup || "其他").trim(),
    targetMuscles: Array.isArray(draft.targetMuscles)
      ? draft.targetMuscles.map((item) => String(item).trim()).filter(Boolean)
      : [],
    equipment: String(draft.equipment || "自定义器材/动作").trim(),
    description: Array.isArray(draft.description)
      ? draft.description.map((item) => String(item).trim()).filter(Boolean).slice(0, 5)
      : ["这是 AI 建议加入的自定义动作，请先用轻重量熟悉轨迹。"],
    tips: Array.isArray(draft.tips)
      ? draft.tips.map((item) => String(item).trim()).filter(Boolean).slice(0, 5)
      : ["先确保动作稳定，再考虑加重或加量。"],
    recommendedWeight: String(draft.recommendedWeight || "自重").trim(),
    defaultSets: Math.max(1, Number(draft.defaultSets || 3)),
    defaultReps: String(draft.defaultReps || "10-12").trim(),
    bvid: draft.bvid ? String(draft.bvid).trim() : "",
    videoTitle: draft.videoTitle ? String(draft.videoTitle).trim() : ""
  };
}

function normalizeDayPlanDraft(rawDay, fallbackDay) {
  const fallback = getPlan()[fallbackDay] || { title: "今日训练", duration: "40 分钟", focus: "按计划推进", exercises: [] };
  return {
    day: Number.isInteger(Number(rawDay?.day)) ? Number(rawDay.day) : fallbackDay,
    title: String(rawDay?.title || fallback.title),
    duration: String(rawDay?.duration || fallback.duration),
    focus: String(rawDay?.focus || fallback.focus),
    exercises: Array.isArray(rawDay?.exercises)
      ? rawDay.exercises.map((item) => String(item).trim()).filter(Boolean)
      : fallback.exercises
  };
}

function persistCoachState(state, trigger) {
  saveAIState(state);
  const memoryEntries = Array.isArray(state.memoryEntries) ? state.memoryEntries : [];
  memoryEntries.slice(0, 4).forEach((entry) => {
    addMemoryEntry({
      category: entry.category || "insight",
      title: entry.title || "AI 训练洞察",
      content: entry.content || "",
      score: entry.score ?? 0.6,
      sourceTrigger: trigger,
      metadata: entry.metadata || {}
    });
  });
}

export async function runCoachWorkflow(trigger = "manual_refresh") {
  const context = buildContext();
  const promptContext = buildPromptContext(context);
  const currentState = getAIState();

  try {
    const coachState = await requestAIJson({
      systemPrompt: "你是健身 App 的总控 AI，需要管理训练计划、训练复盘、风险提醒、长期记忆和下一次推进目标。请输出清晰、可执行、像真正私教一样的中文结果。",
      userPrompt: `当前触发器：${trigger}

高信号上下文：${JSON.stringify(promptContext)}

请输出 JSON：
{
  "lastSummary": "80-160字",
  "recovery": "50-120字",
  "planSummary": "80-160字",
  "weeklyFocus": "80-140字",
  "todayDecision": "80-140字",
  "riskAlert": "50-120字",
  "cycleGoal": "40-90字",
  "nextSessionTarget": "80-140字",
  "nextFocus": ["建议1","建议2","建议3"],
  "benchmarkFeatures": ["功能1","功能2","功能3"],
  "prTargets": [{"exercise":"动作名","target":"具体目标","reason":"原因"}],
  "replacementIdeas": [{"source":"原动作","replacement":"替代动作","reason":"替代原因"}],
  "memoryEntries": [{"category":"progress|risk|plan|recovery","title":"记忆标题","content":"长期记忆内容","score":0.1}]
}

要求：
1. prTargets 返回 2-4 条。
2. replacementIdeas 返回 2-3 条。
3. memoryEntries 返回 2-4 条。
4. 动作名必须来自 exerciseNames。`,
      maxTokens: 1300
    });

    const mergedState = {
      ...currentState,
      ...coachState,
      updatedAt: new Date().toISOString()
    };
    persistCoachState(mergedState, trigger);
    return mergedState;
  } catch {
    const fallback = {
      ...currentState,
      ...buildFallbackCoachState(context),
      updatedAt: new Date().toISOString()
    };
    persistCoachState(fallback, `${trigger}_fallback`);
    return fallback;
  }
}

export async function regeneratePlan() {
  const context = buildContext();
  const currentState = getAIState();
  const promptContext = buildPromptContext(context);

  try {
    const rawPlan = await requestAIJson({
      systemPrompt: "你是负责周计划编排的训练 AI。要平衡推进、恢复、弱项补强与器材限制。",
      userPrompt: `请基于以下信息，重排完整一周训练计划 JSON。
高信号上下文：${JSON.stringify(promptContext)}

输出格式：
{
  "0":{"title":"周日标题","duration":"20 分钟","focus":"恢复重点","exercises":[]},
  "1":{"title":"周一标题","duration":"45 分钟","focus":"训练重点","exercises":["动作1","动作2"]},
  "2":{},
  "3":{},
  "4":{},
  "5":{},
  "6":{}
}

要求：
1. 覆盖 0-6 全部 7 天。
2. 训练日安排 3-5 个动作。
3. 周内兼顾胸、背、肩、手臂。
4. 根据最近弱项和恢复压力安排轻重缓急。
5. 动作名必须来自 exerciseNames。`,
      maxTokens: 1400
    });

    const normalized = normalizePlan(rawPlan);
    savePlan(normalized);
    const nextState = {
      ...currentState,
      planSummary: "AI 已根据长期记忆、训练分布、恢复状态和历史记录重排本周微周期。",
      cycleGoal: "下一轮重点是让主项推进和弱项补强真正形成闭环。",
      updatedAt: new Date().toISOString()
    };
    saveAIState(nextState);
    addMemoryEntry({
      category: "plan",
      title: "周计划已被 AI 重排",
      content: "系统已根据训练历史和长期记忆重排一周训练结构。",
      score: 0.76,
      sourceTrigger: "regenerate_plan",
      metadata: { today: context.todayLabel }
    });
    return normalized;
  } catch {
    return getPlan();
  }
}

export async function generateDailyBriefing() {
  const context = buildContext();
  const promptContext = buildPromptContext(context);

  try {
    return await requestAIText({
      systemPrompt: "你是当天值班的 AI 私教，负责在训练前给出 180-260 字的动态建议，风格简洁、专业、可执行。",
      userPrompt: `今天是 ${context.todayLabel}。高信号上下文：${JSON.stringify(promptContext)}

请输出今天的训练动态调整建议，必须明确：
1. 今天适合加量、维持还是保守。
2. 主项建议保留几次余力。
3. 今天最值得注意的风险点。`,
      maxTokens: 650
    });
  } catch {
    return "今天先按计划稳步推进，主项保留 1 次余力。如果局部酸痛明显，就减少最后一组强度。";
  }
}

export async function generateDietAdvice() {
  const context = buildContext();
  const promptContext = buildPromptContext(context);

  try {
    return await requestAIText({
      systemPrompt: "你是健身 App 的营养 AI，请输出 220-320 字的中文饮食建议，强调可执行。",
      userPrompt: `高信号上下文：${JSON.stringify(promptContext)}

请给出今天的饮食建议，覆盖：
1. 蛋白质重点。
2. 训练前后碳水安排。
3. 饮水与恢复提醒。`,
      maxTokens: 700
    });
  } catch {
    return "优先保证每餐有高质量蛋白，训练前补适量碳水，训练后 30-90 分钟内补蛋白和碳水，全天把饮水补够。";
  }
}

export async function chatWithCoach(message) {
  const context = buildContext();
  const promptContext = buildPromptContext(context);
  const todayDay = context.todayDay;

  try {
    const result = await requestAIJson({
      systemPrompt: "你是健身 App 的总控 AI。对话时除了回答问题，还要判断是否需要直接生成可执行计划、替换今日动作或新增自定义动作草案。",
      userPrompt: `用户消息：${message}

高信号上下文：${JSON.stringify(promptContext)}

请输出 JSON：
{
  "answer":"120-260字中文答复",
  "intent":"qa|replace_today|replace_week|customize_exercise|progression",
  "suggestedPlan": null 或 {
    "0":{"title":"...","duration":"...","focus":"...","exercises":["动作1"]},
    "1":{},
    "2":{},
    "3":{},
    "4":{},
    "5":{},
    "6":{}
  },
  "suggestedTodayPlan": null 或 {
    "day": ${todayDay},
    "title":"今日标题",
    "duration":"45 分钟",
    "focus":"今日重点",
    "exercises":["动作1","动作2"]
  },
  "suggestedExercises": [
    {
      "name":"动作名",
      "muscleGroup":"胸部/背部/肩部/手臂/其他",
      "targetMuscles":["目标1"],
      "equipment":"器材",
      "description":["说明1"],
      "tips":["提示1"],
      "recommendedWeight":"自重/10kg",
      "defaultSets":3,
      "defaultReps":"10-12"
    }
  ],
  "suggestedActions":[
    {"type":"apply_week_plan","label":"一键替换本周计划"},
    {"type":"apply_today_plan","label":"一键替换今天动作"},
    {"type":"add_custom_exercise","label":"加入自定义动作库"}
  ]
}

规则：
1. 要求重做计划时，suggestedPlan 返回完整 0-6。
2. 要求替换今天训练或替换动作时，suggestedTodayPlan 返回当天方案。
3. 要求新增动作时，suggestedExercises 返回 1-3 条。
4. 计划中的动作名必须来自 exerciseNames，除非该动作同时出现在 suggestedExercises 中。`,
      maxTokens: 1800
    });

    return {
      answer: result.answer || "我已经结合你的历史记录和当前状态整理好了建议。",
      intent: result.intent || "qa",
      suggestedPlan: result.suggestedPlan ? normalizePlan(result.suggestedPlan) : null,
      suggestedTodayPlan: result.suggestedTodayPlan ? normalizeDayPlanDraft(result.suggestedTodayPlan, todayDay) : null,
      suggestedExercises: Array.isArray(result.suggestedExercises)
        ? result.suggestedExercises.map(normalizeExerciseDraft).filter((item) => item.name)
        : [],
      suggestedActions: Array.isArray(result.suggestedActions) ? result.suggestedActions : []
    };
  } catch {
    return {
      answer: "我已经根据你的训练状态整理出建议了。如果你愿意，我可以直接重排今天动作，或者重做整周计划。",
      intent: "qa",
      suggestedPlan: null,
      suggestedTodayPlan: null,
      suggestedExercises: [],
      suggestedActions: []
    };
  }
}

export function applySuggestedWeekPlan(planDraft) {
  const normalized = normalizePlan(planDraft);
  savePlan(normalized);
  addMemoryEntry({
    category: "plan",
    title: "AI 对话替换了整周计划",
    content: "用户通过 AI 对话一键替换了本周训练计划。",
    score: 0.82,
    sourceTrigger: "chat_apply_week_plan",
    metadata: {}
  });
  return normalized;
}

export function applySuggestedDayPlan(dayDraft) {
  const currentPlan = getPlan();
  const normalizedDay = normalizeDayPlanDraft(dayDraft, Number(dayDraft?.day ?? new Date().getDay()));
  currentPlan[normalizedDay.day] = {
    title: normalizedDay.title,
    duration: normalizedDay.duration,
    focus: normalizedDay.focus,
    exercises: normalizedDay.exercises
  };
  savePlan(currentPlan);
  addMemoryEntry({
    category: "plan",
    title: "AI 对话替换了当天训练",
    content: `${DAY_LABELS[normalizedDay.day]} 的训练已经被新的 AI 建议覆盖。`,
    score: 0.74,
    sourceTrigger: "chat_apply_day_plan",
    metadata: { day: normalizedDay.day }
  });
  return currentPlan;
}

export function applySuggestedExercises(exerciseDrafts = []) {
  const saved = [];
  exerciseDrafts.map(normalizeExerciseDraft).filter((item) => item.name).forEach((exercise) => {
    addCustomExercise(exercise);
    saved.push(exercise);
  });
  if (saved.length) {
    addMemoryEntry({
      category: "plan",
      title: "AI 对话新增了自定义动作",
      content: `系统新增了 ${saved.length} 个自定义动作，后续计划可以直接引用。`,
      score: 0.68,
      sourceTrigger: "chat_add_custom_exercise",
      metadata: { names: saved.map((item) => item.name) }
    });
  }
  return saved;
}
