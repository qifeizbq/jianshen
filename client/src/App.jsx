
import { useEffect, useMemo, useState } from "react";
import { api, getApiBaseUrl, setApiBaseUrl } from "./api";

const TABS = [
  ["overview", "总览"],
  ["training", "训练"],
  ["plan", "计划"],
  ["chat", "AI 对话"],
  ["history", "历史"],
  ["exercises", "动作库"],
  ["settings", "设置"]
];

const DAYS = ["周日", "周一", "周二", "周三", "周四", "周五", "周六"];
const READINESS_LABELS = {
  sleep: "睡眠",
  energy: "精力",
  soreness: "酸痛",
  stress: "压力"
};
const QUICK_QUESTIONS = [
  "帮我重排本周计划",
  "替换今天训练里的动作",
  "给我下一次重量和次数建议",
  "推荐适合我器材的新动作"
];

function todayDay() {
  return new Date().getDay();
}

function shortDate(text) {
  return String(text || "").slice(0, 10);
}

function emptyRecord(day = todayDay()) {
  return {
    performedAt: new Date().toISOString().slice(0, 16),
    exerciseName: "",
    weight: 0,
    sets: 3,
    reps: "10-12",
    notes: "",
    dayOfWeek: day
  };
}

function videoUrl(exercise) {
  return exercise?.bvid ? `https://www.bilibili.com/video/${exercise.bvid}/` : "#";
}

function playerUrl(exercise) {
  return exercise?.bvid
    ? `https://player.bilibili.com/player.html?bvid=${exercise.bvid}&page=1&high_quality=1&danmaku=0`
    : "about:blank";
}

