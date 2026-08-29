const appShell = document.querySelector("#app-shell");
const commandBackdrop = document.querySelector("#command-backdrop");
const commandInput = document.querySelector("#command-input");
const commandResults = document.querySelector("#command-results");
const laneTrack = document.querySelector("#lane-track");
const toast = document.querySelector("#toast");
const toastMessage = document.querySelector("#toast-message");
const undoButton = document.querySelector("#undo-button");

let focusedTask = document.querySelector("[data-task].is-selected");
let lastCompletedTask = null;
let toastTimer = null;

function allTasks() {
  return [...document.querySelectorAll("[data-task]")].filter(
    (task) => task.style.display !== "none",
  );
}

function selectTask(task) {
  if (!task) return;
  document.querySelectorAll("[data-task].is-selected").forEach((item) => {
    item.classList.remove("is-selected");
  });
  task.classList.add("is-selected");
  focusedTask = task;
  task.scrollIntoView({ block: "nearest", inline: "nearest", behavior: "smooth" });
}

function updateLaneCount(lane) {
  if (!lane) return;
  const count = lane.querySelectorAll("[data-task]:not(.is-completed)").length;
  const countElement = lane.querySelector(".task-count");
  if (countElement) countElement.textContent = String(count);
}

function showToast(message) {
  toastMessage.textContent = message;
  toast.hidden = false;
  window.clearTimeout(toastTimer);
  toastTimer = window.setTimeout(() => {
    toast.hidden = true;
  }, 4200);
}

function completeTask(task) {
  if (!task) return;
  const taskList = task.parentElement;
  const lane = task.closest(".lane");
  const title = task.dataset.title || "Task";
  const index = [...taskList.children].indexOf(task);

  lastCompletedTask = { task, taskList, lane, index };
  task.classList.add("is-completed");

  window.setTimeout(() => {
    if (task.classList.contains("is-completed")) {
      task.style.display = "none";
      updateLaneCount(lane);
      selectTask(allTasks()[0]);
    }
  }, 180);

  showToast(`${title} completed`);
}

function undoCompletion() {
  if (!lastCompletedTask) return;
  const { task, lane } = lastCompletedTask;
  task.style.display = "";
  task.classList.remove("is-completed");
  updateLaneCount(lane);
  selectTask(task);
  lastCompletedTask = null;
  toast.hidden = true;
}

function openCommandMenu() {
  commandBackdrop.hidden = false;
  appShell.setAttribute("inert", "");
  commandInput.value = "";
  filterCommands("");
  window.requestAnimationFrame(() => commandInput.focus());
}

function closeCommandMenu() {
  commandBackdrop.hidden = true;
  appShell.removeAttribute("inert");
  document.querySelector("[data-open-command]")?.focus();
}

function filterCommands(query) {
  const normalized = query.trim().toLowerCase();
  const items = [...commandResults.querySelectorAll(".command-item")];
  items.forEach((item) => {
    item.hidden = normalized.length > 0 && !item.dataset.commandLabel.toLowerCase().includes(normalized);
    item.classList.remove("is-active");
  });
  items.find((item) => !item.hidden)?.classList.add("is-active");
}

function createTaskRow(title) {
  const row = document.createElement("li");
  row.className = "task-row";
  row.dataset.task = "";
  row.dataset.title = title;
  row.draggable = true;

  const completion = document.createElement("button");
  completion.className = "completion";
  completion.type = "button";
  completion.setAttribute("aria-label", `Complete ${title}`);

  const content = document.createElement("div");
  content.className = "task-content";
  const titleElement = document.createElement("p");
  titleElement.className = "task-title";

  const urlMatch = title.match(/https?:\/\/[^\s]+/i);
  if (urlMatch) {
    const before = title.replace(urlMatch[0], "").trim();
    titleElement.textContent = before || "Saved link";
    const card = document.createElement("a");
    card.className = "link-card";
    card.href = urlMatch[0];
    card.target = "_blank";
    card.rel = "noreferrer";
    const hostname = new URL(urlMatch[0]).hostname.replace(/^www\./, "");
    card.innerHTML = `<span class="link-favicon">${hostname[0].toUpperCase()}</span><span class="link-copy"><strong>${hostname}</strong><small>${urlMatch[0]}</small></span><span class="link-arrow">↗</span>`;
    content.append(titleElement, card);
  } else {
    titleElement.textContent = title;
    content.append(titleElement);
  }

  row.append(completion, content);
  return row;
}

function moveFocusedTask(direction) {
  if (!focusedTask) return;
  const lanes = [...document.querySelectorAll(".lane")];
  const currentLane = focusedTask.closest(".lane");
  const currentIndex = lanes.indexOf(currentLane);
  const destination = lanes[currentIndex + direction];
  if (!destination) return;

  destination.querySelector(".task-list").append(focusedTask);
  updateLaneCount(currentLane);
  updateLaneCount(destination);
  selectTask(focusedTask);
  showToast(`Moved to ${destination.querySelector("h1").textContent}`);
}

function reorderFocusedTask(direction) {
  if (!focusedTask) return;
  const sibling = direction < 0 ? focusedTask.previousElementSibling : focusedTask.nextElementSibling;
  if (!sibling) return;
  if (direction < 0) {
    focusedTask.parentElement.insertBefore(focusedTask, sibling);
  } else {
    focusedTask.parentElement.insertBefore(sibling, focusedTask);
  }
  selectTask(focusedTask);
}

