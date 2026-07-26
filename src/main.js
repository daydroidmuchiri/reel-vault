import { isUnlocked, setStoredPasscode } from "./auth.js";
import { fetchReels, fetchTools, submitReel } from "./api.js";
import { renderReelCard, renderToolRow, filterTools } from "./render.js";

const $ = (id) => document.getElementById(id);
let allTools = [];

function showApp() {
  $("passcode-screen").hidden = true;
  $("app").hidden = false;
  loadReels();
  loadTools();
}

async function loadReels() {
  const list = $("reels-list");
  list.textContent = "Loading…";
  try {
    const reels = await fetchReels();
    list.innerHTML = reels.length ? reels.map(renderReelCard).join("") : "<p>No reels saved yet.</p>";
  } catch (err) {
    list.textContent = `Couldn't load reels: ${err.message}`;
  }
}

async function loadTools() {
  const list = $("tools-list");
  list.textContent = "Loading…";
  try {
    allTools = await fetchTools();
    renderToolsList(allTools);
  } catch (err) {
    list.textContent = `Couldn't load tools: ${err.message}`;
  }
}

function renderToolsList(tools) {
  $("tools-list").innerHTML = tools.length ? tools.map(renderToolRow).join("") : "<p>No tools saved yet.</p>";
}

function switchTab(tab) {
  document.querySelectorAll(".tab-panel").forEach((el) => {
    el.hidden = el.dataset.tab !== tab;
  });
  document.querySelectorAll(".tab-button").forEach((el) => {
    el.classList.toggle("active", el.dataset.tab === tab);
  });
}

if (isUnlocked()) {
  showApp();
}

$("passcode-form").addEventListener("submit", (e) => {
  e.preventDefault();
  const value = $("passcode-input").value.trim();
  if (!value) return;
  setStoredPasscode(value);
  showApp();
});

document.querySelectorAll(".tab-button").forEach((btn) => {
  btn.addEventListener("click", () => switchTab(btn.dataset.tab));
});

$("tools-search").addEventListener("input", (e) => {
  renderToolsList(filterTools(allTools, e.target.value));
});

$("reel-form").addEventListener("submit", async (e) => {
  e.preventDefault();
  const input = $("reel-url-input");
  const error = $("reel-error");
  const button = $("reel-submit");
  const url = input.value.trim();
  if (!url) return;
  error.hidden = true;
  button.disabled = true;
  button.textContent = "Saving…";
  const result = await submitReel(url);
  button.disabled = false;
  button.textContent = "Save reel";
  if (!result.ok) {
    error.textContent = result.error;
    error.hidden = false;
    return;
  }
  input.value = "";
  loadReels();
});