export default function App() {
  const [boot, setBoot] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [activeTab, setActiveTab] = useState("overview");
  const [selectedDay, setSelectedDay] = useState(todayDay());
  const [query, setQuery] = useState("");
  const [apiBaseUrl, setApiBaseUrlState] = useState(getApiBaseUrl());
  const [mutating, setMutating] = useState("");
  const [dailyBriefing, setDailyBriefing] = useState("");
  const [dietAdvice, setDietAdvice] = useState("");
  const [recordDraft, setRecordDraft] = useState(emptyRecord());
  const [recordOpen, setRecordOpen] = useState(false);
  const [exerciseOpen, setExerciseOpen] = useState(null);
  const [chatInput, setChatInput] = useState("");
  const [chatMessages, setChatMessages] = useState([
    {
      id: "welcome",
      role: "assistant",
      text: "我是你的 AI 健身教练。我会根据训练历史、恢复状态、长期记忆和当前计划，直接给你下一步训练安排，并支持一键替换计划和动作。"
    }
  ]);
  const [chatPayloads, setChatPayloads] = useState({});

  useEffect(() => {
    loadBootstrap();
  }, []);

  useEffect(() => {
    if (!notice) return undefined;
    const timer = window.setTimeout(() => setNotice(""), 3200);
    return () => window.clearTimeout(timer);
  }, [notice]);

  async function loadBootstrap() {
    try {
      setLoading(true);
      setError("");
      setBoot(await api.getBootstrap());
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  async function runAction(name, work, successText) {
    try {
      setMutating(name);
      setError("");
      await work();
      if (successText) {
        setNotice(successText);
      }
    } catch (err) {
      setError(err.message);
    } finally {
      setMutating("");
    }
  }

  const profile = boot?.profile || {};
  const readiness = boot?.readiness || { sleep: 3, energy: 3, soreness: 3, stress: 3 };
  const aiState = boot?.aiState || {};
  const stats = boot?.stats || {};
  const records = boot?.records || [];
  const exercises = boot?.exercises || [];
  const memory = boot?.memory || [];
  const customExercises = boot?.customExercises || [];
  const plan = boot?.plan || {};
  const selectedPlan = plan[selectedDay] || {
    title: `${DAYS[selectedDay]} 训练`,
    duration: "-",
    focus: "等待 AI 生成计划",
    exercises: []
  };

  const filteredExercises = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return exercises;
    return exercises.filter((item) =>
      item.name.toLowerCase().includes(q) ||
      item.muscleGroup.toLowerCase().includes(q) ||
      item.targetMuscles.join(" ").toLowerCase().includes(q)
    );
  }, [query, exercises]);

  function patchBoot(next) {
    setBoot((prev) => ({ ...(prev || {}), ...next }));
  }

  function openRecord(exerciseName = "") {
    setRecordDraft({ ...emptyRecord(selectedDay), exerciseName, dayOfWeek: selectedDay });
    setRecordOpen(true);
  }

  async function saveProfile(event) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const payload = {
      name: String(form.get("name") || "本机训练者"),
      weight: Number(form.get("weight") || 65),
      height: Number(form.get("height") || 170),
      age: Number(form.get("age") || 26),
      goal: String(form.get("goal") || "增肌"),
      experience: String(form.get("experience") || "初中级"),
      daysPerWeek: Number(form.get("daysPerWeek") || 5),
      dailyMinutes: Number(form.get("dailyMinutes") || 45),
      focusAreas: String(form.get("focusAreas") || ""),
      injuries: String(form.get("injuries") || ""),
      equipmentText: String(form.get("equipmentText") || "")
    };

    await runAction("profile", async () => {
      const result = await api.saveProfile(payload);
      patchBoot({ profile: result.profile, aiState: result.aiState });
    }, "训练画像已更新");
  }

  async function saveReadiness() {
    await runAction("readiness", async () => {
      const result = await api.saveReadiness(readiness);
      patchBoot({ readiness: result.readiness, aiState: result.aiState });
    }, "今日状态已同步给 AI");
  }

  async function saveRecord(event) {
    event.preventDefault();
    await runAction("record", async () => {
      const result = await api.addRecord({
        ...recordDraft,
        weight: Number(recordDraft.weight || 0),
        sets: Number(recordDraft.sets || 0),
        dayOfWeek: Number(recordDraft.dayOfWeek || todayDay())
      });
      patchBoot({
        records: result.records,
        aiState: result.aiState,
        memory: result.memory,
        stats: result.stats
      });
      setRecordOpen(false);
      setRecordDraft(emptyRecord(selectedDay));
    }, "训练记录已保存，AI 已更新建议");
  }

  async function refreshCoach() {
    await runAction("workflow", async () => {
      const result = await api.runWorkflow("manual_refresh");
      patchBoot({ aiState: result.aiState, memory: result.memory });
    }, "AI 总控已刷新");
  }

  async function regeneratePlan() {
    await runAction("plan", async () => {
      const result = await api.regeneratePlan();
      patchBoot({ plan: result.plan, aiState: result.aiState });
    }, "AI 已重排本周计划");
  }

  async function generateBriefing() {
    await runAction("briefing", async () => {
      const result = await api.getDailyBriefing();
      setDailyBriefing(result.briefing);
    }, "今日训练建议已生成");
  }

  async function generateDiet() {
    await runAction("diet", async () => {
      const result = await api.getDietAdvice();
      setDietAdvice(result.advice);
    }, "营养建议已生成");
  }

  async function saveApiBase(event) {
    event?.preventDefault?.();
    setApiBaseUrl(apiBaseUrl.trim());
    await runAction("apiBase", async () => {
      const latest = await api.getBootstrap();
      setBoot(latest);
    }, "后端地址已保存并连接成功");
  }

  async function addCustomExercise() {
    const name = window.prompt("请输入自定义动作名称，例如：绳索面拉");
    if (!name) return;
    const muscleGroup = window.prompt("请输入训练部位，例如：胸部、背部、肩部、手臂", "肩部");
    if (!muscleGroup) return;

    const payload = {
      name,
      muscleGroup,
      targetMuscles: [muscleGroup],
      equipment: "自定义器材 / 动作",
      description: ["这是你新增的自定义动作，建议先从轻重量开始，确保轨迹稳定。"],
      tips: ["优先保证动作标准，再逐步提高重量与组数。"],
      recommendedWeight: "自重",
      defaultSets: 3,
      defaultReps: "10-12"
    };

    await runAction("customExercise", async () => {
      const result = await api.addCustomExercise(payload);
      patchBoot({
        customExercises: result.customExercises,
        exercises: result.exercises,
        aiState: result.aiState,
        memory: result.memory
      });
    }, "自定义动作已加入动作库");
  }

  async function sendChat(messageText) {
    const text = String(messageText ?? chatInput).trim();
    if (!text) return;

    setChatMessages((prev) => [...prev, { id: `u-${Date.now()}`, role: "user", text }]);
    setChatInput("");

    try {
      setMutating("chat");
      const result = await api.chatWithCoach(text);
      const id = `a-${Date.now()}`;
      setChatPayloads((prev) => ({ ...prev, [id]: result }));
      setChatMessages((prev) => [
        ...prev,
        {
          id,
          role: "assistant",
          text: result.answer,
          actions: result.suggestedActions || []
        }
      ]);
    } catch (err) {
      setError(err.message);
    } finally {
      setMutating("");
    }
  }

  async function applyChatAction(messageId, actionType) {
    const payload = chatPayloads[messageId];
    if (!payload) return;

    if (actionType === "apply_week_plan" && payload.suggestedPlan) {
      await runAction("applyWeek", async () => {
        const result = await api.applyWeekPlan(payload.suggestedPlan);
        patchBoot({ plan: result.plan, aiState: result.aiState, memory: result.memory });
      }, "AI 建议已替换本周计划");
    }

    if (actionType === "apply_today_plan" && payload.suggestedTodayPlan) {
      await runAction("applyDay", async () => {
        const result = await api.applyDayPlan(payload.suggestedTodayPlan);
        patchBoot({ plan: result.plan, aiState: result.aiState, memory: result.memory });
      }, "AI 建议已替换今日训练");
    }

    if (actionType === "add_custom_exercise" && payload.suggestedExercises?.length) {
      await runAction("applyExercises", async () => {
        const result = await api.addCustomExercise(payload.suggestedExercises);
        patchBoot({
          customExercises: result.customExercises,
          exercises: result.exercises,
          aiState: result.aiState,
          memory: result.memory
        });
      }, "AI 推荐动作已加入动作库");
    }
  }

  if (loading) {
    return <div className="screen-state">Fit AI 正在启动...</div>;
  }

  return (
    <div className="app-shell">
      <aside className="sidebar">
        <div className="brand-block">
          <div className="brand-mark">FA</div>
          <div>
            <p className="eyebrow">AI Fitness Coach</p>
            <h1>Fit AI</h1>
          </div>
        </div>

        <nav className="nav-stack">
          {TABS.map(([id, label]) => (
            <button
              key={id}
              className={`nav-button ${activeTab === id ? "active" : ""}`}
              onClick={() => setActiveTab(id)}
            >
              {label}
            </button>
          ))}
        </nav>

        <div className="sidebar-note">
          <p className="eyebrow">AI 闭环</p>
          <p>训练记录、自动复盘、长期记忆、计划重排和动作替换会形成一套完整推进链路。</p>
        </div>
      </aside>

      <main className="workspace">
        <header className="topbar">
          <div>
            <p className="eyebrow">Today / {DAYS[todayDay()]}</p>
            <h2>让 AI 真正接管你的训练流程</h2>
          </div>

          <div className="topbar-actions">
            <button className="ghost-button" onClick={refreshCoach}>
              {mutating === "workflow" ? "刷新中..." : "刷新 AI 总控"}
            </button>
            <button className="accent-button" onClick={() => setActiveTab("training")}>
              进入训练
            </button>
          </div>
        </header>

        {error ? <div className="banner error">{error}</div> : null}
        {notice ? <div className="banner success">{notice}</div> : null}

        {activeTab === "overview" ? (
          <section className="page-grid">
            <div className="hero-panel">
              <div>
                <p className="eyebrow">AI Coach Core</p>
                <h3>{aiState.weeklyFocus || "AI 正在建立你的训练节奏"}</h3>
                <p>{aiState.todayDecision || "先完成一轮训练，系统会逐步接管接下来的计划推进。"}</p>
              </div>

              <div className="hero-metrics">
                <MetricCard label="训练天数" value={stats.totalTrainingDays || 0} hint="云端已记录" />
                <MetricCard label="最大重量" value={stats.maxWeight || 0} hint="kg" />
                <MetricCard label="记录总数" value={stats.totalRecords || 0} hint="动作条目" />
                <MetricCard label="训练总量" value={Math.round(stats.totalVolume || 0)} hint="累计容量" />
              </div>
            </div>

            <div className="glass-panel">
              <SectionHeading title="AI 总控" subtitle="系统会持续审视本周重点、风险提醒和下一次训练目标。" />
              <div className="coach-grid">
                <InfoCard title="本周重点" body={aiState.weeklyFocus} />
                <InfoCard title="今日决策" body={aiState.todayDecision} tone="warm" />
                <InfoCard title="风险提醒" body={aiState.riskAlert} />
                <InfoCard title="下一次目标" body={aiState.nextSessionTarget} tone="highlight" />
              </div>
            </div>

            <div className="glass-panel">
              <SectionHeading title="下一批 PR 目标" subtitle="AI 会结合历史和当前计划自动给出进阶方向。" />
              <div className="stack-list">
                {(aiState.prTargets || []).length ? (
                  aiState.prTargets.map((item) => (
                    <div key={`${item.exercise}-${item.target}`} className="goal-row">
                      <div>
                        <strong>{item.exercise}</strong>
                        <p>{item.reason}</p>
                      </div>
                      <span>{item.target}</span>
                    </div>
                  ))
                ) : (
                  <div className="empty-card">继续记录训练，AI 会根据数据生成更明确的 PR 目标。</div>
                )}
              </div>
            </div>

            <div className="glass-panel">
              <SectionHeading title="最近长期记忆" subtitle="这些记忆会直接影响下一个周期的计划和动作建议。" />
              <div className="memory-list">
                {memory.length ? memory.slice(0, 5).map((entry) => <MemoryCard key={entry.id} entry={entry} />) : <div className="empty-card">还没有形成长期记忆，先完成几次训练记录。</div>}
              </div>
            </div>
          </section>
        ) : null}

        {activeTab === "training" ? (
          <section className="page-grid">
            <div className="glass-panel">
              <SectionHeading title="今日状态" subtitle="睡眠、精力、酸痛和压力会实时反馈给 AI。" />

              <div className="readiness-grid">
                {Object.keys(READINESS_LABELS).map((key) => (
                  <label key={key} className="field">
                    <span>{READINESS_LABELS[key]}</span>
                    <select
                      value={readiness[key]}
                      onChange={(e) => patchBoot({ readiness: { ...readiness, [key]: Number(e.target.value) } })}
                    >
                      {[1, 2, 3, 4, 5].map((value) => (
                        <option key={value} value={value}>
                          {value}
                        </option>
                      ))}
                    </select>
                  </label>
                ))}
              </div>

              <div className="row-actions">
                <button className="ghost-button" onClick={saveReadiness}>
                  {mutating === "readiness" ? "同步中..." : "同步今日状态"}
                </button>
                <button className="accent-button" onClick={generateBriefing}>
                  {mutating === "briefing" ? "生成中..." : "生成今日训练建议"}
                </button>
              </div>

              <div className="inline-panel">
                {dailyBriefing || "点击按钮后，AI 会根据你今天的状态给出训练前动态建议。"}
              </div>
            </div>

            <div className="glass-panel">
              <SectionHeading title={selectedPlan.title} subtitle={selectedPlan.focus} />
              <div className="pill-row">
                {DAYS.map((label, day) => (
                  <button
                    key={label}
                    className={`pill-button ${selectedDay === day ? "active" : ""}`}
                    onClick={() => setSelectedDay(day)}
                  >
                    {label}
                  </button>
                ))}
              </div>

              <div className="exercise-stack">
                {(selectedPlan.exercises || []).length ? (
                  selectedPlan.exercises.map((exerciseName) => {
                    const exercise = exercises.find((item) => item.name === exerciseName);
                    return (
                      <article key={exerciseName} className="exercise-row-card">
                        <div>
                          <h4>{exerciseName}</h4>
                          <p>{exercise?.muscleGroup || "未分类"} · {exercise?.equipment || "器材待定"}</p>
                        </div>
                        <div className="row-actions compact">
                          <button className="ghost-button small" onClick={() => setExerciseOpen(exercise)}>
                            看动作
                          </button>
                          <button className="accent-button small" onClick={() => openRecord(exerciseName)}>
                            记录
                          </button>
                        </div>
                      </article>
                    );
                  })
                ) : (
                  <div className="empty-card">今天是主动恢复日，建议步行、拉伸和补足睡眠。</div>
                )}
              </div>
            </div>
          </section>
        ) : null}

        {activeTab === "plan" ? (
          <section className="page-grid">
            <div className="glass-panel">
              <SectionHeading title="AI 微周期计划" subtitle="AI 会根据历史、恢复状态和长期记忆自动推进周计划。" />
              <div className="coach-grid">
                <InfoCard title="周期目标" body={aiState.cycleGoal} tone="highlight" />
                <InfoCard title="计划摘要" body={aiState.planSummary} />
                <InfoCard title="本周重点" body={aiState.weeklyFocus} />
                <InfoCard title="恢复提醒" body={aiState.recovery} tone="warm" />
              </div>
              <div className="row-actions">
                <button className="accent-button" onClick={regeneratePlan}>
                  {mutating === "plan" ? "重排中..." : "让 AI 重排本周计划"}
                </button>
              </div>
            </div>

            <div className="glass-panel">
              <SectionHeading title={`${DAYS[selectedDay]} 训练详情`} subtitle={`预计时长：${selectedPlan.duration}`} />
              <div className="stack-list">
                {(selectedPlan.exercises || []).length ? (
                  selectedPlan.exercises.map((name) => (
                    <div key={name} className="bullet-row">{name}</div>
                  ))
                ) : (
                  <div className="empty-card">这一天暂时没有安排动作，等待 AI 生成或替换。</div>
                )}
              </div>
            </div>
          </section>
        ) : null}

        {activeTab === "chat" ? (
          <section className="page-grid">
            <div className="glass-panel tall-panel">
              <SectionHeading title="AI 对话控制台" subtitle="你可以直接让 AI 重做计划、替换动作，或者新增自定义动作。" />

              <div className="quick-question-row">
                {QUICK_QUESTIONS.map((question) => (
                  <button key={question} className="quick-chip" onClick={() => sendChat(question)}>
                    {question}
                  </button>
                ))}
              </div>

              <div className="chat-list">
                {chatMessages.map((item) => (
                  <article key={item.id} className={`chat-bubble ${item.role}`}>
                    <p>{item.text}</p>
                    {item.role === "assistant" && item.actions?.length ? (
                      <div className="chat-action-row">
                        {item.actions.map((action) => (
                          <button
                            key={action.type}
                            className={action.type === "apply_week_plan" ? "accent-button small" : "ghost-button small"}
                            onClick={() => applyChatAction(item.id, action.type)}
                          >
                            {action.label}
                          </button>
                        ))}
                      </div>
                    ) : null}
                  </article>
                ))}
              </div>

              <div className="chat-composer">
                <input
                  value={chatInput}
                  onChange={(e) => setChatInput(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && sendChat()}
                  placeholder="例如：把周三肩部训练换成更适合家里器材的版本"
                />
                <button className="accent-button" onClick={() => sendChat()}>
                  {mutating === "chat" ? "思考中..." : "发送"}
                </button>
              </div>
            </div>
          </section>
        ) : null}

        {activeTab === "history" ? (
          <section className="page-grid">
            <div className="glass-panel tall-panel">
              <SectionHeading title="云端训练历史" subtitle="所有训练记录都会进入数据库，并参与 AI 长期记忆和计划更新。" />
              <div className="history-list">
                {records.length ? (
                  records.slice(0, 20).map((record) => (
                    <div key={`${record.id}-${record.exerciseName}`} className="history-card">
                      <div>
                        <h4>{record.exerciseName}</h4>
                        <p>{shortDate(record.performedAt)} · {DAYS[record.dayOfWeek]}</p>
                      </div>
                      <div className="history-metrics">
                        <span>{record.weight || 0} kg</span>
                        <span>{record.sets} 组</span>
                        <span>{record.reps}</span>
                      </div>
                    </div>
                  ))
                ) : (
                  <div className="empty-card">还没有训练记录。</div>
                )}
              </div>
            </div>
          </section>
        ) : null}

        {activeTab === "exercises" ? (
          <section className="page-grid">
            <div className="glass-panel tall-panel">
              <SectionHeading title="动作库与视频" subtitle="优先匹配 B 站教学，同时保留搜索兜底。" />

              <label className="field">
                <span>搜索动作</span>
                <input
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  placeholder="输入胸部、引体、划船、肩推等关键词"
                />
              </label>

              <div className="row-actions">
                <button className="ghost-button" onClick={addCustomExercise}>添加自定义动作</button>
                <div className="inline-count">自定义动作：{customExercises.length}</div>
              </div>

              <div className="exercise-grid">
                {filteredExercises.map((exercise) => (
                  <article key={exercise.name} className="library-card">
                    <div>
                      <p className="eyebrow">{exercise.muscleGroup}</p>
                      <h4>{exercise.name}</h4>
                      <p>{exercise.targetMuscles.join(" · ")}</p>
                    </div>
                    <div className="row-actions compact">
                      <button className="ghost-button small" onClick={() => setExerciseOpen(exercise)}>
                        看视频
                      </button>
                      <button className="accent-button small" onClick={() => openRecord(exercise.name)}>
                        记一组
                      </button>
                    </div>
                  </article>
                ))}
              </div>
            </div>
          </section>
        ) : null}

        {activeTab === "settings" ? (
          <section className="page-grid">
            <div className="glass-panel tall-panel">
              <SectionHeading title="训练画像与后端设置" subtitle="这份档案就是 AI 当前理解你的基础。" />

              <form className="settings-form" onSubmit={saveProfile}>
                <div className="settings-grid">
                  <Field label="昵称" name="name" defaultValue={profile.name} />
                  <Field label="体重 (kg)" name="weight" type="number" defaultValue={profile.weight} />
                  <Field label="身高 (cm)" name="height" type="number" defaultValue={profile.height} />
                  <Field label="年龄" name="age" type="number" defaultValue={profile.age} />
                  <Field label="目标" name="goal" defaultValue={profile.goal} />
                  <Field label="经验水平" name="experience" defaultValue={profile.experience} />
                  <Field label="每周训练天数" name="daysPerWeek" type="number" defaultValue={profile.daysPerWeek} />
                  <Field label="每天可训练分钟" name="dailyMinutes" type="number" defaultValue={profile.dailyMinutes} />
                  <Field label="优先强化部位" name="focusAreas" defaultValue={profile.focusAreas} />
                  <Field label="伤病限制" name="injuries" defaultValue={profile.injuries} />
                </div>

                <label className="field full">
                  <span>器材列表</span>
                  <textarea name="equipmentText" defaultValue={profile.equipmentText} rows={5} />
                </label>

                <div className="row-actions">
                  <button className="accent-button" type="submit">
                    {mutating === "profile" ? "保存中..." : "保存训练画像"}
                  </button>
                  <button className="ghost-button" type="button" onClick={generateDiet}>
                    {mutating === "diet" ? "生成中..." : "生成营养建议"}
                  </button>
                </div>

                <div className="inline-panel subtle">
                  <p>当前 AI 模型：{boot?.aiConfig?.model || "未读取"}</p>
                  <p>远程接口：{boot?.aiConfig?.endpoint || "未读取"}</p>
                  <p>密钥状态：{boot?.aiConfig?.configured ? "已配置" : "未配置"}</p>
                </div>

                <div className="settings-form">
                  <label className="field full">
                    <span>手机端后端地址</span>
                    <input
                      value={apiBaseUrl}
                      onChange={(e) => setApiBaseUrlState(e.target.value)}
                      placeholder="例如：https://fit-ai-coach-api.onrender.com"
                    />
                  </label>

                  <div className="row-actions">
                    <button className="ghost-button" type="button" onClick={saveApiBase}>
                      {mutating === "apiBase" ? "连接中..." : "保存并测试后端地址"}
                    </button>
                    <button className="ghost-button" type="button" onClick={loadBootstrap}>
                      重新拉取云端数据
                    </button>
                  </div>

                  <div className="inline-panel subtle">
                    {dietAdvice || "手机安装包如果要使用云端历史、长期记忆和 AI 自动计划，必须能访问这里填写的后端地址。"}
                  </div>
                </div>
              </form>
            </div>
          </section>
        ) : null}
      </main>

      {exerciseOpen ? (
        <div className="modal-overlay" onClick={() => setExerciseOpen(null)}>
          <div className="modal-card large" onClick={(e) => e.stopPropagation()}>
            <div className="modal-head">
              <div>
                <p className="eyebrow">{exerciseOpen.muscleGroup}</p>
                <h3>{exerciseOpen.name}</h3>
              </div>
              <button className="ghost-button small" onClick={() => setExerciseOpen(null)}>
                关闭
              </button>
            </div>

            <div className="video-frame">
              <iframe title={exerciseOpen.name} src={playerUrl(exerciseOpen)} allowFullScreen />
            </div>

            <div className="row-actions">
              <a className="ghost-button small link-button" href={videoUrl(exerciseOpen)} target="_blank" rel="noreferrer">
                打开原视频
              </a>
              <a
                className="ghost-button small link-button"
                href={`https://search.bilibili.com/all?keyword=${encodeURIComponent(exerciseOpen.name)}`}
                target="_blank"
                rel="noreferrer"
              >
                B 站搜索同动作
              </a>
            </div>

            <div className="modal-grid">
              <div>
                <h4>动作要领</h4>
                <ul className="detail-list">
                  {(exerciseOpen.description || []).map((item) => (
                    <li key={item}>{item}</li>
                  ))}
                </ul>
              </div>
              <div>
                <h4>注意事项</h4>
                <ul className="detail-list">
                  {(exerciseOpen.tips || []).map((item) => (
                    <li key={item}>{item}</li>
                  ))}
                </ul>
              </div>
            </div>
          </div>
        </div>
      ) : null}

      {recordOpen ? (
        <div className="modal-overlay" onClick={() => setRecordOpen(false)}>
          <div className="modal-card" onClick={(e) => e.stopPropagation()}>
            <div className="modal-head">
              <div>
                <p className="eyebrow">记录训练</p>
                <h3>{recordDraft.exerciseName || "新的训练条目"}</h3>
              </div>
              <button className="ghost-button small" onClick={() => setRecordOpen(false)}>
                关闭
              </button>
            </div>

            <form className="settings-form" onSubmit={saveRecord}>
              <label className="field">
                <span>时间</span>
                <input
                  type="datetime-local"
                  value={recordDraft.performedAt}
                  onChange={(e) => setRecordDraft((prev) => ({ ...prev, performedAt: e.target.value }))}
                />
              </label>

              <label className="field">
                <span>动作</span>
                <select
                  value={recordDraft.exerciseName}
                  onChange={(e) => setRecordDraft((prev) => ({ ...prev, exerciseName: e.target.value }))}
                >
                  <option value="">选择动作</option>
                  {exercises.map((exercise) => (
                    <option key={exercise.name} value={exercise.name}>
                      {exercise.name}
                    </option>
                  ))}
                </select>
              </label>

              <div className="settings-grid">
                <label className="field">
                  <span>重量</span>
                  <input
                    type="number"
                    value={recordDraft.weight}
                    onChange={(e) => setRecordDraft((prev) => ({ ...prev, weight: e.target.value }))}
                  />
                </label>

                <label className="field">
                  <span>组数</span>
                  <input
                    type="number"
                    value={recordDraft.sets}
                    onChange={(e) => setRecordDraft((prev) => ({ ...prev, sets: e.target.value }))}
                  />
                </label>

                <label className="field">
                  <span>次数</span>
                  <input
                    value={recordDraft.reps}
                    onChange={(e) => setRecordDraft((prev) => ({ ...prev, reps: e.target.value }))}
                  />
                </label>
              </div>

              <label className="field full">
                <span>备注</span>
                <textarea
                  rows={4}
                  value={recordDraft.notes}
                  onChange={(e) => setRecordDraft((prev) => ({ ...prev, notes: e.target.value }))}
                />
              </label>

              <button className="accent-button" type="submit">
                {mutating === "record" ? "保存中..." : "保存并让 AI 复盘"}
              </button>
            </form>
          </div>
        </div>
      ) : null}
    </div>
  );
}

function SectionHeading({ title, subtitle }) {
  return (
    <div className="section-heading">
      <h3>{title}</h3>
      <p>{subtitle}</p>
    </div>
  );
}

function MetricCard({ label, value, hint }) {
  return (
    <div className="metric-card">
      <span>{label}</span>
      <strong>{value}</strong>
      <p>{hint}</p>
    </div>
  );
}

function InfoCard({ title, body, tone = "base" }) {
  return (
    <article className={`info-card tone-${tone}`}>
      <p className="eyebrow">{title}</p>
      <div>{body || "等待 AI 生成..."}</div>
    </article>
  );
}

function MemoryCard({ entry }) {
  return (
    <article className="memory-card">
      <div className="memory-card-top">
        <span className="tag">{entry.category}</span>
        <span>{shortDate(entry.createdAt)}</span>
      </div>
      <h4>{entry.title}</h4>
      <p>{entry.content}</p>
    </article>
  );
}

function Field({ label, ...props }) {
  return (
    <label className="field">
      <span>{label}</span>
      <input {...props} />
    </label>
  );
}
