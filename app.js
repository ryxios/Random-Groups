const STORAGE_KEY = "random-groups::classes";

const state = {
  classes: [],
  selectedClassId: null,
};

const elements = {
  classSelect: document.querySelector("#classSelect"),
  classDetails: document.querySelector("#classDetails"),
  saveButton: document.querySelector("#saveButton"),
  createClassButton: document.querySelector("#createClassButton"),
  deleteClassButton: document.querySelector("#deleteClassButton"),
  classTemplate: document.querySelector("#classTemplate"),
  learnerTemplate: document.querySelector("#learnerTemplate"),
};

function init() {
  hydrateState();
  bindGlobalEvents();
  render();
}

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", init, { once: true });
} else {
  init();
}

function hydrateState() {
  try {
    if (typeof window === "undefined" || !window.localStorage) {
      throw new Error("Kein localStorage verfügbar");
    }

    const persisted = window.localStorage.getItem(STORAGE_KEY);
    if (!persisted) {
      state.classes = [createClassData()];
      state.selectedClassId = state.classes[0].id;
      return;
    }

    const parsed = JSON.parse(persisted);
    if (!Array.isArray(parsed) || parsed.length === 0) {
      state.classes = [createClassData()];
      state.selectedClassId = state.classes[0].id;
      return;
    }

    state.classes = parsed
      .filter(Boolean)
      .map((entry) => ({
        id: entry.id ?? createId(),
        name: typeof entry.name === "string" ? entry.name : "Unbenannte Klasse",
        learners: Array.isArray(entry.learners) ? [...entry.learners] : [],
      }));

    if (state.classes.length === 0) {
      state.classes.push(createClassData());
    }

    state.selectedClassId = state.classes[0].id;
  } catch (error) {
    console.error("Klassen konnten nicht geladen werden", error);
    state.classes = [createClassData()];
    state.selectedClassId = state.classes[0].id;
  }
}

function bindGlobalEvents() {
  elements.saveButton.addEventListener("click", () => {
    persistState();
    elements.saveButton.classList.add("fade-in");
    window.setTimeout(() => elements.saveButton.classList.remove("fade-in"), 240);
  });

  elements.createClassButton.addEventListener("click", () => {
    const newClass = createClassData({ name: "Neue Klasse" });
    state.classes.push(newClass);
    state.selectedClassId = newClass.id;
    render();
  });

  elements.deleteClassButton.addEventListener("click", () => {
    if (!state.selectedClassId) return;

    const remaining = state.classes.filter((klass) => klass.id !== state.selectedClassId);
    if (remaining.length === 0) {
      state.classes = [createClassData()];
    } else {
      state.classes = remaining;
    }

    state.selectedClassId = state.classes[0]?.id ?? null;
    render();
  });

  elements.classSelect.addEventListener("change", (event) => {
    state.selectedClassId = event.target.value;
    renderClassDetails();
  });
}

function persistState() {
  try {
    if (typeof window === "undefined" || !window.localStorage) {
      return;
    }

    const payload = state.classes.map((klass) => ({
      id: klass.id,
      name: klass.name,
      learners: [...klass.learners],
    }));

    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(payload));
  } catch (error) {
    console.warn("Speichern fehlgeschlagen", error);
  }
}

function createClassData(overrides = {}) {
  return {
    id: createId(),
    name: "Unbenannte Klasse",
    learners: [""],
    ...overrides,
    learners: Array.isArray(overrides.learners)
      ? [...overrides.learners]
      : overrides.learners === undefined
        ? [""]
        : [String(overrides.learners)],
  };
}

function createId() {
  return (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function")
    ? crypto.randomUUID()
    : `klasse-${Math.random().toString(36).slice(2, 11)}`;
}

function render() {
  if (!state.classes.some((klass) => klass.id === state.selectedClassId)) {
    state.selectedClassId = state.classes[0]?.id ?? null;
  }
  renderClassSelect();
  renderClassDetails();
  elements.deleteClassButton.disabled = state.classes.length <= 1;
}

function renderClassSelect() {
  const fragment = document.createDocumentFragment();
  state.classes.forEach((klass) => {
    const option = document.createElement("option");
    option.value = klass.id;
    option.textContent = klass.name || "Unbenannte Klasse";
    option.selected = klass.id === state.selectedClassId;
    fragment.appendChild(option);
  });

  elements.classSelect.innerHTML = "";
  elements.classSelect.appendChild(fragment);
}

function renderClassDetails() {
  elements.classDetails.innerHTML = "";
  const currentClass = state.classes.find((klass) => klass.id === state.selectedClassId);

  if (!currentClass) {
    const empty = document.createElement("div");
    empty.className = "empty-state";
    empty.textContent = "Keine Klasse ausgewählt.";
    elements.classDetails.appendChild(empty);
    return;
  }

  const template = elements.classTemplate.content.cloneNode(true);
  const nameField = template.querySelector('[data-field="name"]');
  const learnersList = template.querySelector('[data-list="learners"]');
  const addButton = template.querySelector('[data-action="add-learner"]');

  nameField.value = currentClass.name;
  nameField.addEventListener("input", (event) => {
    currentClass.name = event.target.value;
    renderClassSelect();
  });

  addButton.addEventListener("click", () => {
    currentClass.learners.push("");
    renderLearnersList(learnersList, currentClass);
  });

  renderLearnersList(learnersList, currentClass);

  elements.classDetails.appendChild(template);
}

function renderLearnersList(listElement, currentClass) {
  listElement.innerHTML = "";

  if (currentClass.learners.length === 0) {
    const empty = document.createElement("div");
    empty.className = "empty-state";
    empty.textContent = "Noch keine Lernenden hinzugefügt.";
    listElement.appendChild(empty);
    return;
  }

  currentClass.learners.forEach((name, index) => {
    const entry = elements.learnerTemplate.content.firstElementChild.cloneNode(true);
    const input = entry.querySelector(".learner__input");
    const removeButton = entry.querySelector('[data-action="remove-learner"]');

    input.value = name;
    input.addEventListener("input", (event) => {
      currentClass.learners[index] = event.target.value;
    });

    removeButton.addEventListener("click", () => {
      currentClass.learners.splice(index, 1);
      renderLearnersList(listElement, currentClass);
    });

    listElement.appendChild(entry);
  });
}

if (typeof window !== "undefined" && window.addEventListener) {
  window.addEventListener("beforeunload", persistState);
}
