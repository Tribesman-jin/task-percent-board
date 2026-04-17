const STORAGE_KEY = "task-percent-board-v2";
const taskListActive = document.getElementById("taskListActive");
const taskListFolded = document.getElementById("taskListFolded");
const taskListTagged = document.getElementById("taskListTagged");
const tabButtons = Array.from(document.querySelectorAll(".tab-btn"));
const viewPanels = Array.from(document.querySelectorAll("[data-view-panel]"));
const dynamicTagTabs = document.getElementById("dynamicTagTabs");
const taggedViewTitle = document.getElementById("taggedViewTitle");
const taggedViewHint = document.getElementById("taggedViewHint");
const dropZones = Array.from(document.querySelectorAll("[data-drop-zone]"));
const taskTemplate = document.getElementById("taskTemplate");
const milestoneTemplate = document.getElementById("milestoneTemplate");
const taskNameInput = document.getElementById("taskName");
const addTaskBtn = document.getElementById("addTaskBtn");
const exportDateInput = document.getElementById("exportDate");
const exportMarkdownBtn = document.getElementById("exportMarkdownBtn");
const exportBoardBtn = document.getElementById("exportBoardBtn");
const importBoardBtn = document.getElementById("importBoardBtn");
const newBlankBoardBtn = document.getElementById("newBlankBoardBtn");
const importBoardInput = document.getElementById("importBoardInput");
const overallPercent = document.getElementById("overallPercent");
const overallBar = document.getElementById("overallBar");
const overallMeta = document.getElementById("overallMeta");

const today = new Date();
let needsInitialSave = false;
let draggedTaskId = null;
let activeView = "active";

function toDateInputValue(date) {
  const yyyy = date.getFullYear();
  const mm = String(date.getMonth() + 1).padStart(2, "0");
  const dd = String(date.getDate()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}`;
}

function uid() {
  if (typeof crypto !== "undefined" && crypto.randomUUID) {
    return crypto.randomUUID();
  }
  return `${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function todayValue() {
  return toDateInputValue(today);
}

function filenameDate(value) {
  return String(value || "").replaceAll("-", "");
}

function formatDate(value) {
  const date = new Date(`${value}T00:00:00`);
  return new Intl.DateTimeFormat("zh-CN", { month: "2-digit", day: "2-digit" }).format(date);
}

function formatLongDate(value) {
  const date = new Date(`${value}T00:00:00`);
  return new Intl.DateTimeFormat("zh-CN", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(date);
}

function parseDate(value) {
  return new Date(`${value}T00:00:00`).getTime();
}

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function isValidDateValue(value) {
  return typeof value === "string" && !Number.isNaN(parseDate(value));
}

function colorForPercent(percent) {
  const clamped = clamp(Number(percent) || 0, 0, 100);
  const hue = Math.round(0 + (clamped / 100) * 150);
  return `hsl(${hue} 88% 58%)`;
}

function normalizeTag(value) {
  return String(value || "")
    .trim()
    .replace(/\s+/g, " ");
}

function hashString(value) {
  let hash = 0;
  for (let index = 0; index < value.length; index += 1) {
    hash = (hash * 31 + value.charCodeAt(index)) >>> 0;
  }
  return hash;
}

function colorForTag(tag) {
  const hue = hashString(tag) % 360;
  return `hsl(${hue} 84% 58%)`;
}

function tagViewId(tag) {
  return `tag:${encodeURIComponent(tag)}`;
}

function tagFromViewId(view) {
  if (!view.startsWith("tag:")) return null;
  try {
    return decodeURIComponent(view.slice(4));
  } catch {
    return view.slice(4);
  }
}

function seedTasks() {
  const base = new Date(today);
  const daysAgo = (n) => {
    const date = new Date(base);
    date.setDate(date.getDate() - n);
    return toDateInputValue(date);
  };

  return [
    {
      id: uid(),
      name: "地基施工",
      createdAt: daysAgo(18),
      status: "active",
      tags: ["施工", "基础"],
      marks: [
        { id: uid(), date: daysAgo(16), percent: 10, note: "开始清表" },
        { id: uid(), date: daysAgo(10), percent: 35, note: "钢筋绑扎完成一半" },
        { id: uid(), date: daysAgo(4), percent: 68, note: "混凝土浇筑推进" },
      ],
    },
    {
      id: uid(),
      name: "主体结构",
      createdAt: daysAgo(22),
      status: "active",
      tags: ["结构"],
      marks: [
        { id: uid(), date: daysAgo(19), percent: 8, note: "材料进场" },
        { id: uid(), date: daysAgo(11), percent: 27, note: "首层施工" },
        { id: uid(), date: daysAgo(2), percent: 49, note: "主体推进顺利" },
      ],
    },
    {
      id: uid(),
      name: "设备联调",
      createdAt: daysAgo(9),
      status: "active",
      tags: ["调试"],
      marks: [
        { id: uid(), date: daysAgo(7), percent: 12, note: "设备就位" },
        { id: uid(), date: daysAgo(3), percent: 22, note: "开始联调" },
      ],
    },
  ];
}

function normalizeTasks(tasks) {
  if (!Array.isArray(tasks)) return [];

  return tasks
    .filter((task) => task && typeof task.name === "string")
    .map((task) => ({
      id: String(task.id || uid()),
      name: task.name.trim(),
      createdAt: isValidDateValue(task.createdAt) ? task.createdAt : todayValue(),
      status: task.status === "folded" ? "folded" : "active",
      tags: Array.isArray(task.tags)
        ? [...new Set(task.tags.map(normalizeTag).filter(Boolean))]
        : [],
      marks: Array.isArray(task.marks)
        ? task.marks
            .filter((mark) => mark && isValidDateValue(mark.date))
            .map((mark) => ({
              id: String(mark.id || uid()),
              date: mark.date,
              percent: clamp(Number(mark.percent) || 0, 0, 100),
              note: typeof mark.note === "string" ? mark.note.trim() : "",
            }))
            .sort((a, b) => parseDate(a.date) - parseDate(b.date))
        : [],
    }))
    .filter((task) => task.name.length > 0);
}

function loadTasks() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) {
      needsInitialSave = true;
      return seedTasks();
    }

    const parsed = JSON.parse(raw);
    const tasks = normalizeTasks(parsed);
    if (!tasks.length && !Array.isArray(parsed)) {
      needsInitialSave = true;
      return seedTasks();
    }
    return tasks;
  } catch {
    needsInitialSave = true;
    return seedTasks();
  }
}