document.querySelectorAll("[data-open-command]").forEach((button) => {
  button.addEventListener("click", openCommandMenu);
});

commandBackdrop.addEventListener("click", (event) => {
  if (event.target === commandBackdrop) closeCommandMenu();
});

commandInput.addEventListener("input", (event) => filterCommands(event.target.value));

document.querySelectorAll("[data-quick-add]").forEach((form) => {
  form.addEventListener("submit", (event) => {
    event.preventDefault();
    const input = form.elements.task;
    const title = input.value.trim();
    if (!title) return;
    const lane = form.closest(".lane");
    const row = createTaskRow(title);
    lane.querySelector(".task-list").append(row);
    input.value = "";
    updateLaneCount(lane);
    selectTask(row);
  });
});

document.addEventListener("click", (event) => {
  const task = event.target.closest("[data-task]");
  if (task && !event.target.closest("a")) selectTask(task);

  const completion = event.target.closest(".completion");
  if (completion) completeTask(completion.closest("[data-task]"));
});

undoButton.addEventListener("click", undoCompletion);

document.addEventListener("keydown", (event) => {
  const isCommand = event.metaKey || event.ctrlKey;
  const editing = event.target.matches("input, textarea, [contenteditable='true']");

  if (isCommand && event.key.toLowerCase() === "k") {
    event.preventDefault();
    commandBackdrop.hidden ? openCommandMenu() : closeCommandMenu();
    return;
  }

  if (!commandBackdrop.hidden) {
    if (event.key === "Escape") {
      event.preventDefault();
      closeCommandMenu();
    }
    return;
  }

  if (isCommand && event.key === "Enter" && !editing) {
    event.preventDefault();
    completeTask(focusedTask);
    return;
  }

  if (isCommand && event.shiftKey && !editing) {
    if (event.key === "ArrowLeft" || event.key === "ArrowRight") {
      event.preventDefault();
      moveFocusedTask(event.key === "ArrowLeft" ? -1 : 1);
      return;
    }
    if (event.key === "ArrowUp" || event.key === "ArrowDown") {
      event.preventDefault();
      reorderFocusedTask(event.key === "ArrowUp" ? -1 : 1);
      return;
    }
  }

  if (!editing && (event.key === "ArrowUp" || event.key === "ArrowDown")) {
    event.preventDefault();
    const tasks = allTasks();
    const index = tasks.indexOf(focusedTask);
    const nextIndex = event.key === "ArrowUp" ? Math.max(0, index - 1) : Math.min(tasks.length - 1, index + 1);
    selectTask(tasks[nextIndex]);
  }
});

let draggedTask = null;

document.querySelectorAll("[data-task]").forEach((task) => {
  task.draggable = true;
});

document.addEventListener("dragstart", (event) => {
  const task = event.target.closest("[data-task]");
  if (!task) return;
  draggedTask = task;
  task.classList.add("is-dragging");
  event.dataTransfer.effectAllowed = "move";
});

document.addEventListener("dragover", (event) => {
  const task = event.target.closest("[data-task]");
  const lane = event.target.closest(".lane");
  if (!draggedTask || (!task && !lane)) return;
  event.preventDefault();
  document.querySelectorAll(".is-drop-target").forEach((item) => item.classList.remove("is-drop-target"));
  task?.classList.add("is-drop-target");
});

document.addEventListener("drop", (event) => {
  if (!draggedTask) return;
  event.preventDefault();
  const oldLane = draggedTask.closest(".lane");
  const targetTask = event.target.closest("[data-task]");
  const targetLane = event.target.closest(".lane");

  if (targetTask && targetTask !== draggedTask) {
    targetTask.parentElement.insertBefore(draggedTask, targetTask.nextElementSibling);
  } else if (targetLane) {
    targetLane.querySelector(".task-list").append(draggedTask);
  }

  updateLaneCount(oldLane);
  updateLaneCount(draggedTask.closest(".lane"));
  selectTask(draggedTask);
});

document.addEventListener("dragend", () => {
  draggedTask?.classList.remove("is-dragging");
  document.querySelectorAll(".is-drop-target").forEach((item) => item.classList.remove("is-drop-target"));
  draggedTask = null;
});

const laneObserver = new IntersectionObserver(
  (entries) => {
    const visible = entries.filter((entry) => entry.isIntersecting).sort((a, b) => b.intersectionRatio - a.intersectionRatio)[0];
    if (!visible) return;
    const lanes = [...document.querySelectorAll(".lane")];
    const index = lanes.indexOf(visible.target);
    document.querySelectorAll("[data-lane-dot]").forEach((dot, dotIndex) => {
      dot.classList.toggle("is-active", dotIndex === index);
    });
  },
  { root: laneTrack, threshold: [0.55, 0.8] },
);

document.querySelectorAll(".lane").forEach((lane) => laneObserver.observe(lane));

document.querySelectorAll("[data-lane-dot]").forEach((dot) => {
  dot.addEventListener("click", () => {
    document.querySelectorAll(".lane")[Number(dot.dataset.laneDot)]?.scrollIntoView({ behavior: "smooth", inline: "center" });
  });
});