let state = {
  tasks: loadTasks(),
};

function saveState() {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state.tasks));
  } catch {
    // If storage is unavailable, keep the app usable in memory.
  }
}

if (needsInitialSave) {
  saveState();
}

function latestMark(task) {
  if (!task.marks.length) {
    return { date: task.createdAt, percent: 0 };
  }
  return task.marks[task.marks.length - 1];
}

function latestMarkOnOrBefore(task, dateValue) {
  const targetTime = parseDate(dateValue);
  const marks = (task.marks || [])
    .filter((mark) => parseDate(mark.date) <= targetTime)
    .sort((a, b) => parseDate(a.date) - parseDate(b.date));
  if (marks.length) {
    return marks[marks.length - 1];
  }
  if (parseDate(task.createdAt) <= targetTime) {
    return { date: task.createdAt, percent: 0, note: "" };
  }
  return null;
}

function buildMarkdownExport(dateValue) {
  const tasks = [...state.tasks].sort((a, b) => {
    const percentA = latestMarkOnOrBefore(a, dateValue)?.percent ?? -1;
    const percentB = latestMarkOnOrBefore(b, dateValue)?.percent ?? -1;
    return percentB - percentA || a.name.localeCompare(b.name, "zh-Hans-CN");
  });

  const lines = [];
  lines.push(`# 任务完成情况（${formatLongDate(dateValue)}）`);
  lines.push("");
  lines.push(`- 导出日期：${formatLongDate(dateValue)}`);
  lines.push(`- 任务总数：${state.tasks.length}`);
  lines.push(`- 进行中：${state.tasks.filter((task) => task.status !== "folded").length}`);
  lines.push(`- 折叠：${state.tasks.filter((task) => task.status === "folded").length}`);
  lines.push("");

  for (const task of tasks) {
    const snapshot = latestMarkOnOrBefore(task, dateValue);
    const isCreated = parseDate(task.createdAt) <= parseDate(dateValue);
    const percent = snapshot ? snapshot.percent : 0;
    const snapshotText = snapshot
      ? `${formatLongDate(snapshot.date)} · ${snapshot.percent}%${snapshot.note ? ` · ${snapshot.note}` : ""}`
      : isCreated
        ? "当日之前暂无标注"
        : "当日尚未创建";
    const tagText = (task.tags || []).length ? task.tags.join("、") : "无";
    const statusText = task.status === "folded" ? "折叠" : "进行中";

    lines.push(`## ${task.name}`);
    lines.push(`- 状态：${statusText}`);
    lines.push(`- 标签：${tagText}`);
    lines.push(`- 创建于：${formatLongDate(task.createdAt)}`);
    lines.push(`- 截至当日完成度：${percent}%`);
    lines.push(`- 截至当日最近标注：${snapshotText}`);
    lines.push("");

    const marks = (task.marks || [])
      .filter((mark) => parseDate(mark.date) <= parseDate(dateValue))
      .sort((a, b) => parseDate(a.date) - parseDate(b.date));

    if (marks.length) {
      lines.push("```text");
      for (const mark of marks) {
        lines.push(
          `${formatLongDate(mark.date)} | ${String(mark.percent).padStart(3, " ")}% | ${mark.note || ""}`,
        );
      }
      lines.push("```");
      lines.push("");
    }
  }

  return `${lines.join("\n").trim()}\n`;
}

function downloadTextFile(filename, content) {
  const blob = new Blob([content], { type: "text/markdown;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  document.body.append(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function downloadJsonFile(filename, data) {
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  document.body.append(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function cloneTasksForExport() {
  return JSON.parse(JSON.stringify(state.tasks));
}

function exportBoardBackup() {
  downloadJsonFile(`任务看板备份-${filenameDate(todayValue())}.json`, {
    version: 1,
    exportedAt: new Date().toISOString(),
    tasks: cloneTasksForExport(),
  });
}

async function importBoardBackupFromFile(file) {
  const text = await file.text();
  const parsed = JSON.parse(text);
  const tasks = Array.isArray(parsed) ? parsed : parsed?.tasks;
  const normalized = normalizeTasks(tasks);

  if (!Array.isArray(tasks)) {
    throw new Error("备份文件格式不正确。");
  }

  state.tasks = normalized;
  saveState();
  renderTasks();
}

function newBlankBoard() {
  if (!window.confirm("要新建一个空白看板吗？当前任务会保留在本地备份里，但不会显示在当前看板中。")) {
    return;
  }

  state.tasks = [];
  saveState();
  renderTasks();
}

function collectTagStats() {
  const stats = new Map();

  for (const task of state.tasks) {
    for (const rawTag of task.tags || []) {
      const tag = normalizeTag(rawTag);
      if (!tag) continue;
      stats.set(tag, (stats.get(tag) || 0) + 1);
    }
  }

  return [...stats.entries()]
    .map(([tag, count]) => ({
      tag,
      count,
      color: colorForTag(tag),
    }))
    .sort((a, b) => b.count - a.count || a.tag.localeCompare(b.tag, "zh-Hans-CN"));
}

function renderTagTabs() {
  if (!dynamicTagTabs) return [];

  const tagStats = collectTagStats();
  dynamicTagTabs.innerHTML = "";

  if (!tagStats.length) {
    const empty = document.createElement("span");
    empty.className = "tag-tabs-empty";
    empty.textContent = "添加标签后，这里会出现分类页";
    dynamicTagTabs.append(empty);
    return [];
  }

  for (const item of tagStats) {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "tag-tab-btn";
    button.setAttribute("role", "tab");
    button.setAttribute("aria-selected", "false");
    button.dataset.view = tagViewId(item.tag);
    button.dataset.tag = item.tag;
    button.style.setProperty("--tag-color", item.color);

    const name = document.createElement("span");
    name.className = "tag-tab-name";
    name.textContent = item.tag;

    const count = document.createElement("span");
    count.className = "tag-tab-count";
    count.textContent = String(item.count);

    button.append(name, count);
    dynamicTagTabs.append(button);
  }

  return tagStats.map((item) => item.tag);
}

function taskHasTag(task, tag) {
  const normalizedTag = normalizeTag(tag);
  if (!normalizedTag) return false;
  return (task.tags || []).some((item) => normalizeTag(item) === normalizedTag);
}

function updateSummary() {
  const taskCount = state.tasks.length;
  const activeCount = state.tasks.filter((task) => task.status !== "folded").length;
  const foldedCount = taskCount - activeCount;
  const totalMarks = state.tasks.reduce((sum, task) => sum + task.marks.length, 0);
  const totalPercent = state.tasks.reduce((sum, task) => sum + latestMark(task).percent, 0);
  const avg = taskCount ? Math.round(totalPercent / taskCount) : 0;

  overallPercent.textContent = String(avg);
  overallBar.style.width = `${avg}%`;
  overallMeta.textContent = `${activeCount} 个进行中 · ${foldedCount} 个折叠 · ${totalMarks} 条标注`;
}

function renderChart(task, chart) {
  const complete = chart.querySelector(".chart-complete");
  const dashed = chart.querySelector(".chart-dashed");
  const pointLayer = chart.querySelector(".chart-points");
  const latestPercent = latestMark(task).percent;

  complete.style.width = `${latestPercent}%`;
  complete.style.background = `linear-gradient(90deg, ${colorForPercent(0)} 0%, ${colorForPercent(
    Math.max(20, latestPercent * 0.55),
  )} 55%, ${colorForPercent(latestPercent)} 100%)`;
  dashed.style.left = `${latestPercent}%`;
  dashed.style.width = `${Math.max(100 - latestPercent, 0)}%`;
  pointLayer.innerHTML = "";

  const marks = [...task.marks].sort((a, b) => a.percent - b.percent);
  const laneLastPercent = [-Infinity, -Infinity];
  const laneGap = 8;

  marks.forEach((mark, index) => {
    const point = document.createElement("div");
    point.className = "chart-point";
    point.dataset.percent = String(clamp(mark.percent, 0, 100));
    point.style.left = `${clamp(mark.percent, 0, 100)}%`;
    point.style.setProperty("--point-color", colorForPercent(mark.percent));

    const percent = clamp(mark.percent, 0, 100);
    let lane = 0;
    if (percent - laneLastPercent[0] < laneGap && percent - laneLastPercent[1] < laneGap) {
      lane = index % 2;
    } else if (percent - laneLastPercent[0] < laneGap) {
      lane = 1;
    }
    laneLastPercent[lane] = percent;
    point.dataset.lane = lane === 0 ? "top" : "bottom";
    point.classList.add(lane === 0 ? "lane-top" : "lane-bottom");

    const note = document.createElement("span");
    note.className = "point-note";
    const fullText = `${formatLongDate(mark.date)} · ${mark.percent}%${mark.note ? ` · ${mark.note}` : ""}`;
    note.textContent = `${formatDate(mark.date)}${mark.note ? ` · ${mark.note}` : ""}`;
    note.title = fullText;
    point.append(note);
    point.title = fullText;
    pointLayer.append(point);
  });
}

function renderMilestones(task, container) {
  container.innerHTML = "";

  if (!task.marks.length) {
    const empty = document.createElement("div");
    empty.className = "control-note";
    empty.textContent = "还没有标注，先添加一个日期和完成比例。";
    container.append(empty);
    return;
  }

  for (const mark of task.marks) {
    const chip = milestoneTemplate.content.firstElementChild.cloneNode(true);
    const noteText = mark.note ? ` · ${mark.note}` : "";
    const fullText = `${formatLongDate(mark.date)} · ${mark.percent}%${noteText}`;
    chip.querySelector(".mark-text").textContent = `${formatDate(mark.date)} · ${mark.percent}%${noteText}`;
    chip.title = fullText;
    chip.querySelector(".mark-remove").dataset.taskId = task.id;
    chip.querySelector(".mark-remove").dataset.markId = mark.id;
    container.append(chip);
  }
}

function renderTagChips(task, container) {
  container.innerHTML = "";

  if (!task.tags.length) {
    return;
  }

  for (const tag of task.tags) {
    const chip = document.createElement("span");
    chip.className = "task-tag-chip";
    chip.style.setProperty("--tag-color", colorForTag(tag));

    const text = document.createElement("span");
    text.className = "task-tag-text";
    text.textContent = tag;
    text.title = tag;

    const remove = document.createElement("button");
    remove.type = "button";
    remove.className = "task-tag-remove";
    remove.dataset.tag = tag;
    remove.dataset.taskId = task.id;
    remove.title = `删除标签“${tag}”`;
    remove.setAttribute("aria-label", `删除标签 ${tag}`);
    remove.textContent = "×";

    chip.append(text, remove);
    container.append(chip);
  }
}

function renderTaggedTaskView(tag) {
  renderTaskList(
    taskListTagged,
    tag ? state.tasks.filter((task) => taskHasTag(task, tag)) : [],
    "tagged",
  );
}

function setTaskStatus(taskId, status) {
  const task = state.tasks.find((item) => item.id === taskId);
  if (!task) return;

  task.status = status;
  saveState();
  renderTasks();
}

function confirmFoldTask(task) {
  return window.confirm(`要把任务“${task.name}”折叠起来吗？`);
}

function switchView(view) {
  activeView = view;
  const activeTag = tagFromViewId(view);

  for (const button of tabButtons) {
    const isActive = button.dataset.view === view;
    button.classList.toggle("active", isActive);
    button.setAttribute("aria-selected", String(isActive));
  }

  if (dynamicTagTabs) {
    for (const button of dynamicTagTabs.querySelectorAll(".tag-tab-btn")) {
      const isActive = button.dataset.view === view;
      button.classList.toggle("active", isActive);
      button.setAttribute("aria-selected", String(isActive));
    }
  }

  for (const panel of viewPanels) {
    const isActive =
      (view === "active" && panel.dataset.viewPanel === "active") ||
      (view === "folded" && panel.dataset.viewPanel === "folded") ||
      (activeTag && panel.dataset.viewPanel === "tagged");
    panel.hidden = !isActive;
    panel.classList.toggle("active", isActive);
  }

  if (activeTag && taggedViewTitle && taggedViewHint) {
    const color = colorForTag(activeTag);
    taggedViewTitle.textContent = `标签：${activeTag}`;
    taggedViewTitle.style.setProperty("--tag-color", color);
    taggedViewHint.textContent = `显示包含“${activeTag}”标签的任务。`;
    renderTaggedTaskView(activeTag);
  } else if (taggedViewTitle && taggedViewHint) {
    taggedViewTitle.textContent = "标签任务";
    taggedViewTitle.style.removeProperty("--tag-color");
    taggedViewHint.textContent = "按标签颜色分类查看任务。";
  }
}

function renderTaskList(container, tasks, status) {
  container.innerHTML = "";

  if (!tasks.length) {
    const empty = document.createElement("div");
    empty.className = "control-note";
    empty.textContent =
      status === "folded"
        ? "这里还没有折叠的任务。"
        : status === "tagged"
          ? "这个标签下还没有任务。"
          : "当前没有进行中的任务，可以从折叠页拖回来。";
    container.append(empty);
    return;
  }

  for (const task of tasks) {
    const card = taskTemplate.content.firstElementChild.cloneNode(true);
    card.dataset.taskId = task.id;
    card.dataset.taskStatus = task.status;
    card.draggable = true;
    const title = card.querySelector(".task-title");
    const meta = card.querySelector(".task-meta");
    const statValue = card.querySelector(".stat-value");
    const chart = card.querySelector(".task-chart");
    const milestoneList = card.querySelector(".milestone-list");
    const markDate = card.querySelector(".mark-date");
    const markPercent = card.querySelector(".mark-percent");
    const markNote = card.querySelector(".mark-note");
    const addMarkBtn = card.querySelector(".add-mark-btn");
    const tagInput = card.querySelector(".task-tag-input");
    const addTagBtn = card.querySelector(".add-tag-btn");
    const tagList = card.querySelector(".task-tag-list");
    const editTaskBtn = card.querySelector(".edit-task-btn");
    const toggleTaskBtn = card.querySelector(".toggle-task-btn");
    const deleteTaskBtn = card.querySelector(".delete-task-btn");

    const latest = latestMark(task);

    title.textContent = task.name;
    title.title = task.name;
    meta.textContent = `创建于 ${formatLongDate(task.createdAt)} · ${task.marks.length} 条标注`;
    meta.title = meta.textContent;
    statValue.textContent = `${latest.percent}%`;
    card.style.setProperty("--task-accent", task.tags.length ? colorForTag(task.tags[0]) : colorForPercent(latest.percent));

    markDate.value = todayValue();
    markPercent.value = String(latest.percent || 0);
    markNote.value = "";
    tagInput.value = "";
    toggleTaskBtn.textContent = task.status === "folded" ? "恢复任务" : "折叠任务";

    renderChart(task, chart);
    renderMilestones(task, milestoneList);
    renderTagChips(task, tagList);

    card.addEventListener("dragstart", (event) => {
      draggedTaskId = task.id;
      event.dataTransfer.effectAllowed = "move";
      event.dataTransfer.setData("text/plain", task.id);
    });

    card.addEventListener("dragend", () => {
      draggedTaskId = null;
      for (const zone of [...dropZones, taskListActive, taskListFolded]) {
        zone.classList.remove("drag-over");
      }
    });

    addMarkBtn.addEventListener("click", () => {
      const date = markDate.value;
      const percent = clamp(Number(markPercent.value) || 0, 0, 100);
      const note = markNote.value.trim();

      if (!date) {
        markDate.focus();
        return;
      }

      task.marks.push({
        id: uid(),
        date,
        percent,
        note,
      });
      task.marks.sort((a, b) => parseDate(a.date) - parseDate(b.date));
      saveState();
      renderTasks();
    });

    const commitTag = () => {
      const tag = normalizeTag(tagInput.value);
      if (!tag) {
        tagInput.focus();
        return;
      }

      if (!task.tags.includes(tag)) {
        task.tags.push(tag);
        task.tags.sort((a, b) => a.localeCompare(b, "zh-Hans-CN"));
        saveState();
        renderTasks();
      }

      tagInput.value = "";
      tagInput.focus();
    };

    addTagBtn.addEventListener("click", commitTag);
    tagInput.addEventListener("keydown", (event) => {
      if (event.key === "Enter") {
        event.preventDefault();
        commitTag();
      }
    });

    tagList.addEventListener("click", (event) => {
      const removeBtn = event.target.closest(".task-tag-remove");
      if (!removeBtn) return;

      const { tag } = removeBtn.dataset;
      if (!tag) return;

      task.tags = task.tags.filter((item) => normalizeTag(item) !== normalizeTag(tag));
      saveState();
      renderTasks();
    });

    deleteTaskBtn.addEventListener("click", () => {
      if (!window.confirm(`确定删除任务“${task.name}”吗？此操作无法撤销。`)) {
        return;
      }

      state.tasks = state.tasks.filter((item) => item.id !== task.id);
      saveState();
      renderTasks();
    });

    editTaskBtn.addEventListener("click", () => {
      const nextName = window.prompt("修改任务名称", task.name);
      if (nextName === null) return;

      const trimmed = nextName.trim();
      if (!trimmed) {
        window.alert("任务名称不能为空。");
        return;
      }

      task.name = trimmed;
      saveState();
      renderTasks();
    });

    toggleTaskBtn.addEventListener("click", () => {
      const nextStatus = status === "folded" ? "active" : "folded";
      if (nextStatus === "folded" && !confirmFoldTask(task)) {
        return;
      }

      setTaskStatus(task.id, nextStatus);
      switchView(nextStatus === "folded" ? "folded" : "active");
    });

    container.append(card);
  }
}

function bindDropTarget(target, status, afterDropView = null, confirmFold = false) {
  if (!target) return;

  const onDragOver = (event) => {
    if (!draggedTaskId) return;
    event.preventDefault();
    target.classList.add("drag-over");
  };

  const onDragLeave = () => {
    target.classList.remove("drag-over");
  };

  const onDrop = (event) => {
    if (!draggedTaskId) return;
    event.preventDefault();
    target.classList.remove("drag-over");
    const task = state.tasks.find((item) => item.id === draggedTaskId);
    if (!task) {
      draggedTaskId = null;
      return;
    }

    if (confirmFold && status === "folded" && !confirmFoldTask(task)) {
      draggedTaskId = null;
      return;
    }

    setTaskStatus(draggedTaskId, status);
    if (afterDropView) {
      switchView(afterDropView);
    }
    draggedTaskId = null;
  };

  target.addEventListener("dragover", onDragOver);
  target.addEventListener("dragenter", onDragOver);
  target.addEventListener("dragleave", onDragLeave);
  target.addEventListener("drop", onDrop);
}

function renderTasks() {
  const activeTasks = state.tasks.filter((task) => task.status !== "folded");
  const foldedTasks = state.tasks.filter((task) => task.status === "folded");
  const tagStats = renderTagTabs();
  const currentTag = tagFromViewId(activeView);

  renderTaskList(taskListActive, activeTasks, "active");
  renderTaskList(taskListFolded, foldedTasks, "folded");
  renderTaggedTaskView(currentTag);
  updateSummary();

  if (currentTag && !tagStats.includes(currentTag)) {
    activeView = "active";
  }

  switchView(activeView);
}

function addTask() {
  const name = taskNameInput.value.trim();
  if (!name) {
    taskNameInput.focus();
    taskNameInput.placeholder = "请输入任务名称";
    return;
  }

  state.tasks.unshift({
    id: uid(),
    name,
    createdAt: todayValue(),
    tags: [],
    marks: [],
  });

  taskNameInput.value = "";
  saveState();
  renderTasks();
  taskNameInput.focus();
}

function exportMarkdownForDate() {
  const dateValue = exportDateInput?.value || todayValue();
  const content = buildMarkdownExport(dateValue);
  downloadTextFile(`任务完成情况-${filenameDate(dateValue)}.md`, content);
}

for (const button of tabButtons) {
  button.addEventListener("click", () => switchView(button.dataset.view));
}

if (dynamicTagTabs) {
  dynamicTagTabs.addEventListener("click", (event) => {
    const button = event.target.closest(".tag-tab-btn");
    if (!button) return;
    switchView(button.dataset.view);
  });
}

function bindMarkRemoval(container) {
  container.addEventListener("click", (event) => {
    const removeBtn = event.target.closest(".mark-remove");
    if (!removeBtn) return;

    const { taskId, markId } = removeBtn.dataset;
    const task = state.tasks.find((item) => item.id === taskId);
    if (!task) return;

    task.marks = task.marks.filter((mark) => mark.id !== markId);
    saveState();
    renderTasks();
  });
}

bindMarkRemoval(taskListActive);
bindMarkRemoval(taskListFolded);
bindMarkRemoval(taskListTagged);

bindDropTarget(taskListActive, "active");
bindDropTarget(taskListFolded, "folded");
const foldDropZone = dropZones.find((zone) => zone.dataset.dropZone === "fold");
const restoreDropZone = dropZones.find((zone) => zone.dataset.dropZone === "restore");
bindDropTarget(foldDropZone, "folded", "folded", true);
bindDropTarget(restoreDropZone, "active", "active");

addTaskBtn.addEventListener("click", addTask);
taskNameInput.addEventListener("keydown", (event) => {
  if (event.key === "Enter") {
    event.preventDefault();
    addTask();
  }
});

if (exportDateInput) {
  exportDateInput.value = todayValue();
}

exportMarkdownBtn?.addEventListener("click", exportMarkdownForDate);
exportBoardBtn?.addEventListener("click", exportBoardBackup);
importBoardBtn?.addEventListener("click", () => importBoardInput?.click());
importBoardInput?.addEventListener("change", async () => {
  const file = importBoardInput.files?.[0];
  if (!file) return;

  try {
    await importBoardBackupFromFile(file);
  } catch (error) {
    window.alert(error instanceof Error ? error.message : "导入失败，请检查备份文件。");
  } finally {
    importBoardInput.value = "";
  }
});
newBlankBoardBtn?.addEventListener("click", newBlankBoard);

renderTasks();
