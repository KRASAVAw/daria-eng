(function () {
 const STORAGE_KEY = "dasha_custom_lists_v4";
 const DEFAULT_CUSTOM_EMOJI = "📝";
 const EMOJI_PRESETS = ["📝", "📚", "🍎", "🎯", "🧠", "💡", "🎵", "🌍", "✈️", "🏠"];
 const LEGACY_KEYS = [STORAGE_KEY, "dasha_custom_lists_v3", "dasha_custom_lists_v2", "dasha_custom_lists_v1"];
 const BUILTIN_SOURCES = { irregular: "builtin-irregular", food: "builtin-food" };
 const HISTORY_KEY = "dasha_english_history_v1";
 const state = { open: false, lists: [], deletedBuiltins: [], selectedId: "", newListName: "", renameName: "", renameEmoji: "", term: "", translations: "", bulk: "", entrySearch: "", editingEntryId: "", editorListId: "", entryMode: "", notice: "", storeUpdatedAt: 0 };
 const quizState = { open: false, step: "setup", listId: "", entries: [], pool: [], basePool: [], direction: "en_ru", count: 10, baseCount: 10, shuffle: false, index: 0, input: "", checked: false, results: [], inputs: [], finishedEarly: false, historySettings: null, mobileResultsOpen: false };
 let overlay;
 let body;
 let floatingTrigger;
 let inlineWrap;
 let homeCardsHost;
 let quizOverlay;
 let quizBody;
 let builtinCache;
 let observerTimer = 0;
 let homeScrollNodes = [];
 let supabaseModulePromise = null;
 let supabaseReadyPromise = null;
 let remoteHydratePromise = null;
 let remoteSaveTimer = 0;
 let remoteSaveInFlight = false;
 function makeId() { return Date.now().toString(36) + Math.random().toString(36).slice(2, 8); }
 function text(value) { return String(value ? value : "").trim(); }
 function norm(value) { return text(value).toLowerCase(); }
 function safeArray(value) { return Array.isArray(value) ? value : []; }
 function node(tagName, className, textValue) {
 const element = document.createElement(tagName);
 if (className) { element.className = className; }
 if (textValue !== undefined) { element.textContent = textValue; }
 return element;
 }
 function clear(element) {
 while (element.firstChild) { element.removeChild(element.firstChild); }
 }
 function uniqueValues(values) {
 const seen = Object.create(null);
 const output = [];
 values.forEach(function (value) {
 const clean = text(value);
 const key = norm(clean);
 if (!clean) { return; }
 if (seen[key]) { return; }
 seen[key] = true;
 output.push(clean);
 });
 return output;
 }
 function splitTranslations(value) {
 return uniqueValues(String(value ? value : "").split(/[;,/]/).map(function (item) { return item.trim(); }));
 }
 function readJson(key) {
 try {
 const raw = window.localStorage.getItem(key);
 return raw ? JSON.parse(raw) : null;
 } catch (error) {
 return null;
 }
 }
function writeStore() { 
 try { 
 window.localStorage.setItem(STORAGE_KEY, JSON.stringify({ lists: state.lists, deletedBuiltins: state.deletedBuiltins, updatedAt: state.storeUpdatedAt })); 
 } catch (error) { 
 console.warn("custom lists storage error", error); 
 } 
} 
function readHistorySessions() { 
 try { 
 const raw = window.localStorage.getItem(HISTORY_KEY); 
 const parsed = raw ? JSON.parse(raw) : []; 
 return Array.isArray(parsed) ? parsed : []; 
 } catch (error) { 
 return []; 
 } 
} 
function writeHistorySessions(value) { 
 try { 
 window.localStorage.setItem(HISTORY_KEY, JSON.stringify(value)); 
 } catch (error) { 
 console.warn("custom lists history storage error", error); 
 } 
 return value; 
} 
function addHistorySession(session) {
 state.storeUpdatedAt = Date.now();
 return writeHistorySessions([session].concat(readHistorySessions()).slice(0, 200)); 
} 
 function sortEntries(entries) {
 return entries.slice().sort(function (left, right) {
 return left.term.localeCompare(right.term, "en", { sensitivity: "base" });
 });
 }
 function isBuiltinListSource(source) {
 return text(source).indexOf("builtin-") === 0;
 }
 function isBuiltinList(list) {
 if (!list) { return false; }
 return isBuiltinListSource(list.source);
 }
 function getDefaultListEmoji(source) {
 if (source === BUILTIN_SOURCES.irregular) { return "📘"; }
 if (source === BUILTIN_SOURCES.food) { return "🍎"; }
 return DEFAULT_CUSTOM_EMOJI;
 }
 function getRandomCustomEmoji() {
 return EMOJI_PRESETS[Math.floor(Math.random() * EMOJI_PRESETS.length)];
 }
 function getListEmoji(list) {
 if (!list) { return getDefaultListEmoji("custom"); }
 if (text(list.emoji)) { return text(list.emoji); }
 return getDefaultListEmoji(list.source);
 }
 function getListCreatedAt(list) {
 const fallback = isBuiltinList(list) ? 0 : 1;
 const value = Number(list ? list.createdAt : fallback);
 if (!Number.isFinite(value)) { return fallback; }
 return Math.max(value, fallback);
 }
 function sortLists(lists) {
 return lists.slice().sort(function (left, right) {
 const leftBuiltin = isBuiltinList(left);
 const rightBuiltin = isBuiltinList(right);
 const createdDelta = getListCreatedAt(right) - getListCreatedAt(left);
 if (leftBuiltin !== rightBuiltin) { return leftBuiltin ? 1 : -1; }
 if (!leftBuiltin) {
 if (createdDelta) { return createdDelta; }
 }
 return left.name.localeCompare(right.name, "ru", { sensitivity: "base" });
 });
 }
 function sanitizeEntry(raw) {
 const item = raw ? raw : {};
 const term = text(item.term ? item.term : item.word ? item.word : item.en ? item.en : item.base ? item.base : item.question);
 const source = Array.isArray(item.translations) ? item.translations : Array.isArray(item.ru) ? item.ru : splitTranslations(item.translation ? item.translation : item.answer ? item.answer : "");
 const translations = uniqueValues(source.map(function (entry) { return text(entry); }));
 if (!term) { return null; }
 if (!translations.length) { return null; }
 return { id: text(item.id) ? text(item.id) : makeId(), term: term, translations: translations };
 }
 function sanitizeList(raw) {
 const item = raw ? raw : {};
 const source = text(item.source) ? text(item.source) : "custom";
 const name = text(item.name ? item.name : item.title ? item.title : item.listName);
 const entries = safeArray(item.entries).map(sanitizeEntry).filter(Boolean);
 const fallbackCreatedAt = isBuiltinListSource(source) ? 0 : 1;
 const createdAt = Number(item.createdAt);
 if (!name) { return null; }
 return {
 id: text(item.id) ? text(item.id) : makeId(),
 name: name,
 emoji: text(item.emoji) ? text(item.emoji) : getDefaultListEmoji(source),
 entries: sortEntries(entries),
 source: source,
 createdAt: Number.isFinite(createdAt) ? Math.max(createdAt, fallbackCreatedAt) : fallbackCreatedAt
 };
 }
 function mergeEntries(existingEntries, extraEntries) {
 const merged = existingEntries.map(function (entry) { return { id: entry.id, term: entry.term, translations: entry.translations.slice() }; });
 extraEntries.forEach(function (rawEntry) {
 const entry = sanitizeEntry(rawEntry);
 let current;
 if (!entry) { return; }
 current = merged.find(function (candidate) { return norm(candidate.term) === norm(entry.term); });
 if (current) { current.translations = uniqueValues(current.translations.concat(entry.translations)); return; }
 merged.push(entry);
 });
 return sortEntries(merged).filter(function (entry) {
 if (!text(entry.term)) { return false; }
 return Boolean(entry.translations.length);
 });
 }
 function parseBulkEntries(value) {
 const lines = String(value ? value : "").split(/\r?\n/);
 const entries = [];
 const skipped = [];
 lines.forEach(function (line, index) {
 const clean = line.trim();
 const match = clean.match(/(.+?)\s*[-–—]\s*(.+)$/);
 if (!clean) { return; }
 if (!match) { skipped.push(index + 1); return; }
 entries.push({ id: makeId(), term: match[1], translations: splitTranslations(match[2]) });
 });
 return { entries: entries.map(sanitizeEntry).filter(Boolean), skipped: skipped };
 }
 function extractBuiltins() {
 const scripts = Array.from(document.scripts);
 if (builtinCache) { return builtinCache; }
 scripts.forEach(function (script) {
 const content = script.textContent ? script.textContent : "";
 const fsIndex = content.indexOf("const Fs=");
 const wsIndex = content.indexOf(",Ws=", fsIndex);
 let nextFunctionIndex;
 let irregularExpr;
 let foodExpr;
 if (builtinCache) { return; }
 if (fsIndex === -1) { return; }
 if (wsIndex === -1) { return; }
 nextFunctionIndex = content.indexOf("function zA", wsIndex);
 if (nextFunctionIndex === -1) { nextFunctionIndex = content.indexOf("function", wsIndex); }
 if (nextFunctionIndex === -1) { return; }
 irregularExpr = content.slice(fsIndex + 9, wsIndex).trim();
 foodExpr = content.slice(wsIndex + 4, nextFunctionIndex).trim().replace(/;$/, "");
 try {
 builtinCache = { irregular: Function("return (" + irregularExpr + ");")(), food: Function("return (" + foodExpr + ");")() };
 } catch (error) {
 console.warn("custom lists builtin parse error", error);
 }
 });
 if (!builtinCache) { builtinCache = { irregular: [], food: {} }; }
 return builtinCache;
 }
 function buildBuiltinLists() {
 const data = extractBuiltins();
 const irregularEntries = safeArray(data.irregular).map(function (item) {
 return sanitizeEntry({ id: BUILTIN_SOURCES.irregular + "-" + text(item.base), term: item.base, translations: safeArray(item.ru) });
 }).filter(Boolean);
 const foodObject = data.food ? data.food : {};
 const foodEntries = mergeEntries([], Object.keys(foodObject).reduce(function (all, level) {
 return all.concat(safeArray(foodObject[level]).map(function (item) {
 return { id: BUILTIN_SOURCES.food + "-" + text(item.en), term: item.en, translations: safeArray(item.ru) };
 }));
 }, []));
 return [
 irregularEntries.length ? { id: BUILTIN_SOURCES.irregular, name: "Неправильные глаголы", emoji: "📘", entries: irregularEntries, source: BUILTIN_SOURCES.irregular, createdAt: 0 } : null,
 foodEntries.length ? { id: BUILTIN_SOURCES.food, name: "Еда и напитки", emoji: "🍎", entries: foodEntries, source: BUILTIN_SOURCES.food, createdAt: 0 } : null
 ].filter(Boolean);
 }
 function getSelectedList() {
 const selected = state.lists.find(function (list) { return list.id === state.selectedId; });
 return selected ? selected : null;
 }
 function syncDrafts() {
 const selected = getSelectedList();
 state.renameName = selected ? selected.name : "";
 state.renameEmoji = selected ? getListEmoji(selected) : DEFAULT_CUSTOM_EMOJI;
 state.term = "";
 state.translations = "";
 state.bulk = "";
 state.entrySearch = "";
 state.editingEntryId = "";
 }
 function loadStore() {
 let raw = null;
 LEGACY_KEYS.forEach(function (key) {
 const candidate = readJson(key);
 if (raw) { return; }
 if (Array.isArray(candidate)) { raw = { lists: candidate, deletedBuiltins: [] }; return; }
 if (!candidate) { return; }
 if (Array.isArray(candidate.lists)) { raw = { lists: candidate.lists, deletedBuiltins: safeArray(candidate.deletedBuiltins), updatedAt: Number(candidate.updatedAt) }; }
 });
 state.storeUpdatedAt = Number(raw ? raw.updatedAt : 0);
 if (!Number.isFinite(state.storeUpdatedAt)) { state.storeUpdatedAt = 0; }
 state.deletedBuiltins = uniqueValues(safeArray(raw ? raw.deletedBuiltins : []));
 state.lists = safeArray(raw ? raw.lists : []).map(sanitizeList).filter(Boolean);
 buildBuiltinLists().forEach(function (builtin) {
 if (state.deletedBuiltins.indexOf(builtin.source) !== -1) { return; }
 if (!state.lists.some(function (list) { return list.source === builtin.source; })) { state.lists.push(builtin); }
 });
 state.lists = sortLists(state.lists);
 if (!state.lists.some(function (list) { return list.id === state.selectedId; })) { state.selectedId = state.lists[0] ? state.lists[0].id : ""; }
 if (!state.lists.some(function (list) { return list.id === state.editorListId; })) { state.editorListId = ""; state.entryMode = ""; }
 syncDrafts();
 }
 function setLists(nextLists, nextDeletedBuiltins) {
 state.lists = sortLists(nextLists);
 state.deletedBuiltins = nextDeletedBuiltins ? uniqueValues(nextDeletedBuiltins) : state.deletedBuiltins;
 state.storeUpdatedAt = Date.now();
 if (!state.lists.some(function (list) { return list.id === state.selectedId; })) { state.selectedId = state.lists[0] ? state.lists[0].id : ""; }
 if (!state.lists.some(function (list) { return list.id === state.editorListId; })) { state.editorListId = ""; state.entryMode = ""; }
 syncDrafts();
 writeStore();
 render();
 ensureTriggerPlacement();
 normalizeBuiltinTestUi();
 }
 function showPanel() { state.open = true; overlay.hidden = false; document.documentElement.classList.add("dcl-locked"); document.body.classList.add("dcl-locked"); }
function openPanel() { loadStore(); state.editorListId = ""; state.entryMode = ""; showPanel(); render(); }
function openCreatePanel() { loadStore(); state.notice = ""; showPanel(); createList(); }
function openHomeEditor(listId) { loadStore(); showPanel(); openListEditor(listId); }
 function closePanel() { state.open = false; overlay.hidden = true; document.documentElement.classList.remove("dcl-locked"); document.body.classList.remove("dcl-locked"); }
 function makeUniqueListName() {
 const baseName = "Новый список";
 let name = baseName;
 let counter = 2;
 while (state.lists.some(function (list) { return norm(list.name) === norm(name); })) {
 name = baseName + " " + counter;
 counter += 1;
 }
 return name;
 }
 function openListEditor(listId) {
 state.selectedId = listId;
 state.editorListId = listId;
 state.entryMode = "";
 state.notice = "";
 syncDrafts();
 render();
 }
 function closeListEditor() {
 state.editorListId = "";
 state.entryMode = "";
 state.notice = "";
 syncDrafts();
 render();
 }
 function createList() {
 const nextId = makeId();
 state.selectedId = nextId;
 state.editorListId = nextId;
 state.entryMode = "";
 state.notice = "";
 setLists(state.lists.concat({ id: nextId, name: makeUniqueListName(), emoji: getRandomCustomEmoji(), entries: [], source: "custom", createdAt: Date.now() }));
 }
 function removeListById(listId) {
 const selected = state.lists.find(function (list) { return list.id === listId; });
 let nextDeletedBuiltins = state.deletedBuiltins.slice();
 if (!selected) { return; }
 if (!window.confirm("??????? ?????? \"" + selected.name + "\"?")) { return; }
 if (selected.source.indexOf("builtin-") === 0) { nextDeletedBuiltins = uniqueValues(nextDeletedBuiltins.concat(selected.source)); }
 if (state.editorListId === selected.id) { state.editorListId = ""; state.entryMode = ""; }
 state.notice = "Список удален.";
 setLists(state.lists.filter(function (list) { return list.id !== selected.id; }), nextDeletedBuiltins);
 }
 function deleteSelectedList() {
 const selected = getSelectedList();
 if (!selected) { return; }
 removeListById(selected.id);
 }
 function renameSelectedList() {
 const selected = getSelectedList();
 const nextName = text(state.renameName);
 const nextEmoji = text(state.renameEmoji) ? text(state.renameEmoji) : getListEmoji(selected);
 if (!selected) { state.notice = "Сначала выбери список."; render(); return; }
 if (!nextName) { state.notice = "Название не может быть пустым."; render(); return; }
 state.notice = "Название сохранено.";
 setLists(state.lists.map(function (list) { return list.id === selected.id ? Object.assign({}, list, { name: nextName, emoji: nextEmoji }) : list; }));
 }
 function restoreBuiltins() {
 const builtins = buildBuiltinLists();
 const restoredSources = [];
 const restoredLists = builtins.filter(function (builtin) {
 const exists = state.lists.some(function (list) { return list.source === builtin.source; });
 if (!exists) { restoredSources.push(builtin.source); }
 return !exists;
 });
 state.notice = restoredLists.length ? "Встроенные списки восстановлены." : "Все встроенные списки уже на месте.";
 setLists(state.lists.concat(restoredLists), state.deletedBuiltins.filter(function (source) { return restoredSources.indexOf(source) === -1; }));
 }
 function saveEntry() {  
 const selected = getSelectedList();  
 const editingEntryId = state.editingEntryId;  
 const termInput = document.getElementById("dcl-entry-term");  
 const translationsInput = document.getElementById("dcl-entry-translations");  
 const liveTerm = text(termInput ? termInput.value : state.term);  
 const liveTranslations = text(translationsInput ? translationsInput.value : state.translations);  
 const draft = sanitizeEntry({ id: editingEntryId ? editingEntryId : makeId(), term: liveTerm, translations: splitTranslations(liveTranslations) });  
 let nextEntries;  
 let notice;  
 if (!selected) { state.notice = "Сначала выбери список."; render(); return; }  
 state.term = liveTerm;  
 state.translations = liveTranslations;  
 if (!draft) {  
  state.notice = "Укажи слово и хотя бы один перевод.";  
  render();  
  window.setTimeout(function () {
   const currentTermInput = document.getElementById("dcl-entry-term");
   const currentTranslationsInput = document.getElementById("dcl-entry-translations");
   if (!liveTerm) {
    if (currentTermInput) { currentTermInput.focus(); return; }
   }
   if (!liveTranslations) {
    if (currentTranslationsInput) { currentTranslationsInput.focus(); }
   }
  }, 0);
  return;  
 } 
 nextEntries = mergeEntries(selected.entries.filter(function (entry) { return entry.id !== editingEntryId; }), [draft]);  
 notice = editingEntryId ? "Слово обновлено." : "Слово добавлено.";  
 state.editingEntryId = "";  
 state.entryMode = "manual";  
 state.term = "";  
 state.translations = "";  
 state.notice = notice;  
 setLists(state.lists.map(function (list) { return list.id === selected.id ? Object.assign({}, list, { entries: nextEntries }) : list; }));  
 window.setTimeout(function () {  
  const nextTermInput = document.getElementById("dcl-entry-term");  
  const nextTranslationsInput = document.getElementById("dcl-entry-translations");  
  if (nextTermInput) { nextTermInput.value = ""; nextTermInput.focus(); }  
  if (nextTranslationsInput) { nextTranslationsInput.value = ""; }  
 }, 0);  
 }  
 function editEntry(entryId) {  
const selected = getSelectedList();  
let entry = null;  
if (!selected) { return; }  
entry = selected.entries.find(function (item) { return item.id === entryId; });  
if (!entry) { return; }  
state.editingEntryId = entry.id;  
state.entryMode = 'manual';  
state.term = entry.term;  
state.translations = entry.translations.join(', ');  
state.notice = '';  
render();  
window.setTimeout(scrollEntryEditorIntoView, 0);  
}  
function scrollEntryEditorIntoView() {  
const card = document.getElementById('dcl-entry-editor-card');  
const input = document.getElementById('dcl-entry-term');  
if (card) {  
if (typeof card.scrollIntoView === 'function') { card.scrollIntoView({ behavior: 'smooth', block: 'start' }); }  
}  
if (input) { input.focus(); if (typeof input.select === 'function') { input.select(); } }  
}
 function clearEntryEditor() {
 state.editingEntryId = "";
 state.entryMode = "";
 state.term = "";
 state.translations = "";
 state.notice = "";
 render();
 }
 function deleteEntry(entryId) {
 const selected = getSelectedList();
 if (!selected) { return; }
 if (!window.confirm("Удалить это слово из списка?")) { return; }
 state.notice = "Слово удалено.";
 setLists(state.lists.map(function (list) {
 return list.id === selected.id ? Object.assign({}, list, { entries: list.entries.filter(function (entry) { return entry.id !== entryId; }) }) : list;
 }));
 }
 function importBulk() {
 const selected = getSelectedList();
 const parsed = parseBulkEntries(state.bulk);
 if (!selected) { state.notice = "Сначала выбери список."; render(); return; }
 if (!parsed.entries.length) {
 state.notice = parsed.skipped.length ? "Не получилось разобрать строки: " + parsed.skipped.join(", ") + "." : "Вставь хотя бы одну строку.";
 render();
 return;
 }
 state.notice = parsed.skipped.length ? "Импортировано строк: " + parsed.entries.length + ". Пропущены: " + parsed.skipped.join(", ") + "." : "Импортировано строк: " + parsed.entries.length + ".";
 state.bulk = "";
 setLists(state.lists.map(function (list) { return list.id === selected.id ? Object.assign({}, list, { entries: mergeEntries(list.entries, parsed.entries) }) : list; }));
 }
 function makeButton(className, label, onClick, type) {
 const element = node("button", className, label);
 element.type = type ? type : "button";
 if (typeof onClick === "function") { element.addEventListener("click", onClick); }
 return element;
 }
 function makeInput(id, value, placeholder) {
 const element = node("input", "dcl-input");
 element.id = id;
 element.type = "text";
 element.value = value;
 element.placeholder = placeholder;
 return element;
 }
 function makeField(labelText, control) {
 const field = node("div", "dcl-field");
 const label = node("label", "dcl-label", labelText);
 if (control.id) { label.htmlFor = control.id; }
 field.appendChild(label);
 field.appendChild(control);
 return field;
 }
 function makeCard() { return node("div", "dcl-card"); }
 function makeSectionHead(labelText, titleText, subtitleText) {
 const wrap = node("div", "dcl-section-head");
 const inner = node("div");
 if (labelText) { inner.appendChild(node("div", "dcl-label", labelText)); }
 if (titleText) { inner.appendChild(node("h3", "dcl-title", titleText)); }
 if (subtitleText) { inner.appendChild(node("div", "dcl-subtitle", subtitleText)); }
 wrap.appendChild(inner);
 return wrap;
 }
 function makeEmojiPicker() {
 const wrap = node("div", "dcl-emoji-picker");
 EMOJI_PRESETS.forEach(function (emoji) {
 const button = makeButton(state.renameEmoji === emoji ? "dcl-emoji-chip dcl-emoji-chip-active" : "dcl-emoji-chip", emoji, function () {
 state.renameEmoji = emoji;
 render();
 });
 button.setAttribute("aria-label", "Выбрать emoji " + emoji);
 wrap.appendChild(button);
 });
 return wrap;
 }
 function updateEntryListFilter(listWrap, emptyState, clearButton) {
 const query = norm(state.entrySearch);
 let visibleCount = 0;
 Array.from(listWrap.children).forEach(function (item) {
 const haystack = item.getAttribute("data-search") ? item.getAttribute("data-search") : "";
 let visible = true;
 if (query) { visible = haystack.indexOf(query) !== -1; }
 item.hidden = !visible;
 if (visible) { visibleCount += 1; }
 });
 emptyState.hidden = visibleCount !== 0;
 if (clearButton) { clearButton.hidden = !state.entrySearch; }
 }
 function makeListRow(list) {
 const isBuiltin = isBuiltinList(list);
 const wrap = node("div", "dcl-entry");
 const main = node("div", "dcl-entry-main");
 const actions = node("div", "dcl-entry-actions");
 main.appendChild(node("div", "dcl-entry-term", getListEmoji(list) + " " + list.name));
 main.appendChild(node("div", "dcl-entry-translations", list.entries.length + " слов" + (isBuiltin ? " • встроенный список" : "")));
 actions.appendChild(makeButton("dcl-btn dcl-btn-muted", "Редактировать", function () { openListEditor(list.id); }));
 actions.appendChild(makeButton("dcl-btn dcl-btn-danger", "Удалить", function () { removeListById(list.id); }));
 wrap.appendChild(main);
 wrap.appendChild(actions);
 return wrap;
 }
 function makeEntryCard(entry) {
 const wrap = node("div", "dcl-entry");
 const main = node("div", "dcl-entry-main");
 const actions = node("div", "dcl-entry-actions");
 wrap.setAttribute("data-search", norm(entry.term + " " + entry.translations.join(" ")));
 main.appendChild(node("div", "dcl-entry-term", entry.term));
 main.appendChild(node("div", "dcl-entry-translations", entry.translations.join(", ")));
 actions.appendChild(makeButton("dcl-btn dcl-btn-muted", "Редактировать", function () { editEntry(entry.id); }));
 actions.appendChild(makeButton("dcl-btn dcl-btn-danger", "Удалить", function () { deleteEntry(entry.id); }));
 wrap.appendChild(main);
 wrap.appendChild(actions);
 return wrap;
 }
 function renderSelectedArea(main, selected) {
 let card;
 let head;
 let form;
 let row;
 let input;
 let textarea;
 let listWrap;
 let searchWrap;
 let clearButton;
 let emptyState;
 let searchInput;
 const mode = state.editingEntryId ? "manual" : state.entryMode;
 if (!selected) {
 card = makeCard();
 card.appendChild(node("div", "dcl-empty", "Список не найден. Вернись назад и выбери другой."));
 row = node("div", "dcl-row");
 row.appendChild(makeButton("dcl-btn dcl-btn-muted", "На главную", closePanel));
 card.appendChild(row);
 main.appendChild(card);
 return;
 }
 card = makeCard();
 row = node("div", "dcl-row");
 row.appendChild(makeButton("dcl-btn dcl-btn-muted", "На главную", closePanel));
 card.appendChild(row);
 main.appendChild(card);
 card = makeCard();
 head = makeSectionHead("Выбранный список", getListEmoji(selected) + " " + selected.name, selected.entries.length + " слов" + (isBuiltinList(selected) ? " • встроенный список" : ""));
 head.appendChild(makeButton("dcl-btn dcl-btn-danger", "Удалить список", deleteSelectedList));
 card.appendChild(head);
 form = node("form", "dcl-stack");
 form.addEventListener("submit", function (event) { event.preventDefault(); renameSelectedList(); });
 row = node("div", "dcl-row");
 input = makeInput("dcl-rename-name", state.renameName, "Название списка");
 input.addEventListener("input", function (event) { state.renameName = event.target.value; });
 row.appendChild(makeField("Название списка", input));
 input = makeInput("dcl-rename-emoji", state.renameEmoji, "Введи emoji или выбери ниже");
 input.maxLength = 32;
 input.setAttribute("inputmode", "text");
 input.setAttribute("autocomplete", "off");
 input.setAttribute("autocapitalize", "off");
 input.setAttribute("enterkeyhint", "done");
 input.spellcheck = false;
 input.addEventListener("input", function (event) { state.renameEmoji = event.target.value; });
 row.appendChild(makeField("Emoji", input));
 form.appendChild(row);
 row = node("div", "dcl-row");
 row.appendChild(makeButton("dcl-btn dcl-btn-muted", "Убрать emoji", function () {
 state.renameEmoji = "";
 render();
 window.setTimeout(function () {
 const emojiInput = document.getElementById("dcl-rename-emoji");
 if (emojiInput) { emojiInput.focus(); }
 }, 0);
 }));
 form.appendChild(row);
 form.appendChild(node("div", "dcl-help", "Можно ввести свой emoji с клавиатуры телефона или выбрать ниже."));
 form.appendChild(makeEmojiPicker());
 row = node("div", "dcl-row");
 row.appendChild(makeButton("dcl-btn", "Сохранить", null, "submit"));
 form.appendChild(row);
 card.appendChild(form);
 main.appendChild(card);
 card = makeCard();
 row = node("div", "dcl-row");
 row.appendChild(makeButton(mode === "manual" ? "dcl-btn" : "dcl-btn dcl-btn-muted", "Вручную", function () { state.entryMode = "manual"; state.editingEntryId = ""; state.term = ""; state.translations = ""; state.bulk = ""; state.notice = ""; render(); }));
 row.appendChild(makeButton(mode === "bulk" ? "dcl-btn" : "dcl-btn dcl-btn-muted", "Вставка списком", function () { state.entryMode = "bulk"; state.editingEntryId = ""; state.term = ""; state.translations = ""; state.notice = ""; render(); }));
 card.appendChild(row);
 main.appendChild(card);
 if (mode === "manual") {
 card = makeCard();
 card.id = "dcl-entry-editor-card";
 head = makeSectionHead("", state.editingEntryId ? "Редактирование слова" : "Слово и переводы", "Несколько переводов разделяй запятыми.");
 if (state.editingEntryId) { head.appendChild(makeButton("dcl-btn dcl-btn-muted", "Отмена", clearEntryEditor)); }
 card.appendChild(head);
 form = node("form", "dcl-stack");
 form.addEventListener("submit", function (event) { event.preventDefault(); saveEntry(); });
 row = node("div", "dcl-row");
 input = makeInput("dcl-entry-term", state.term, "apple");
 input.addEventListener("input", function (event) { state.term = event.target.value; });
 row.appendChild(makeField("Слово", input));
 input = makeInput("dcl-entry-translations", state.translations, "яблоко, яблочко");
 input.addEventListener("input", function (event) { state.translations = event.target.value; });
 row.appendChild(makeField("Переводы", input));
 form.appendChild(row);
 row = node("div", "dcl-row");
 row.appendChild(makeButton("dcl-btn", state.editingEntryId ? "Сохранить слово" : "Добавить слово", null, "submit"));
 form.appendChild(row);
 card.appendChild(form);
 main.appendChild(card);
 }
 if (mode === "bulk") {
 card = makeCard();
 card.appendChild(makeSectionHead("", "Вставка списком", "Вставь строки в формате слово - перевод, перевод."));
 form = node("form", "dcl-stack");
 form.addEventListener("submit", function (event) { event.preventDefault(); importBulk(); });
 textarea = node("textarea", "dcl-textarea");
 textarea.id = "dcl-bulk-text";
 textarea.rows = 7;
 textarea.value = state.bulk;
 textarea.placeholder = ["apple - яблоко", "orange - апельсин", "juice - сок, электричество"].join("\n");
 textarea.addEventListener("input", function (event) { state.bulk = event.target.value; });
 form.appendChild(textarea);
 row = node("div", "dcl-row");
 row.appendChild(makeButton("dcl-btn", "Импортировать список", null, "submit"));
 form.appendChild(row);
 card.appendChild(form);
 main.appendChild(card);
 }
 card = makeCard();
 card.appendChild(makeSectionHead("Слова в списке", String(selected.entries.length), ""));
 if (!selected.entries.length) {
 card.appendChild(node("div", "dcl-empty", "В этом списке пока нет слов."));
 main.appendChild(card);
 return;
 }
 searchWrap = node("div", "dcl-search");
 searchInput = makeInput("dcl-entry-search", state.entrySearch, "Найти слово или перевод");
 searchInput.addEventListener("input", function () {
 state.entrySearch = searchInput.value;
 updateEntryListFilter(listWrap, emptyState, clearButton);
 });
 searchWrap.appendChild(searchInput);
 clearButton = makeButton("dcl-search-clear", "×", function () {
 state.entrySearch = "";
 searchInput.value = "";
 updateEntryListFilter(listWrap, emptyState, clearButton);
 searchInput.focus();
 });
 searchWrap.appendChild(clearButton);
 card.appendChild(makeField("Поиск", searchWrap));
 listWrap = node("div", "dcl-entry-list");
 selected.entries.forEach(function (entry) { listWrap.appendChild(makeEntryCard(entry)); });
 emptyState = node("div", "dcl-empty", "Ничего не найдено.");
 emptyState.hidden = true;
 card.appendChild(listWrap);
 card.appendChild(emptyState);
 updateEntryListFilter(listWrap, emptyState, clearButton);
 main.appendChild(card);
 }
 function render() {
 const selected = getSelectedList();
 const overview = node("div", "dcl-main");
 let card;
 let row;
 let listWrap;
 let searchWrap;
 let clearButton;
 let emptyState;
 let searchInput;
 clear(body);
 if (state.notice) { body.appendChild(node("div", "dcl-banner", state.notice)); }
 if (state.editorListId) {
 renderSelectedArea(overview, selected);
 body.appendChild(overview);
 return;
 }
 card = makeCard();
 card.appendChild(node("div", "dcl-label", "Мои списки"));
 row = node("div", "dcl-row");
 row.appendChild(makeButton("dcl-btn", "Создать список", createList));
 if (state.deletedBuiltins.length) { row.appendChild(makeButton("dcl-btn dcl-btn-muted", "Вернуть встроенные", restoreBuiltins)); }
 card.appendChild(row);
 overview.appendChild(card);
 card = makeCard();
 card.appendChild(makeSectionHead("Выбор списка", state.lists.length ? String(state.lists.length) : "0", ""));
 listWrap = node("div", "dcl-entry-list");
 if (!state.lists.length) {
 listWrap.appendChild(node("div", "dcl-empty", "Пока нет списков. Нажми сверху Создать список."));
 } else {
 state.lists.forEach(function (list) { listWrap.appendChild(makeListRow(list)); });
 }
 card.appendChild(listWrap);
 overview.appendChild(card);
 body.appendChild(overview);
 }
 function createTrigger(className) {
 const button = makeButton(className, "Создать список", openCreatePanel);
 return button;
 }
 function findHistoryButton() {
 const buttons = Array.from(document.querySelectorAll("button"));
 const found = buttons.find(function (button) { return norm((button.textContent ? button.textContent : "").replace(/\s+/g, " ")) === "история ответов"; });
 return found ? found : null;
 }
 function ensureTriggerPlacement() {
 const historyButton = findHistoryButton();
 if (historyButton) {
 if (historyButton.parentElement) {
 if (inlineWrap.parentElement !== historyButton.parentElement) { historyButton.insertAdjacentElement("afterend", inlineWrap); }
 floatingTrigger.hidden = true;
 ensureHomeScreenScroll(historyButton);
 renderHomeCards(historyButton);
 return;
 }
 }
 floatingTrigger.hidden = true;
 if (floatingTrigger.parentElement) { floatingTrigger.remove(); }
 if (inlineWrap.parentElement) { inlineWrap.remove(); }
 clearHomeScrollStyles();
 removeHomeCardsHost();
 }
 function clearHomeScrollStyles() {
 homeScrollNodes.forEach(function (item) {
 if (!item) { return; }
 if (!item.node) { return; }
 item.node.classList.remove(item.className);
 });
 homeScrollNodes = [];
 }
 function markHomeScrollNode(node, className) {
 if (!node) { return; }
 if (homeScrollNodes.some(function (item) {
 if (!item) { return false; }
 if (item.node !== node) { return false; }
 return item.className === className;
 })) { return; }
 node.classList.add(className);
 homeScrollNodes.push({ node: node, className: className });
 }
 function ensureHomeScreenScroll(historyButton) {
 let current = historyButton ? historyButton.parentElement : null;
 clearHomeScrollStyles();
 for (; current; current = current.parentElement) {
 const className = typeof current.className === "string" ? current.className : "";
 if (current === document.body) { break; }
 if (current === document.documentElement) { break; }
 if (className.indexOf("flex-1") !== -1) { markHomeScrollNode(current, "dcl-home-scroll"); }
 if (className.indexOf("min-h-0") !== -1) { markHomeScrollNode(current, "dcl-home-scroll"); }
 if (className.indexOf("overflow-y-auto") !== -1) { markHomeScrollNode(current, "dcl-home-scroll"); }
 if (className.indexOf("max-w-md") !== -1) { markHomeScrollNode(current, "dcl-home-scroll-frame"); }
 if (className.indexOf("max-w-lg") !== -1) { markHomeScrollNode(current, "dcl-home-scroll-frame"); }
 if (className.indexOf("h-[calc(100dvh") !== -1) { markHomeScrollNode(current, "dcl-home-scroll-frame"); }
 if (className.indexOf("max-h-[calc(100dvh") !== -1) { markHomeScrollNode(current, "dcl-home-scroll-frame"); }
 if (className.indexOf("min-h-[100dvh]") !== -1) { markHomeScrollNode(current, "dcl-home-scroll-root"); }
 if (className.indexOf("justify-center") !== -1) { markHomeScrollNode(current, "dcl-home-scroll-root"); }
 if (className.indexOf("overflow-hidden") !== -1) { markHomeScrollNode(current, "dcl-home-scroll-root"); }
 }
 }
 function getListById(listId) {
 const found = state.lists.find(function (list) { return list.id === listId; });
 return found ? found : null;
 }
 function getHomeCustomLists() {
 return state.lists.filter(function (list) { return !isBuiltinList(list); }).slice().sort(function (left, right) {
 const createdDelta = getListCreatedAt(right) - getListCreatedAt(left);
 if (createdDelta) { return createdDelta; }
 return left.name.localeCompare(right.name, "ru", { sensitivity: "base" });
 });
 }
 function getStartListTarget(target) { 
 if (!target) { return null; } 
 if (target.closest) { return target.closest("[data-dcl-start-list]"); } 
 if (target.parentElement) { 
  if (target.parentElement.closest) { return target.parentElement.closest("[data-dcl-start-list]"); } 
 } 
 return null; 
} 
function isInsideCustomOverlay(element) { 
 if (!element) { return false; } 
 if (!element.closest) { return false; } 
 return Boolean(element.closest(".dcl-overlay")); 
} 
function getEventElement(target) {
 if (!target) { return null; }
 if (target.nodeType === 1) { return target; }
 if (target.parentElement) { return target.parentElement; }
 return null;
}
function buildHistoryReplayEntries(session, mistakesOnly) {
 const sessionSettings = session ? session.settings : null;
 const settings = sessionSettings && typeof sessionSettings === "object" ? sessionSettings : {};
 return safeArray(session ? session.results : []).filter(function (result) {
  if (!result) { return false; }
  if (!result.item) { return false; }
  if (!mistakesOnly) { return true; }
  return result.isCorrect === false;
 }).map(function (result) {
  const item = result.item;
  const answer = text(item.answer);
  const primaryAnswer = text(item.primaryAnswer);
  let term = text(item.term);
  let translations = safeArray(item.translations).map(function (value) { return text(value); }).filter(Boolean);
  if (settings.direction === "ru_en") {
   if (!term) { term = primaryAnswer ? primaryAnswer : answer; }
   if (!translations.length) {
    if (text(item.question)) { translations = [text(item.question)]; }
   }
  } else {
   if (!term) { term = text(item.question); }
   if (!translations.length) {
    translations = uniqueValues(safeArray(item.acceptedAnswers).map(function (value) { return text(value); }).filter(Boolean).concat(splitTranslations(answer)).concat(primaryAnswer ? [primaryAnswer] : []));
   }
  }
  if (!term) { return null; }
  if (!translations.length) { return null; }
  return sanitizeEntry({ id: text(item.entryId) ? text(item.entryId) : makeId(), term: term, translations: translations });
 }).filter(Boolean);
}
function getHistoryReplayConfig(session) {
 const sessionSettings = session ? session.settings : null;
 const settings = sessionSettings && typeof sessionSettings === "object" ? sessionSettings : {};
 const listId = text(settings.listId);
 if (listId) {
  if (state.lists.some(function (list) { return list.id === listId; })) { return { settings: settings, listId: listId }; }
 }
 if (text(settings.topic) === "irregular_verbs") { return { settings: settings, listId: BUILTIN_SOURCES.irregular }; }
 if (text(settings.topic) === "food") { return { settings: settings, listId: BUILTIN_SOURCES.food }; }
 return { settings: settings, listId: "" };
}
function getHistoryCard(button) {
 let current = getEventElement(button);
 while (current) {
  const buttons = current.querySelectorAll ? Array.from(current.querySelectorAll("button")) : [];
  const hasRepeat = buttons.some(function (item) { return getBuiltinActionLabel(item) === "Повторить"; });
  const hasDelete = buttons.some(function (item) { return getBuiltinActionLabel(item) === "Удалить"; });
  if (hasRepeat) { if (hasDelete) { return current; } }
  current = current.parentElement;
 }
 return null;
}
function getHistorySessionFromButton(button) {
 const attributedId = text(button ? (button.getAttribute("data-dcl-history-repeat") ? button.getAttribute("data-dcl-history-repeat") : button.getAttribute("data-dcl-history-mistakes")) : "");
 const attributedSession = attributedId ? readHistorySessions().find(function (item) { return text(item.id) === attributedId; }) : null;
 if (attributedSession) { return attributedSession; }
 const card = getHistoryCard(button);
 const repeatButtons = Array.from(document.querySelectorAll("button")).filter(function (item) {
  if (getBuiltinActionLabel(item) !== "Повторить") { return false; }
  return getHistoryCard(item) ? true : false;
 });
 const cardButton = card ? repeatButtons.find(function (item) { return getHistoryCard(item) === card; }) : null;
 const index = cardButton ? repeatButtons.indexOf(cardButton) : -1;
 const sessions = readHistorySessions();
 if (index === -1) { return null; }
 return sessions[index] ? sessions[index] : null;
}
function normalizeHistoryReplayButtons() {
 Array.from(document.querySelectorAll("[data-dcl-history-repeat],[data-dcl-history-mistakes],[data-dcl-history-delete]")).forEach(function (button) {
  if (!button) { return; }
  button.removeAttribute("data-dcl-history-repeat");
  button.removeAttribute("data-dcl-history-mistakes");
  button.removeAttribute("data-dcl-history-delete");
 });
 const sessions = readHistorySessions();
 const repeatButtons = Array.from(document.querySelectorAll("button")).filter(function (button) {
  if (!button) { return false; }
  if (isInsideCustomOverlay(button)) { return false; }
  return getBuiltinActionLabel(button) === "Повторить";
 });
 repeatButtons.forEach(function (repeatButton, index) {
  const session = sessions[index];
  const sessionId = text(session ? session.id : "");
  const group = repeatButton.parentElement;
  if (!sessionId) { return; }
  repeatButton.setAttribute("data-dcl-history-repeat", sessionId);
  if (!group) { return; }
  Array.from(group.querySelectorAll("button")).forEach(function (button) {
   const label = getBuiltinActionLabel(button);
   if (label === "Пройти только ошибки") { button.setAttribute("data-dcl-history-mistakes", sessionId); }
   if (label === "Удалить") { button.setAttribute("data-dcl-history-delete", sessionId); }
  });
 });
}
function startHistoryReplay(sessionId, mistakesOnly) {
 const session = readHistorySessions().find(function (item) { return text(item.id) === text(sessionId); });
 const replay = session ? getHistoryReplayConfig(session) : { settings: {}, listId: "" };
 const entries = buildHistoryReplayEntries(session, mistakesOnly);
 const list = replay.listId ? getListById(replay.listId) : null;
 const count = mistakesOnly ? entries.length : clampQuizCount(entries.length, Number(replay.settings.wordCount));
 if (!session) { window.alert("Could not open this history test."); return; }
 if (!list) { window.alert("Could not resolve the source list."); return; }
 if (!entries.length) { window.alert("There are no words to repeat in this attempt."); return; }
 if (!showQuizOverlay()) { window.alert("Could not open the quiz window. Reload the page."); return; }
 document.documentElement.classList.add("dcl-locked");
 document.body.classList.add("dcl-locked");
 quizState.open = true;
 quizState.step = "test";
 quizState.listId = replay.listId;
 quizState.pool = entries.slice();
 quizState.basePool = entries.slice();
 quizState.direction = replay.settings.direction === "ru_en" ? "ru_en" : "en_ru";
 quizState.count = count;
 quizState.baseCount = count;
 quizState.shuffle = Boolean(replay.settings.shuffle);
 quizState.index = 0;
 quizState.input = "";
 quizState.checked = false;
 quizState.results = [];
 quizState.inputs = [];
 quizState.finishedEarly = false;
 quizState.historySettings = {
  topic: text(replay.settings.topic) ? text(replay.settings.topic) : list.name,
  topicType: text(replay.settings.topicType) ? text(replay.settings.topicType) : "history_replay",
  listId: replay.listId,
  listName: text(replay.settings.listName) ? text(replay.settings.listName) : list.name
 };
 beginQuizTest();
 window.setTimeout(showQuizOverlay, 0);
}
function getBuiltinActionLabel(button) { 
 return text(button ? button.textContent : ""); 
} 
function getBuiltinActionTitle(button) { 
 return text(button ? button.title : ""); 
} 
function isBuiltinPrimaryButton(button) { 
 const label = getBuiltinActionLabel(button); 
 if (label === "\u041f\u0440\u043e\u0432\u0435\u0440\u0438\u0442\u044c") { return true; } 
 return label === "\u0414\u0430\u043b\u0435\u0435"; 
} 
function isBuiltinSecondaryButton(button) { 
 const title = getBuiltinActionTitle(button); 
 if (title === "\u041d\u0430\u0437\u0430\u0434") { return true; } 
 return title === "\u041f\u0440\u043e\u043f\u0443\u0441\u0442\u0438\u0442\u044c"; 
} 
function isBuiltinActionButton(button) { 
 if (isBuiltinPrimaryButton(button)) { return true; } 
 return isBuiltinSecondaryButton(button); 
} 
function normalizeBuiltinFeedback() { 
 Array.from(document.querySelectorAll("div")).forEach(function (item) { 
  let content; 
  let answer; 
  let host; 
  let message; 
  let reveal; 
  if (!item) { return; } 
  if (isInsideCustomOverlay(item)) { return; } 
  if (item.getAttribute("data-dcl-builtin-feedback-source") === "1") { return; } 
  if (String(item.className ? item.className : "").indexOf("glass-panel") === -1) { return; } 
  content = text(item.textContent); 
  if (content.indexOf("\u041f\u0440\u0430\u0432\u0438\u043b\u044c\u043d\u043e:") !== 0) { return; } 
  answer = text(content.replace("\u041f\u0440\u0430\u0432\u0438\u043b\u044c\u043d\u043e:", "")); 
  if (!answer) { return; } 
  host = item.parentElement; 
  if (!host) { return; } 
  item.style.display = "none"; 
  item.setAttribute("data-dcl-builtin-feedback-source", "1"); 
  if (host.querySelector(".dcl-builtin-feedback")) { return; } 
  message = node("div", "dcl-quiz-feedback dcl-quiz-feedback-bad dcl-builtin-feedback"); 
  message.appendChild(node("div", "dcl-quiz-feedback-title", "\u041d\u0435\u043f\u0440\u0430\u0432\u0438\u043b\u044c\u043d\u043e")); 
  message.appendChild(node("div", "dcl-quiz-feedback-hint", "\u041d\u0430\u0436\u043c\u0438, \u0447\u0442\u043e\u0431\u044b \u043f\u043e\u043a\u0430\u0437\u0430\u0442\u044c \u043f\u0440\u0430\u0432\u0438\u043b\u044c\u043d\u044b\u0439 \u043e\u0442\u0432\u0435\u0442")); 
  reveal = node("button", "dcl-reveal-answer dcl-reveal-answer-blurred", "\u041f\u0440\u0430\u0432\u0438\u043b\u044c\u043d\u044b\u0439 \u043e\u0442\u0432\u0435\u0442: " + answer); 
  reveal.type = "button"; 
  reveal.addEventListener("click", function () { 
   reveal.classList.toggle("dcl-reveal-answer-blurred"); 
   reveal.classList.toggle("dcl-reveal-answer-open"); 
  }); 
  message.appendChild(reveal); 
  host.appendChild(message); 
 }); 
} 
function normalizeBuiltinActionRows() { 
 Array.from(document.querySelectorAll("div")).forEach(function (row) { 
 let buttons; 
 let hasPrimary; 
 let hasAction; 
 let form;
 let stack;
 let stageCard;
 let stageInner;
 let input;
 if (!row) { return; } 
 if (isInsideCustomOverlay(row)) { return; } 
 buttons = Array.from(row.children).filter(function (child) { 
 if (!child) { return false; } 
 return child.tagName === "BUTTON"; 
 }); 
 if (!buttons.length) { return; } 
 hasPrimary = buttons.some(function (button) { return isBuiltinPrimaryButton(button); }); 
 if (!hasPrimary) { return; } 
 hasAction = buttons.some(function (button) { return isBuiltinActionButton(button); }); 
 if (!hasAction) { return; } 
 form = row.closest ? row.closest("form") : null;
 stack = row.parentElement;
 stageCard = form ? (form.closest ? form.closest(".glass-panel") : null) : null;
 stageInner = stageCard ? stageCard.firstElementChild : null;
 input = form ? (form.querySelector ? form.querySelector("input[type='text'], input:not([type]), textarea") : null) : null;
 if (stageCard) {
 stageCard.classList.add("dcl-builtin-stage-card");
 }
 if (stageInner) {
 if (stageInner.tagName === "DIV") {
 stageInner.classList.add("dcl-builtin-stage-inner");
 }
 }
 if (form) {
 form.classList.add("dcl-builtin-stage-form");
 }
 if (stack) {
 if (stack.tagName === "DIV") {
 stack.classList.add("dcl-builtin-form-stack");
 }
 }
 if (input) {
 const placeholder = text(input.getAttribute("placeholder"));
 input.classList.add("dcl-builtin-input");
 if (!placeholder) {
 input.setAttribute("placeholder", "Напиши перевод");
 } else if (placeholder === "Введите перевод здесь...") {
 input.setAttribute("placeholder", "Напиши перевод");
 }
 if (input.disabled) {
 input.classList.add("dcl-builtin-input-locked");
 } else {
 input.classList.remove("dcl-builtin-input-locked");
 }
 }
 row.classList.add("dcl-builtin-actions"); 
 buttons.forEach(function (button) { 
 button.classList.remove("dcl-builtin-action-primary"); 
 button.classList.remove("dcl-builtin-action-secondary"); 
 if (isBuiltinPrimaryButton(button)) { 
 button.classList.add("dcl-builtin-action-primary"); 
 return; 
 } 
 if (isBuiltinSecondaryButton(button)) { 
 button.type = "button";
 button.classList.add("dcl-builtin-action-secondary"); 
 } 
 }); 
 }); 
} 
function normalizeBuiltinStagePanels() { 
 Array.from(document.querySelectorAll(".glass-panel")).forEach(function (stageCard) { 
  let input;
  let current;
  let progressMain;
  let progressRoot;
  let match;
  let jumpList;
  let index;
  let total;
  let jumpItem;
  if (!stageCard) { return; }
  if (isInsideCustomOverlay(stageCard)) { return; }
  input = stageCard.querySelector("input[type=\"text\"], input:not([type]), textarea");
  if (!input) { return; }
  stageCard.classList.add("dcl-builtin-stage-card");
  if (input.parentElement) { input.parentElement.classList.add("dcl-builtin-input-wrap"); }
  current = input.parentElement;
  while (current) {
   if (current === stageCard) { break; }
   current.classList.add("dcl-builtin-fill");
   if (current.tagName === "FORM") { current.classList.add("dcl-builtin-stage-form"); }
   current = current.parentElement;
  }
  input.classList.add("dcl-builtin-input");
  if (!text(input.getAttribute("placeholder"))) { input.setAttribute("placeholder", "\u041d\u0430\u043f\u0438\u0448\u0438 \u043f\u0435\u0440\u0435\u0432\u043e\u0434"); }
  if (text(input.getAttribute("placeholder")) === "?\u041d\u0430\u043f\u0438\u0448\u0438 \u043f\u0435\u0440\u0435\u0432\u043e\u0434 ?????...") { input.setAttribute("placeholder", "\u041d\u0430\u043f\u0438\u0448\u0438 \u043f\u0435\u0440\u0435\u0432\u043e\u0434"); }
  if (input.disabled) { input.classList.add("dcl-builtin-input-locked"); } else { input.classList.remove("dcl-builtin-input-locked"); }
  progressMain = null;
  progressRoot = null;
  current = stageCard.parentElement;
  while (current) {
   if (current === document.body) { break; }
   Array.from(current.querySelectorAll("div")).some(function (item) {
    const value = text(item ? item.textContent : "");
    if (/\d+\s*\/\s*\d+$/.test(value) === false) { return false; }
    progressMain = item;
    progressRoot = item.parentElement;
    return true;
   });
   if (progressMain) { break; }
   current = current.parentElement;
  }
  if (!progressMain) { return; }
  if (!progressRoot) { return; }
  if (!progressRoot.parentElement) { return; }
  match = text(progressMain.textContent).match(/(\d+)\s*\/\s*(\d+)$/);
  if (!match) { return; }
  index = Number(match[1]);
  total = Number(match[2]);
  if (!Number.isFinite(index)) { return; }
  if (!Number.isFinite(total)) { return; }
  if (total === 1) { return; }
  jumpList = progressRoot.parentElement.querySelector(".dcl-builtin-jump-list");
  if (!jumpList) {
   jumpList = node("div", "dcl-quiz-jump-list dcl-builtin-jump-list");
   progressRoot.insertAdjacentElement("afterend", jumpList);
  }
  clear(jumpList);
  for (let stepIndex = 1; stepIndex !== total + 1; stepIndex += 1) {
   jumpItem = node("div", stepIndex === index ? "dcl-quiz-jump-btn dcl-quiz-jump-btn-active dcl-builtin-jump-btn" : "dcl-quiz-jump-btn dcl-builtin-jump-btn", String(stepIndex));
   jumpList.appendChild(jumpItem);
  }
 }); 
} 
function normalizeBuiltinTestUi() { 
 normalizeHistoryReplayButtons();
 normalizeBuiltinStagePanels();
 normalizeBuiltinFeedback(); 
 normalizeBuiltinActionRows(); 
}  
function makeHomeCard(list) {  
 const wrap = node("div", "dcl-home-card"); 
 const icon = node("div", "dcl-home-icon", getListEmoji(list)); 
 const title = node("div", "dcl-home-title", list.name); 
 const canStart = Boolean(list.entries.length); 
 const startButton = makeButton(canStart ? "dcl-btn dcl-home-start" : "dcl-btn dcl-btn-muted dcl-home-start", "Начать тест", null); 
 const actions = node("div", "dcl-home-actions"); 
 actions.style.position = "relative"; 
 actions.style.zIndex = "2147483646"; 
 actions.style.pointerEvents = "auto"; 
 const stopManageEvent = function (event) { if (!event) { return; } event.preventDefault(); event.stopPropagation(); if (event.stopImmediatePropagation) { event.stopImmediatePropagation(); } }; 
 const editButton = makeButton("dcl-btn dcl-btn-muted", "Редактировать", function (event) { stopManageEvent(event); openHomeEditor(list.id); }); 
 const deleteButton = makeButton("dcl-btn dcl-btn-danger", "Удалить", function (event) { stopManageEvent(event); removeListById(list.id); }); 
 let startLock = false; 
 const startFromButton = function (event) { 
  if (event) { 
   if (event.target) { 
    if (event.target.closest) { 
     if (event.target.closest("[data-dcl-home-manage]")) { return; } 
    } 
   } 
   event.preventDefault(); 
   event.stopPropagation(); 
  } 
  if (!canStart) { return; } 
  if (startLock) { return; } 
  startLock = true; 
  window.setTimeout(function () { startLock = false; }, 220); 
  startListQuiz(list.id); 
 };
 wrap.style.position = "relative"; 
 wrap.style.zIndex = "2147483645"; 
 wrap.style.pointerEvents = "auto"; 
 wrap.style.isolation = "isolate"; 
 wrap.style.cursor = "default"; 
 startButton.style.position = "relative"; 
 startButton.style.zIndex = "2147483646"; 
 startButton.style.pointerEvents = "auto"; 
 startButton.style.touchAction = "manipulation"; 
 editButton.setAttribute("data-dcl-home-manage", "edit"); 
  editButton.setAttribute("data-dcl-home-edit", list.id); 
 editButton.style.position = "relative"; 
 editButton.style.zIndex = "2147483646"; 
 editButton.style.pointerEvents = "auto"; 
 editButton.onclick = function (event) { stopManageEvent(event); openHomeEditor(list.id); }; editButton.onmousedown = function (event) { if (event.button !== 0) { return; } stopManageEvent(event); openHomeEditor(list.id); }; 
 deleteButton.setAttribute("data-dcl-home-manage", "delete"); 
  deleteButton.setAttribute("data-dcl-home-delete", list.id); 
 deleteButton.style.position = "relative"; 
 deleteButton.style.zIndex = "2147483646"; 
 deleteButton.style.pointerEvents = "auto"; 
 deleteButton.onclick = function (event) { stopManageEvent(event); removeListById(list.id); }; deleteButton.onmousedown = function (event) { if (event.button !== 0) { return; } stopManageEvent(event); removeListById(list.id); };  
 if (canStart) { 
    startButton.setAttribute("data-dcl-start-list", list.id); 
      startButton.addEventListener("click", startFromButton); 
    startButton.addEventListener("keydown", function (event) { if (["Enter", " "].indexOf(event.key) !== -1) { startFromButton(event); } }); 
  startButton.onclick = startFromButton; startButton.onmousedown = function (event) { if (event.button !== 0) { return; } startFromButton(event); }; 
 } 
 if (!canStart) { startButton.disabled = true; } 
 actions.appendChild(editButton); 
 actions.appendChild(deleteButton); 
 wrap.appendChild(icon); 
 wrap.appendChild(title); 
 wrap.appendChild(startButton); 
 wrap.appendChild(actions); 
 return wrap; 
}  
function removeHomeCardsHost() {
 if (!homeCardsHost) { return; }
 if (homeCardsHost.parentElement) { homeCardsHost.remove(); }
}
function renderHomeCards(historyButton) {
 const customLists = getHomeCustomLists();
 if (!historyButton) {
  removeHomeCardsHost();
  return;
 }
 if (!historyButton.parentElement) {
  removeHomeCardsHost();
  return;
 }
 if (!customLists.length) {
  removeHomeCardsHost();
  return;
 }
 if (!homeCardsHost) {
  homeCardsHost = node("div", "dcl-home-lists");
  homeCardsHost.style.position = "relative";
  homeCardsHost.style.zIndex = "2147483646";
  homeCardsHost.style.pointerEvents = "auto";
  homeCardsHost.style.isolation = "isolate";
  homeCardsHost.addEventListener("click", handleHomeCardClick, true);
  homeCardsHost.addEventListener("mousedown", handleHomeCardClick, true);
 }
 clear(homeCardsHost);
 customLists.forEach(function (list) { homeCardsHost.appendChild(makeHomeCard(list)); });
 if (inlineWrap.parentElement === historyButton.parentElement) {
  inlineWrap.insertAdjacentElement("afterend", homeCardsHost);
  return;
 }
 historyButton.insertAdjacentElement("afterend", homeCardsHost);
}
 
function closeQuiz() {  
 quizState.open = false;  
 quizState.step = "setup";  
 quizState.listId = "";  
 quizState.pool = [];  
 quizState.basePool = [];  
 quizState.entries = [];  
 quizState.direction = "en_ru";  
 quizState.count = 10;  
 quizState.baseCount = 10;  
 quizState.shuffle = false;  
 quizState.index = 0;  
 quizState.input = "";  
 quizState.checked = false;  
 quizState.results = [];  
 quizState.inputs = [];  
 quizState.finishedEarly = false;  
 quizState.historySettings = null;  
  quizState.mobileResultsOpen = false;  
 if (!state.open) {  
  document.documentElement.classList.remove("dcl-locked");  
  document.body.classList.remove("dcl-locked");  
 }  
 if (quizOverlay) {  
  quizOverlay.hidden = true;
  quizOverlay.style.display = "none";  
  quizOverlay.style.visibility = "hidden";  
  quizOverlay.style.pointerEvents = "none";  
 }  
 if (quizBody) { clear(quizBody); }  
}
function showQuizOverlay() {  
 if (!quizOverlay) { return false; }  
 if (!quizBody) { return false; }  
 if (!quizOverlay.parentElement) { document.body.appendChild(quizOverlay); }  
 quizOverlay.hidden = false;  
 quizOverlay.removeAttribute("hidden");  
 quizOverlay.style.display = "flex";  
 quizOverlay.style.visibility = "visible";  
 quizOverlay.style.pointerEvents = "auto";  
 quizOverlay.style.zIndex = "2147483647";  
 return true;  
}  
function clampQuizCount(total, value) {
 const safeTotal = Math.max(0, Number(total));
 if (!Number.isFinite(safeTotal)) { return 0; }
 let nextValue = Number(value);  
 if (!safeTotal) { return 0; }  
 if (!Number.isFinite(nextValue)) { nextValue = Math.min(10, safeTotal); }  
 nextValue = Math.round(nextValue);  
 nextValue = Math.max(1, nextValue);  
 return Math.min(safeTotal, nextValue);  
}  
function isQuizMobileViewport() {
 return Math.min(window.innerWidth,760)===window.innerWidth;
}
function getCurrentQuizEntry() {
 const entry = quizState.entries[quizState.index];
 return entry ? entry : null;
}
function getQuizStoredInput(index) {
 const result = quizState.results[index];
 const draft = quizState.inputs[index];
 if (result && text(result.userAnswer)) { return text(result.userAnswer); }
 return text(draft);
} 
function syncQuizIndex(index) {
 const total = quizState.entries.length;
 let nextIndex = Number(index);
 if (!total) {
 quizState.index = 0;
 quizState.input = "";
 quizState.checked = false;
 return 0;
 }
 if (!Number.isFinite(nextIndex)) { nextIndex = 0; }
 nextIndex = Math.max(0, Math.min(total - 1, Math.round(nextIndex)));
 quizState.index = nextIndex;
 quizState.input = getQuizStoredInput(nextIndex);
 quizState.checked = Boolean(quizState.results[nextIndex]);
 return nextIndex;
}
function findNextUnansweredQuizIndex(startIndex) {
 const indexes = quizState.entries.map(function (quizEntry, index) { return index; });
 const rotated = indexes.slice(startIndex).concat(indexes.slice(0, startIndex));
 const nextIndex = rotated.find(function (index) { return !quizState.results[index]; });
 return typeof nextIndex === "number" ? nextIndex : -1;
}
function getNextQuizIndex(startIndex) {
 const total = quizState.entries.length;
 if (!total) { return -1; }
 return startIndex + 1 === total ? 0 : startIndex + 1;
}

function openQuizResults(finishedEarly) {
 const completedResults = safeArray(quizState.results).filter(Boolean);
 quizState.finishedEarly = Boolean(finishedEarly);
  quizState.mobileResultsOpen = false;
 if (completedResults.length) { saveQuizHistory(); }
 quizState.step = "results";
 renderQuiz();
}
function goToQuizIndex(index) {
 if (!quizState.entries.length) { return; }
 syncQuizIndex(index);
 renderQuiz();
}
function prevQuizStep() {
 if (!quizState.entries.length) { return; }
 if (quizState.index === 0) { return; }
 goToQuizIndex(quizState.index - 1);
}
function skipQuizStep() {
 const nextIndex = getNextQuizIndex(quizState.index);
 if (nextIndex === -1) { return; }
 if (nextIndex === quizState.index) { return; }
 goToQuizIndex(nextIndex);
}
function confirmEndQuiz() {
 if (quizState.step !== "test") { closeQuiz(); return; }
 if (!window.confirm("Точно хочешь завершить тест заранее?")) { return; }
 openQuizResults(true);
}
function getQuizDirectionText() {  
 if (quizState.direction === "ru_en") { return "Русский → Английский"; }  
 return "Английский → Русский";  
}  
function getQuizPrompt(entry) {  
 if (!entry) { return ""; }  
 if (quizState.direction === "ru_en") { return text(entry.prompt ? entry.prompt : entry.translations[0]); }  
 return entry.term;  
}  
function getQuizAcceptedAnswers(entry) {  
 if (!entry) { return []; }  
 if (quizState.direction === "ru_en") { return [entry.term]; }  
 return entry.translations.slice();  
}  
function getQuizCorrectAnswer(entry) {  
 if (!entry) { return ""; }  
 if (quizState.direction === "ru_en") { return entry.term; }  
 return entry.translations.join(", ");  
}  
function getQuizAnswerPlaceholder() { 
 if (quizState.direction === "ru_en") { return "Напиши слово по-английски"; } 
 return "Напиши перевод"; 
} 
function getQuizHistoryTopic(list) { 
 const name = text(list ? list.name : ""); 
 return name ? name : "Мой список"; 
} 
function buildQuizHistoryItem(result) { 
 const acceptedAnswers = safeArray(result ? result.acceptedAnswers : []); 
 return { 
 question: text(result ? result.prompt : ""), 
 answer: text(result ? result.correctAnswer : ""), 
 primaryAnswer: acceptedAnswers[0] ? acceptedAnswers[0] : text(result ? result.correctAnswer : ""), 
 acceptedAnswers: acceptedAnswers.slice(), 
 entryId: text(result ? result.id : ""), 
 term: text(result ? result.term : ""), 
 translations: safeArray(result ? result.translations : []).slice() 
 }; 
} 
function saveQuizHistory() {  
 const list = getListById(quizState.listId);  
 const finishedAt = Date.now();  
 const completedResults = safeArray(quizState.results).filter(Boolean);  
 let settings = null;  
 if (!list) { return; }  
 if (!completedResults.length) { return; }  
 if (quizState.historySettings) {  
  settings = {  
   topic: text(quizState.historySettings.topic) ? text(quizState.historySettings.topic) : getQuizHistoryTopic(list),  
   topicType: text(quizState.historySettings.topicType) ? text(quizState.historySettings.topicType) : "history_replay",  
   listId: text(quizState.historySettings.listId),  
   listName: text(quizState.historySettings.listName) ? text(quizState.historySettings.listName) : list.name,  
   direction: quizState.direction,  
   wordCount: quizState.entries.length,  
   shuffle: quizState.shuffle  
  };  
 } else {  
  settings = {  
   topic: getQuizHistoryTopic(list),  
   topicType: "custom_list",  
   listId: list.id,  
   listName: list.name,  
   direction: quizState.direction,  
   wordCount: quizState.entries.length,  
   shuffle: quizState.shuffle  
  };  
 }  
 addHistorySession({  
  id: String(finishedAt) + "-" + Math.random().toString(16).slice(2),  
  finishedAt: finishedAt,  
  settings: settings,  
  results: completedResults.map(function (result) {  
   return { item: buildQuizHistoryItem(result), userAnswer: result.userAnswer, isCorrect: result.isCorrect };  
  })  
 });  
}
function buildQuizEntries(list) {
 const sourceEntries = getQuizPoolEntries(list);
 const count = clampQuizCount(sourceEntries.length, quizState.count);
 const orderedEntries = quizState.shuffle ? sourceEntries.slice().sort(function () { return Math.random() - 0.5; }) : sourceEntries.slice();
 return orderedEntries.slice(0, count).map(function (entry) {
 const translations = entry.translations.slice();
 let prompt = entry.term;
 if (quizState.direction === "ru_en") { prompt = translations[Math.floor(Math.random() * translations.length)]; }
 return { id: entry.id, term: entry.term, translations: translations, prompt: prompt };
 });
}
function isQuizAnswerCorrect(entry, value) {  
 const answer = norm(value);  
 if (!answer) { return false; }  
 return getQuizAcceptedAnswers(entry).some(function (candidate) { return norm(candidate) === answer; });  
}  
function getQuizPoolEntries(list) {
 const pool = safeArray(quizState.pool).filter(function (entry) {
 if (!entry) { return false; }
 if (!text(entry.term)) { return false; }
 return safeArray(entry.translations).length;
 });
 if (pool.length) {
 return pool.map(function (entry) {
 const entryId = text(entry.id);
 return { id: entryId ? entryId : makeId(), term: text(entry.term), translations: safeArray(entry.translations).map(function (item) { return text(item); }).filter(Boolean) };
 }).filter(function (entry) {
 if (!entry.term) { return false; }
 return entry.translations.length;
 });
 }
 return list ? list.entries.slice() : [];
}
function beginQuizTest() {  
 const list = getListById(quizState.listId);  
 const sourceEntries = getQuizPoolEntries(list);  
 if (!list) { closeQuiz(); return; }  
 if (!sourceEntries.length) { window.alert("This list has no words yet."); return; }
 quizState.pool = sourceEntries.slice();  
 quizState.basePool = sourceEntries.slice();  
 quizState.count = clampQuizCount(quizState.pool.length, quizState.count);  
 quizState.baseCount = quizState.count;  
 quizState.entries = buildQuizEntries(list);  
 quizState.step = "test";  
 quizState.index = 0;  
 quizState.input = "";  
 quizState.checked = false;  
 quizState.results = [];  
 quizState.inputs = quizState.entries.map(function () { return ""; });  
 quizState.finishedEarly = false;  
 syncQuizIndex(0);  
 renderQuiz();  
}
function startListQuiz(listId) {  
 let list = getListById(listId);  
 if (!list) {  
  loadStore();  
  list = getListById(listId);  
 }  
 if (!list) { window.alert("Could not open this list. Try again."); return; }
 if (!list.entries.length) { window.alert("This list has no words yet."); return; }
 if (!showQuizOverlay()) { window.alert("Could not open the quiz window. Reload the page."); return; }
 document.documentElement.classList.add("dcl-locked");  
 document.body.classList.add("dcl-locked");  
 quizState.open = true;  
 quizState.step = "setup";  
 quizState.listId = listId;  
 quizState.pool = list.entries.slice();  
 quizState.basePool = list.entries.slice();  
 quizState.entries = [];  
 quizState.direction = "en_ru";  
 quizState.count = clampQuizCount(quizState.pool.length, Math.min(10, quizState.pool.length));  
 quizState.baseCount = quizState.count;  
 quizState.shuffle = false;  
 quizState.index = 0;  
 quizState.input = "";  
 quizState.checked = false;  
 quizState.results = [];  
 quizState.inputs = [];  
 quizState.finishedEarly = false;  
 quizState.historySettings = null;  
  quizState.mobileResultsOpen = false;  
 renderQuiz();  
 window.setTimeout(showQuizOverlay, 0);  
}
function submitQuizAnswer() {
 const entry = getCurrentQuizEntry();
 const answer = text(quizState.input);
 let isCorrect;
 if (!entry) { return; }
 if (!answer) { return; }
 isCorrect = isQuizAnswerCorrect(entry, answer);
 quizState.input = answer;
 quizState.inputs[quizState.index] = answer;
 quizState.results[quizState.index] = { id: entry.id, term: entry.term, translations: entry.translations.slice(), prompt: getQuizPrompt(entry), acceptedAnswers: getQuizAcceptedAnswers(entry), correctAnswer: getQuizCorrectAnswer(entry), userAnswer: answer, isCorrect: isCorrect };
 quizState.checked = true;
 renderQuiz();
} 
function nextQuizStep() {
 const nextUnansweredIndex = findNextUnansweredQuizIndex(quizState.index + 1);
 if (!quizState.checked) { return; }
 if (nextUnansweredIndex === -1) {
 openQuizResults(false);
 return;
 }
 syncQuizIndex(nextUnansweredIndex);
 renderQuiz();
}  
function restartQuizFull() {  
 const list = getListById(quizState.listId);  
 const basePool = safeArray(quizState.basePool).filter(Boolean);  
 if (!list) { closeQuiz(); return; }  
 if (!basePool.length) { closeQuiz(); return; }  
 quizState.pool = basePool.slice();  
 quizState.count = clampQuizCount(quizState.pool.length, quizState.baseCount ? quizState.baseCount : quizState.count);  
 beginQuizTest();  
}
function restartQuizMistakes() {
 const mistakes = safeArray(quizState.results).filter(function (item) {
 return item ? !item.isCorrect : false;
 }).map(function (item) {
 return { id: item.id, term: item.term, translations: item.translations.slice() };
 });
 if (!mistakes.length) { return; }
 quizState.pool = mistakes;
 quizState.count = clampQuizCount(mistakes.length, mistakes.length);
 beginQuizTest();
}
function createQuizTopBar() {
 const top = node("div", "dcl-quiz-topbar");
 const closeButton = node("button", "dcl-quiz-icon-btn", "←");
 const progress = node("div", "dcl-quiz-progress");
 closeButton.type = "button";
 closeButton.addEventListener("click", closeQuiz);
 progress.appendChild(node("div", "dcl-quiz-progress-main", String(quizState.index + 1) + " / " + String(quizState.entries.length)));
 progress.appendChild(node("div", "dcl-quiz-progress-label", "Прогресс"));
 top.appendChild(closeButton);
 top.appendChild(progress);
 top.appendChild(makeButton("dcl-btn dcl-btn-muted dcl-quiz-finish-top", "Завершить", confirmEndQuiz));
 return top;
}
function createQuizJumpBar() {
 const wrap = node("div", "dcl-quiz-jump-list");
 const pageSize = 6;
 const pageStart = Math.floor(quizState.index / pageSize) * pageSize;
 const pageEnd = Math.min(pageStart + pageSize, quizState.entries.length);
 const prevButton = makeButton("dcl-quiz-jump-btn dcl-quiz-jump-arrow", "<", function () {
  const nextIndex = Math.max(0, pageStart - pageSize);
  goToQuizIndex(nextIndex);
 });
 const nextButton = makeButton("dcl-quiz-jump-btn dcl-quiz-jump-arrow", ">", function () {
  const nextIndex = Math.min(quizState.entries.length - 1, pageStart + pageSize);
  goToQuizIndex(nextIndex);
 });
 if (pageStart === 0) { prevButton.disabled = true; prevButton.className += " dcl-quiz-jump-btn-disabled"; }
 if (pageEnd === quizState.entries.length) { nextButton.disabled = true; nextButton.className += " dcl-quiz-jump-btn-disabled"; }
 wrap.appendChild(prevButton);
 quizState.entries.slice(pageStart, pageEnd).forEach(function (quizEntry, pageIndex) {
  const index = pageStart + pageIndex;
  const result = quizState.results[index];
  const hasDraft = Boolean(text(quizState.inputs[index]));
  let className = "dcl-quiz-jump-btn";
  let button;
  if (index === quizState.index) { className += " dcl-quiz-jump-btn-active"; }
  if (result && result.isCorrect === true) { className += " dcl-quiz-jump-btn-correct"; }
  else if (result && result.isCorrect === false) { className += " dcl-quiz-jump-btn-wrong"; } else if (hasDraft) { className += " dcl-quiz-jump-btn-draft"; }
  button = makeButton(className, String(index + 1), function () { goToQuizIndex(index); });
  button.setAttribute("aria-label", "Step " + String(index + 1));
  wrap.appendChild(button);
 });
 wrap.appendChild(nextButton);
 wrap.style.display = "grid";
 wrap.style.gridTemplateColumns = "repeat(" + String(pageEnd - pageStart + 2) + ", minmax(0, 1fr))";
 wrap.style.width = "100%";
 wrap.style.overflow = "hidden";
 return wrap;
}
function createQuizFeedback(entry) {
 let message;
 let reveal;
 if (!quizState.checked) { return null; }
 if (quizState.results[quizState.index].isCorrect) {
 return node("div", "dcl-quiz-feedback dcl-quiz-feedback-good", "Правильно");
 }
 message = node("div", "dcl-quiz-feedback dcl-quiz-feedback-bad");
 message.appendChild(node("div", "dcl-quiz-feedback-title", "Неправильно"));
 message.appendChild(node("div", "dcl-quiz-feedback-hint", "Нажми, чтобы показать правильный ответ"));
 reveal = node("button", "dcl-reveal-answer dcl-reveal-answer-blurred", "Правильный ответ: " + getQuizCorrectAnswer(entry));
 reveal.type = "button";
 reveal.addEventListener("click", function () {
 reveal.classList.toggle("dcl-reveal-answer-blurred");
 reveal.classList.toggle("dcl-reveal-answer-open");
 });
 message.appendChild(reveal);
 return message;
}
function createQuizResultRow(item) {
 const wrap = node("div", "dcl-results-item");
 const status = node("div", item.isCorrect ? "dcl-results-status dcl-results-status-good" : "dcl-results-status dcl-results-status-bad", item.isCorrect ? "✓" : "×");
 const main = node("div", "dcl-results-item-main");
 const head = node("div", "dcl-results-item-head");
 head.appendChild(node("div", "dcl-results-item-prompt", item.prompt));
 head.appendChild(node("div", "dcl-results-item-answer", item.correctAnswer));
 main.appendChild(head);
 if (!item.isCorrect) {
 main.appendChild(node("div", "dcl-results-item-user", item.userAnswer ? item.userAnswer : "Нет ответа"));
 }
 wrap.appendChild(status);
 wrap.appendChild(main);
 return wrap;
}
function setQuizChrome(step) {
 const head = quizOverlay ? quizOverlay.querySelector(".dcl-head") : null;
 if (head) { head.style.display = step === "setup" ? "flex" : "none"; }
 if (quizBody) { quizBody.className = step === "setup" ? "dcl-body" : "dcl-body dcl-quiz-body"; }
}
function renderQuiz() {
 const list = getListById(quizState.listId);
 const entry = getCurrentQuizEntry();
 let card;
 let head;
 let form;
 let input;
 let row;
 let message;
 let listWrap;
 let mistakes;
 let correctCount;
 let totalCount;
 let range;
 let rangeValue;
 let results;
 let score;
 let stats;
 let stat;
 let statValue;
 let screen;
 let topBar;
 let stageTop;
 let stageCopy;
 let button;
 if (!quizBody) { return; }
 clear(quizBody);
 if (!quizState.open) { return; }
 if (!list) { closeQuiz(); return; }
 setQuizChrome(quizState.step);
 quizBody.scrollTop = 0;
 if (quizState.step === "setup") {  
  totalCount = quizState.pool.length ? quizState.pool.length : list.entries.length;  
  quizState.count = clampQuizCount(totalCount, quizState.count);  
  card = makeCard();  
  head = makeSectionHead(getListEmoji(list) + " " + list.name, "Настройка теста", String(totalCount) + " слов");  
  card.appendChild(head);  
  card.appendChild(node("div", "dcl-label", "Направление перевода"));  
  row = node("div", "dcl-segmented");  
  row.appendChild(makeButton(quizState.direction === "en_ru" ? "dcl-btn" : "dcl-btn dcl-btn-muted", "Английский → Русский", function () { quizState.direction = "en_ru"; renderQuiz(); }));  
  row.appendChild(makeButton(quizState.direction === "ru_en" ? "dcl-btn" : "dcl-btn dcl-btn-muted", "Русский → Английский", function () { quizState.direction = "ru_en"; renderQuiz(); }));  
  card.appendChild(row);  
  card.appendChild(node("div", "dcl-label", "Количество слов"));   
  row = node("div", "dcl-range-wrap");   
  range = node("input", "dcl-range");   
  range.type = "range";  
  range.min = "1";   
  range.max = String(totalCount);   
  range.value = String(quizState.count);   
  rangeValue = node("div", "dcl-range-value", String(quizState.count));   
  range.addEventListener("input", function () { quizState.count = clampQuizCount(totalCount, range.value); rangeValue.textContent = String(quizState.count); });   
  row.appendChild(range);   
  row.appendChild(rangeValue);   
  card.appendChild(row);   
  card.appendChild(node("div", "dcl-label", "Порядок слов"));   
  row = node("div", "dcl-segmented");   
  row.appendChild(makeButton(!quizState.shuffle ? "dcl-btn" : "dcl-btn dcl-btn-muted", "По порядку", function () { quizState.shuffle = false; renderQuiz(); }));   
  row.appendChild(makeButton(quizState.shuffle ? "dcl-btn" : "dcl-btn dcl-btn-muted", "Случайно", function () { quizState.shuffle = true; renderQuiz(); }));   
  card.appendChild(row);   
  card.appendChild(node("div", "dcl-help", "Всего доступно: " + String(totalCount)));   
  
  row = node("div", "dcl-row");  
  row.appendChild(makeButton("dcl-btn", "Начать тест", beginQuizTest));  
  card.appendChild(row);  
  quizBody.appendChild(card);  
  return;  
 } 
 if (quizState.step === "results") {
 results = safeArray(quizState.results).filter(Boolean);
 correctCount = results.filter(function (item) { return item.isCorrect; }).length;
 mistakes = results.filter(function (item) { return !item.isCorrect; });
 score = results.length ? Math.round(correctCount / results.length * 100) : 0;
  if (!isQuizMobileViewport()) { quizState.mobileResultsOpen = false; }
  if (quizState.mobileResultsOpen) {
   if (results.length) {
    screen = node("div", "dcl-results-screen dcl-results-mobile-screen");
    topBar = node("div", "dcl-quiz-topbar");
    button = node("button", "dcl-quiz-icon-btn", "←");
    button.type = "button";
    button.addEventListener("click", function () { quizState.mobileResultsOpen = false; renderQuiz(); });
    topBar.appendChild(button);
    stageCopy = node("div", "dcl-quiz-progress");
    stageCopy.appendChild(node("div", "dcl-results-mobile-title", "Все ответы"));
    stageCopy.appendChild(node("div", "dcl-results-mobile-subtitle", String(results.length) + " слов"));
    topBar.appendChild(stageCopy);
    topBar.appendChild(node("div", "dcl-quiz-spacer"));
    screen.appendChild(topBar);
    listWrap = node("div", "dcl-results-list dcl-results-list-fullscreen");
    results.forEach(function (item) { listWrap.appendChild(createQuizResultRow(item)); });
    screen.appendChild(listWrap);
    quizBody.appendChild(screen);
    return;
   }
   quizState.mobileResultsOpen = false;
  }
 screen = node("div", "dcl-results-screen");
 head = node("div", "dcl-results-hero");
 head.appendChild(node("div", "dcl-results-trophy", "🏆"));
 row = node("div", "dcl-results-heading");
 row.appendChild(node("div", "dcl-results-heading-line"));
 row.appendChild(node("div", "dcl-results-heading-text", "Результаты"));
 row.appendChild(node("div", "dcl-results-heading-line"));
 head.appendChild(row);
 screen.appendChild(head);
 card = node("div", "dcl-results-card");
 card.appendChild(node("div", "dcl-results-card-title", "Оценка по тесту английского"));
 stats = node("div", "dcl-results-stats");
 stat = node("div", "dcl-results-stat");
 stat.appendChild(node("div", "dcl-results-stat-value", String(correctCount)));
 stat.appendChild(node("div", "dcl-results-stat-label", "Верно"));
 stats.appendChild(stat);
 stat = node("div", "dcl-results-stat dcl-results-stat-score");
 statValue = node("div", "dcl-results-stat-value");
 statValue.appendChild(document.createTextNode(String(score)));
 statValue.appendChild(node("span", "", "/100"));
 stat.appendChild(statValue);
 stat.appendChild(node("div", "dcl-results-stat-label", "Балл"));
 stats.appendChild(stat);
 stat = node("div", "dcl-results-stat");
 stat.appendChild(node("div", "dcl-results-stat-value", String(results.length - correctCount)));
 stat.appendChild(node("div", "dcl-results-stat-label", "Ошибки"));
 stats.appendChild(stat);
 card.appendChild(stats);
 if (!results.length) {
 card.appendChild(node("div", "dcl-results-copy", "Тест завершен раньше времени. Попробуй пройти его заново, когда будешь готова."));
 } else if (quizState.finishedEarly) {
 card.appendChild(node("div", "dcl-results-copy", "Тест завершен раньше времени. Уже отвечено: " + String(results.length) + " из " + String(quizState.entries.length) + "."));
 } else {
  card.appendChild(node("div", "dcl-results-copy", mistakes.length ? "Посмотри свои ответы ниже." : "Идеально. Все ответы в этом тесте правильные."));
 }
  if (results.length) {
   if (isQuizMobileViewport()) {
    row = node("div", "dcl-results-mobile-open");
    row.appendChild(makeButton("dcl-btn dcl-btn-muted", "Открыть весь список", function () { quizState.mobileResultsOpen = true; renderQuiz(); }));
    card.appendChild(row);
   }
  }
 listWrap = node("div", "dcl-results-list");
 results.forEach(function (item) { listWrap.appendChild(createQuizResultRow(item)); });
 card.appendChild(listWrap);
 screen.appendChild(card);
 row = node("div", "dcl-results-actions");
 if (mistakes.length) {
 row.appendChild(makeButton("dcl-btn", "Пройти только ошибки", restartQuizMistakes));
 }
 row.appendChild(makeButton("dcl-btn dcl-btn-light", "Пройти заново", restartQuizFull));
 row.appendChild(makeButton("dcl-btn dcl-btn-muted", "Закрыть", closeQuiz));
 screen.appendChild(row);
 quizBody.appendChild(screen);
 return;
 }
 if (!entry) { closeQuiz(); return; }
  screen = node("div", "dcl-quiz-screen");
 topBar = createQuizTopBar();
 card = node("div", "dcl-quiz-stage-card");
 stageTop = node("div", "dcl-quiz-stage-top");
 stageTop.appendChild(node("div", "dcl-quiz-step-number", String(quizState.index + 1)));
 stageCopy = node("div", "dcl-quiz-stage-copy");
 stageCopy.appendChild(node("div", "dcl-quiz-stage-hint", quizState.direction === "en_ru" ? "ДАША, пиши перевод на русском языке" : "ДАША, пиши перевод на английском языке"));
 stageCopy.appendChild(node("div", "dcl-quiz-stage-word", getQuizPrompt(entry)));
 stageTop.appendChild(stageCopy);
 card.appendChild(stageTop);
 form = node("form", "dcl-quiz-form");
 form.addEventListener("submit", function (event) {
 event.preventDefault();
 if (quizState.checked) { nextQuizStep(); return; }
 submitQuizAnswer();
 });
 input = makeInput("dcl-quiz-input", getQuizStoredInput(quizState.index), getQuizAnswerPlaceholder());
 input.className = input.className + " dcl-quiz-answer-input";
 input.autocomplete = "off";
 input.autocorrect = "off";
 input.autocapitalize = "off";
 input.spellcheck = false;
 input.addEventListener("input", function () {
 quizState.input = input.value;
 quizState.inputs[quizState.index] = input.value;
 });
  input.addEventListener("keydown", function (event) {
   if (event.key !== "Enter" || event.shiftKey || event.altKey || event.ctrlKey || event.metaKey) { return; }
   event.preventDefault();
   if (quizState.checked) { nextQuizStep(); return; }
   submitQuizAnswer();
  });
 input.disabled = quizState.checked;
 form.appendChild(input);
 message = createQuizFeedback(entry);
 if (message) { form.appendChild(message); }
 row = node("div", "dcl-quiz-actions");
 if (!quizState.checked) {
   if (true) {
    button = makeButton("dcl-btn dcl-btn-muted dcl-quiz-action-secondary", "\u2190", quizState.index === 0 ? null : prevQuizStep);
   button.setAttribute("aria-label", "\u041d\u0430\u0437\u0430\u0434");
    button.title = "\u041d\u0430\u0437\u0430\u0434"; if (quizState.index === 0) { button.disabled = true; button.style.opacity = ".38"; button.style.cursor = "not-allowed"; }
   row.appendChild(button);
  } else {
   row.appendChild(node("div", "dcl-quiz-spacer"));
  }
 } else {
  row.appendChild(node("div", "dcl-quiz-spacer"));
 }
  button = makeButton("dcl-btn dcl-quiz-action-primary", quizState.checked ? "\u0414\u0430\u043b\u044c\u0448\u0435" : "\u041f\u0440\u043e\u0432\u0435\u0440\u0438\u0442\u044c", null, "submit");
  button.id = "dcl-quiz-primary-action";
  row.appendChild(button);
 if (!quizState.checked) {
  button = makeButton("dcl-btn dcl-btn-light dcl-quiz-action-secondary", "\u2192", skipQuizStep);
  button.setAttribute("aria-label", "\u041f\u0440\u043e\u043f\u0443\u0441\u0442\u0438\u0442\u044c \u0441\u043b\u043e\u0432\u043e");
  button.title = "\u041f\u0440\u043e\u043f\u0443\u0441\u0442\u0438\u0442\u044c";
  row.appendChild(button);
 } else {
  row.appendChild(node("div", "dcl-quiz-spacer"));
 }
 form.appendChild(row);
 card.appendChild(form);
 screen.appendChild(topBar);
 screen.appendChild(createQuizJumpBar());
 screen.appendChild(card);
 quizBody.appendChild(screen);
  window.setTimeout(function () {
   const currentInput = document.getElementById("dcl-quiz-input");
   const primaryAction = document.getElementById("dcl-quiz-primary-action");
   if (quizState.checked) { if (primaryAction) { primaryAction.focus(); } return; }
   if (!currentInput) { if (primaryAction) { primaryAction.focus(); } return; }
   currentInput.focus();
  }, 0);
}  
function installUi() {  

 const style = node("style");
 const css = [];
 css.push('@import url("https://fonts.googleapis.com/css2?family=DM+Sans:ital,opsz,wght@0,9..40,100..1000;1,9..40,100..1000&display=swap");');
 css.push('html,body,button,input,textarea,select{font-family:"DM Sans",sans-serif!important}');
 let panel;
 let head;
 let titleWrap;
 let observer;
 css.push("html.dcl-locked,body.dcl-locked{overflow:hidden!important}");
 css.push("#dcl-inline{display:flex;justify-content:center;margin-top:12px}");
 css.push(".dcl-trigger,.dcl-btn,.dcl-close,.dcl-list-item{font:inherit}");
 css.push('.dcl-overlay,.dcl-overlay *{font-family:"DM Sans",sans-serif}');
 css.push(".dcl-trigger,.dcl-btn,.dcl-close{border:0;cursor:pointer}");
 css.push(".dcl-trigger{display:inline-flex;align-items:center;justify-content:center;padding:14px 22px;border-radius:999px;background:#ff4b6e;color:#fff;font-weight:800;box-shadow:0 14px 36px rgba(255,75,110,.35)}");
 css.push(".dcl-fab{position:fixed;right:18px;bottom:max(16px,env(safe-area-inset-bottom));z-index:9998}");
 css.push(".dcl-overlay{position:fixed;inset:0;padding:16px;background:rgba(11,3,7,.78);backdrop-filter:blur(12px);display:flex;align-items:center;justify-content:center;z-index:9999}");
 css.push(".dcl-quiz-overlay{padding:0;align-items:stretch;justify-content:stretch}");
 css.push(".dcl-quiz-overlay .dcl-panel{width:min(1120px,calc(100vw - 44px));height:calc(100vh - 24px);min-height:calc(100vh - 24px);height:calc(100dvh - 24px);min-height:calc(100dvh - 24px);max-height:none;border-radius:28px;border:1px solid rgba(255,255,255,.12)}");
  css.push(".dcl-panel{width:min(920px,100%);max-height:min(94vh,960px);display:flex;flex-direction:column;overflow:hidden;border-radius:28px;border:1px solid rgba(255,255,255,.12);background:linear-gradient(180deg,rgba(58,21,29,.97),rgba(24,6,10,.98));box-shadow:0 32px 90px rgba(0,0,0,.45)}");
 css.push(".dcl-head{display:flex;align-items:flex-start;justify-content:space-between;gap:16px;padding:20px 22px;border-bottom:1px solid rgba(255,255,255,.08)}");
 css.push(".dcl-head h2{margin:0;color:#fff;font-size:clamp(30px,4vw,42px);line-height:1}");
 css.push(".dcl-head p{margin:8px 0 0;color:#f3b9c5;font-size:14px;line-height:1.4}");
 css.push(".dcl-close{padding:12px 16px;border-radius:16px;background:rgba(255,255,255,.1);color:#fff;font-weight:800}");
 css.push(".dcl-body{flex:1;min-height:0;padding:20px 22px 24px;overflow:auto;-webkit-overflow-scrolling:touch;overscroll-behavior:contain}");
 css.push(".dcl-main{min-height:0}");
 css.push(".dcl-main,.dcl-stack{display:flex;flex-direction:column;gap:12px}");
 css.push(".dcl-card{display:flex;flex-direction:column;gap:14px;padding:16px;border-radius:22px;background:rgba(255,255,255,.04);border:1px solid rgba(255,255,255,.08)}");
 css.push(".dcl-row{display:flex;flex-wrap:wrap;gap:12px}");
 css.push(".dcl-field{display:flex;flex-direction:column;gap:10px;min-width:0}");
 css.push(".dcl-row>.dcl-field{flex:1 1 220px}");
 css.push(".dcl-label{margin:0;color:#ff6d86;font-size:12px;font-weight:800;letter-spacing:.12em;text-transform:uppercase}");
 css.push(".dcl-title{margin:0;color:#fff;font-size:24px;line-height:1.15}");
 css.push(".dcl-subtitle{margin-top:8px;color:#e6bdc7;font-size:14px;line-height:1.4}");
 css.push(".dcl-input,.dcl-textarea{width:100%;min-width:0;box-sizing:border-box;border:1px solid rgba(255,255,255,.12);border-radius:16px;background:rgba(255,255,255,.08);color:#fff;padding:14px 16px;outline:none}");
 css.push(".dcl-input::placeholder,.dcl-textarea::placeholder{color:#c89aa7}");
 css.push(".dcl-textarea{resize:vertical;min-height:140px}");
 css.push(".dcl-btn{display:inline-flex;align-items:center;justify-content:center;padding:12px 16px;border-radius:16px;background:#ff4b6e;color:#fff;font-weight:800}");
 css.push(".dcl-btn-muted{background:rgba(255,255,255,.1);color:#fff}");
 css.push(".dcl-btn-danger{background:#5e1828;color:#ffd9e0}");
 css.push(".dcl-banner{margin-bottom:16px;padding:12px 16px;border-radius:18px;background:rgba(255,255,255,.08);color:#fff}");
 css.push(".dcl-section-head{display:flex;flex-wrap:wrap;align-items:flex-start;justify-content:space-between;gap:12px;margin-bottom:14px}");
 css.push(".dcl-entry-list{display:flex;flex-direction:column;gap:10px;padding-right:0}");
 css.push(".dcl-entry{display:flex;flex-wrap:wrap;gap:12px;align-items:flex-start;justify-content:space-between;padding:14px 16px;border-radius:18px;background:rgba(255,255,255,.05);border:1px solid rgba(255,255,255,.06)}");
 css.push(".dcl-entry-main{min-width:0;flex:1 1 240px}");
 css.push(".dcl-entry-term{color:#fff;font-size:18px;font-weight:800;word-break:break-word}");
 css.push(".dcl-entry-translations{margin-top:6px;color:#efbcc8;line-height:1.45;word-break:break-word}");
 css.push(".dcl-entry-actions{display:flex;flex-wrap:wrap;gap:8px}");
 css.push(".dcl-empty{padding:8px 0;color:#efbcc8;line-height:1.5}");
 css.push(".dcl-search{position:relative}");
 css.push(".dcl-search .dcl-input{padding-right:52px}");
 css.push(".dcl-search-clear{position:absolute;top:50%;right:10px;transform:translateY(-50%);width:36px;height:36px;border-radius:999px;padding:0;background:rgba(255,255,255,.12);color:#fff;font-size:20px;line-height:1}");
 css.push(".dcl-emoji-picker{display:flex;flex-wrap:wrap;gap:8px}");
 css.push(".dcl-emoji-chip{min-width:44px;height:44px;padding:0 12px;border-radius:14px;background:rgba(255,255,255,.08);color:#fff;font-size:24px}");
 css.push(".dcl-emoji-chip-active{background:#ff4b6e}");
 css.push(".dcl-home-lists{display:flex;flex-direction:column;gap:18px;margin-top:18px;position:relative;z-index:20;pointer-events:auto}");
 css.push(".dcl-home-card{display:flex;flex-direction:column;align-items:center;gap:18px;padding:30px 24px;border-radius:32px;border:1px solid rgba(255,255,255,.1);background:linear-gradient(180deg,rgba(71,30,39,.96),rgba(43,14,21,.96));box-shadow:0 20px 50px rgba(0,0,0,.28);position:relative;z-index:21;pointer-events:auto}");
 css.push(".dcl-home-icon{display:flex;align-items:center;justify-content:center;width:76px;height:76px;border-radius:999px;background:rgba(255,255,255,.08);font-size:34px}");
 css.push(".dcl-home-title{color:#fff;font-size:28px;font-weight:800;line-height:1.1;text-align:center;text-transform:uppercase}");
 css.push(".dcl-home-start{min-width:200px;position:relative;z-index:22;pointer-events:auto}");
 css.push(".dcl-home-actions{display:flex;flex-wrap:wrap;gap:10px;justify-content:center;width:100%}");
 css.push(".dcl-home-actions .dcl-btn{flex:1 1 160px}");
 css.push(".dcl-segmented{display:flex;flex-wrap:wrap;gap:8px;padding:6px;border-radius:18px;background:rgba(255,255,255,.08)}");
 css.push(".dcl-segmented .dcl-btn{flex:1 1 220px}");
 css.push(".dcl-range-wrap{display:flex;align-items:center;gap:14px;padding:14px 16px;border-radius:16px;background:rgba(255,255,255,.08)}");
 css.push(".dcl-range{flex:1;accent-color:#ff4b6e}");
 css.push(".dcl-range-value{min-width:44px;color:#fff;font-size:22px;font-weight:800;text-align:right}");
 css.push(".dcl-help{color:#efbcc8;font-size:13px;line-height:1.4}");
 css.push(".dcl-reveal-answer{margin-top:10px;width:100%;padding:12px 16px;border:0;border-radius:16px;background:rgba(255,255,255,.08);color:#fff;text-align:left;font:inherit;cursor:pointer;transition:filter .2s ease,opacity .2s ease}");
 css.push(".dcl-reveal-answer-blurred{filter:blur(7px);opacity:.85}");
 css.push(".dcl-reveal-answer-open{filter:none;opacity:1}");
 css.push(".dcl-home-scroll{min-height:0!important;height:auto!important;max-height:none!important;overflow:visible!important;overflow-y:visible!important;-webkit-overflow-scrolling:touch;overscroll-behavior:contain}");
 css.push(".dcl-home-scroll-frame{min-height:0!important;height:auto!important;max-height:none!important;overflow:visible!important;overflow-y:visible!important;-webkit-overflow-scrolling:touch;overscroll-behavior:contain}");
 css.push(".dcl-home-scroll-root{min-height:100dvh!important;height:auto!important;overflow:visible!important;justify-content:flex-start!important}");
 css.push(".dcl-quiz-word{padding:22px;border-radius:20px;background:rgba(255,255,255,.06);color:#fff;font-size:30px;font-weight:800;text-align:center;word-break:break-word}");
 css.push(".dcl-banner-good{background:rgba(54,179,126,.18);color:#dfffea}");
 css.push(".dcl-banner-bad{background:rgba(255,107,129,.16);color:#ffe1e7}");
 css.push(".dcl-btn-light{background:#fff;color:#ff4b6e;box-shadow:0 18px 40px rgba(255,255,255,.12)}");
 css.push(".dcl-body{scrollbar-width:thin;scrollbar-color:rgba(255,255,255,.38) rgba(255,255,255,.06)}");
 css.push(".dcl-body::-webkit-scrollbar{width:10px}");
 css.push(".dcl-body::-webkit-scrollbar-track{background:rgba(255,255,255,.06);border-radius:999px}");
 css.push(".dcl-body::-webkit-scrollbar-thumb{background:linear-gradient(180deg,rgba(255,107,129,.85),rgba(255,75,110,.58));border-radius:999px;border:2px solid rgba(45,16,24,.9)}");
 css.push(".dcl-body::-webkit-scrollbar-thumb:hover{background:linear-gradient(180deg,rgba(255,120,140,.95),rgba(255,85,118,.7))}");
  css.push(".dcl-quiz-body{display:flex;flex:1 1 auto;min-height:0;padding:18px 22px 22px;overflow:hidden}");
  css.push(".dcl-quiz-screen{display:flex;flex-direction:column;gap:14px;flex:1 1 auto;min-height:0;height:100%}");
 css.push(".dcl-quiz-topbar{display:flex;align-items:flex-start;justify-content:space-between;gap:16px;color:#fff}");
 css.push(".dcl-quiz-icon-btn{width:44px;height:44px;border:0;border-radius:16px;background:rgba(255,255,255,.08);color:#fff;font:inherit;font-size:28px;font-weight:800;display:inline-flex;align-items:center;justify-content:center;cursor:pointer;flex:0 0 auto}");
 css.push(".dcl-quiz-progress{flex:1;text-align:center}");
 css.push(".dcl-quiz-progress-main{color:#fff;font-size:40px;font-weight:900;line-height:1}");
 css.push(".dcl-quiz-progress-label{margin-top:4px;color:#caaeb6;font-size:12px;font-weight:800;letter-spacing:.12em;text-transform:uppercase}");
 css.push(".dcl-quiz-jump-list{display:grid;gap:8px;align-items:center;width:100%;min-width:0}");
 css.push(".dcl-quiz-jump-list{display:grid;gap:8px;align-items:center;width:100%;min-width:0;padding:2px 0 0;overflow:hidden}");
 css.push(".dcl-quiz-jump-list::-webkit-scrollbar{display:none}");
 css.push(".dcl-quiz-jump-btn{display:inline-flex;align-items:center;justify-content:center;width:100%;min-width:0;height:44px;padding:0 10px;border-radius:14px;background:rgba(255,255,255,.08);color:#d9c0c8;font-weight:800;border:0;cursor:pointer;font:inherit}");
 css.push(".dcl-quiz-jump-btn-active{background:#ff4b6e;color:#fff;box-shadow:0 12px 28px rgba(255,75,110,.28)}");
  css.push(".dcl-quiz-jump-btn-checked{background:rgba(255,255,255,.16);color:#fff}"); css.push(".dcl-quiz-jump-btn-correct{background:rgba(54,179,126,.24);color:#dfffea}"); css.push(".dcl-quiz-jump-btn-wrong{background:rgba(255,107,129,.22);color:#ffe1e7}"); css.push(".dcl-quiz-jump-btn-active.dcl-quiz-jump-btn-correct{background:#36b37e;color:#fff;box-shadow:0 12px 28px rgba(54,179,126,.28)}"); css.push(".dcl-quiz-jump-btn-active.dcl-quiz-jump-btn-wrong{background:#ff6b81;color:#fff;box-shadow:0 12px 28px rgba(255,107,129,.28)}");
 css.push(".dcl-quiz-jump-btn-draft{background:rgba(255,255,255,.12);color:#ffe0e7}");
 css.push(".dcl-quiz-spacer{width:60px;height:60px;flex:0 0 60px}");
 css.push(".dcl-quiz-finish-top{flex:0 0 auto;min-height:44px;padding:10px 14px;border-radius:14px;font-size:14px}");
  css.push(".dcl-quiz-stage-card{display:flex;flex-direction:column;gap:16px;flex:1 1 auto;min-height:0;padding:22px;border-radius:30px;border:1px solid rgba(255,255,255,.08);background:rgba(255,255,255,.04);overflow:hidden}");
 css.push(".dcl-quiz-stage-top{display:flex;align-items:flex-start;gap:18px}");
 css.push(".dcl-quiz-step-number{color:#fff;font-size:86px;font-weight:900;line-height:.92;letter-spacing:-.06em}");
 css.push(".dcl-quiz-stage-copy{flex:1;min-width:0;padding-top:10px}");
 css.push(".dcl-quiz-stage-hint{color:#c9afb7;font-size:15px;font-weight:700;line-height:1.45}");
 css.push(".dcl-quiz-stage-word{margin-top:8px;color:#fff;font-size:clamp(36px,5vw,58px);font-weight:900;line-height:1.05;word-break:break-word}");
 css.push(".dcl-quiz-form{margin-top:auto;display:flex;flex-direction:column;gap:16px}");
 css.push(".dcl-quiz-answer-input{padding:18px 20px;border-radius:20px;font-size:24px;font-weight:700;background:rgba(255,255,255,.08)}");
 css.push(".dcl-quiz-feedback{padding:14px 16px;border-radius:18px}");
 css.push(".dcl-quiz-feedback-good{background:rgba(54,179,126,.18);color:#dfffea}");
 css.push(".dcl-quiz-feedback-bad{background:rgba(255,107,129,.16);color:#ffe1e7}");
 css.push(".dcl-quiz-feedback-title{font-size:20px;font-weight:800}");
 css.push(".dcl-quiz-feedback-hint{margin-top:6px;color:#ffc7d0;font-size:13px}");
 css.push(".dcl-quiz-actions{display:flex;align-items:center;gap:12px}");
 css.push(".dcl-quiz-subactions{display:none}");
 css.push(".dcl-quiz-action-primary{flex:1 1 auto;min-height:60px;font-size:20px}");
 css.push(".dcl-quiz-action-secondary{flex:0 0 60px;min-width:60px;min-height:60px;padding:0;font-size:28px}");
 css.push(".dcl-results-screen{display:flex;flex-direction:column;gap:20px;flex:1 1 auto;min-height:0;width:100%;min-width:0;height:100%;overflow:hidden}");
 css.push(".dcl-results-hero{display:flex;flex-direction:column;align-items:center;gap:14px;padding-top:4px;flex:0 0 auto}");
 css.push(".dcl-results-trophy{font-size:64px;line-height:1}");
 css.push(".dcl-results-heading{display:flex;align-items:center;gap:14px;width:100%}");
 css.push(".dcl-results-heading-line{height:1px;flex:1;background:rgba(255,255,255,.24)}");
 css.push(".dcl-results-heading-text{color:#fff;font-size:16px;font-weight:900;letter-spacing:.12em;text-transform:uppercase}");
 css.push(".dcl-results-card{display:flex;flex-direction:column;gap:22px;padding:26px 22px;border-radius:30px;border:1px solid rgba(255,255,255,.08);background:rgba(255,255,255,.04);width:100%;min-width:0;box-sizing:border-box;flex:1 1 auto;min-height:0;overflow:hidden}");
 css.push(".dcl-results-card-title{text-align:center;color:#fff;font-size:28px;font-weight:800;line-height:1.2}");
 css.push(".dcl-results-stats{display:flex;align-items:flex-end;justify-content:space-between;gap:16px}");
 css.push(".dcl-results-stat{flex:1;text-align:center}");
 css.push(".dcl-results-stat-value{color:#ff5a77;font-size:44px;font-weight:900;line-height:1}");
 css.push(".dcl-results-stat-label{margin-top:8px;color:#c9afb7;font-size:13px;font-weight:800;letter-spacing:.08em;text-transform:uppercase}");
 css.push(".dcl-results-stat-score .dcl-results-stat-value{color:#fff;font-size:70px;letter-spacing:-.05em}");
 css.push(".dcl-results-stat-score .dcl-results-stat-value span{color:#d2bdc4;font-size:34px}");
 css.push(".dcl-results-copy{text-align:center;color:#dcc4cb;font-size:18px;line-height:1.55}");
 css.push(".dcl-results-list{display:flex;flex-direction:column;gap:12px;flex:1 1 auto;min-height:0;max-height:none;width:100%;min-width:0;overflow:auto;padding-right:4px;box-sizing:border-box}");
 css.push(".dcl-results-item{display:flex;gap:14px;align-items:flex-start;padding:16px;border-radius:22px;background:rgba(255,255,255,.08)}");
 css.push(".dcl-results-status{display:flex;align-items:center;justify-content:center;width:34px;height:34px;border-radius:999px;font-size:22px;font-weight:900;line-height:1;flex:0 0 auto}");
 css.push(".dcl-results-status-good{background:rgba(63,184,128,.14);color:#bff5d5}");
 css.push(".dcl-results-status-bad{background:rgba(255,91,116,.12);color:#ff6b81}");
 css.push(".dcl-results-item-main{flex:1;min-width:0}");
 css.push(".dcl-results-item-head{display:flex;align-items:flex-start;justify-content:space-between;gap:14px}");
 css.push(".dcl-results-item-prompt{color:#fff;font-size:24px;font-weight:800;word-break:break-word}");
 css.push(".dcl-results-item-answer{color:#d8c9ce;font-size:20px;font-weight:700;text-align:right;word-break:break-word}");
 css.push(".dcl-results-item-user{display:inline-flex;margin-top:12px;padding:8px 12px;border-radius:12px;background:#fff;color:#ff5a77;font-size:18px;font-weight:700;text-decoration:line-through;max-width:100%;word-break:break-word}");
 css.push(".dcl-results-actions{display:flex;flex-wrap:wrap;gap:14px;flex:0 0 auto}");
  css.push(".dcl-results-mobile-open{display:none}");
  css.push(".dcl-results-mobile-title{color:#fff;font-size:22px;font-weight:800;line-height:1.2}");
  css.push(".dcl-results-mobile-subtitle{margin-top:4px;color:#c9afb7;font-size:12px;font-weight:800;letter-spacing:.08em;text-transform:uppercase}");
  css.push(".dcl-results-list-fullscreen{flex:1 1 auto;min-height:0;max-height:none;padding-right:2px}");
 css.push(".dcl-results-actions .dcl-btn{flex:1 1 220px;min-height:64px;font-size:18px}");
 css.push(".dcl-builtin-stage-card{display:flex!important;flex-direction:column!important;min-height:min(72vh,760px)!important;padding:22px 18px!important;border-radius:30px!important;border:1px solid rgba(255,255,255,.08)!important;background:rgba(255,255,255,.04)!important;overflow:hidden!important;margin-bottom:0!important}");
css.push(".dcl-builtin-stage-inner{display:flex!important;flex:1 1 auto!important;min-height:100%!important;height:100%!important;flex-direction:column!important;justify-content:space-between!important;gap:24px!important}");
css.push(".dcl-builtin-stage-form{margin-top:0!important;width:100%!important;display:flex!important;flex:1 1 auto!important;flex-direction:column!important;justify-content:flex-end!important}");
css.push(".dcl-builtin-fill{display:flex!important;flex-direction:column!important;flex:1 1 auto!important;min-height:0!important}");
css.push(".dcl-builtin-input-wrap{display:flex!important;flex-direction:column!important;justify-content:flex-end!important;gap:16px!important;margin-top:auto!important;min-height:0!important}");
css.push(".dcl-builtin-jump-list{justify-content:flex-start!important;margin-top:-4px!important;margin-bottom:8px!important}");
css.push(".dcl-builtin-jump-btn{pointer-events:none!important}");
css.push(".dcl-builtin-form-stack{display:flex!important;flex:1 1 auto!important;flex-direction:column!important;justify-content:flex-end!important;gap:16px!important;width:100%!important;margin-top:auto!important}");
css.push(".dcl-builtin-input{width:100%!important;min-width:0!important;box-sizing:border-box!important;border:1px solid rgba(255,255,255,.12)!important;border-radius:20px!important;background:rgba(255,255,255,.08)!important;color:#fff!important;padding:16px 18px!important;outline:none!important;font-size:18px!important;font-weight:700!important;box-shadow:none!important;margin:0!important}");
css.push(".dcl-builtin-input::placeholder{color:#c89aa7!important}");
css.push(".dcl-builtin-input:disabled,.dcl-builtin-input-locked{opacity:1!important;color:#fff!important;-webkit-text-fill-color:#fff!important;background:rgba(255,255,255,.08)!important;border-color:rgba(255,255,255,.12)!important;box-shadow:none!important}");
css.push(".dcl-builtin-actions{display:flex!important;align-items:center!important;gap:12px!important;margin:0!important}");
css.push(".dcl-builtin-action-primary{flex:1 1 auto!important;min-height:60px!important;padding:12px 18px!important;border-radius:20px!important;background:#ff4b6e!important;color:#fff!important;box-shadow:0 18px 40px rgba(255,75,110,.28)!important}");
css.push(".dcl-builtin-action-secondary{flex:0 0 60px!important;min-width:60px!important;min-height:60px!important;padding:0!important;border-radius:18px!important;background:rgba(255,255,255,.08)!important;color:#fff!important;box-shadow:none!important;display:inline-flex!important;align-items:center!important;justify-content:center!important}");
css.push(".dcl-builtin-feedback{width:100%!important;margin-top:0!important}");
css.push(".dcl-builtin-feedback .dcl-reveal-answer{margin-top:14px!important}");
css.push("@media (max-width: 760px){.dcl-overlay{padding:0;align-items:stretch;justify-content:stretch}.dcl-quiz-overlay{padding:0;align-items:stretch;justify-content:stretch}.dcl-panel{width:100%;height:100%;min-height:100vh;min-height:100dvh;max-height:none;border-radius:0;border:0}.dcl-quiz-overlay .dcl-panel{width:100%;height:100%;min-height:100vh;min-height:100dvh;max-height:none;border-radius:0;border:0}.dcl-head{padding:calc(16px + env(safe-area-inset-top)) 16px 16px}.dcl-body{flex:1;min-height:0;padding:16px 16px calc(96px + env(safe-area-inset-bottom));overflow-y:auto}.dcl-main{padding-bottom:12px}.dcl-row{gap:14px}.dcl-entry-list{padding-right:0}.dcl-entry{padding:14px}.dcl-fab{right:12px;bottom:max(12px,env(safe-area-inset-bottom))}.dcl-entry-actions,.dcl-row .dcl-btn,.dcl-row >.dcl-field{width:100%}.dcl-quiz-body{padding:12px 14px calc(16px + env(safe-area-inset-bottom));overflow:hidden}.dcl-quiz-stage-card{flex:1 1 auto;min-height:0;padding:18px 16px}.dcl-quiz-step-number{font-size:72px}.dcl-quiz-stage-hint{font-size:14px}.dcl-quiz-stage-word{font-size:clamp(28px,10vw,46px)}.dcl-quiz-answer-input{font-size:18px;padding:16px 18px}.dcl-quiz-jump-list{gap:6px;padding-bottom:0;min-width:0;width:100%}.dcl-quiz-jump-arrow{min-width:0;height:40px;padding:0 4px;font-size:18px}.dcl-quiz-jump-btn{min-width:0;height:40px;padding:0 4px;font-size:14px}.dcl-quiz-jump-btn-disabled{opacity:.45}.dcl-quiz-finish-top{width:auto;min-height:44px}.dcl-quiz-action-primary{min-height:56px}.dcl-quiz-action-secondary{flex:0 0 56px;min-width:56px;min-height:56px;font-size:24px}.dcl-results-actions .dcl-btn{width:100%;min-height:56px}.dcl-results-mobile-open{display:flex}.dcl-results-mobile-open .dcl-btn{width:100%;min-height:52px}.dcl-results-card{padding:22px 18px}.dcl-results-card-title{font-size:24px}.dcl-results-stats{gap:10px}.dcl-results-stat-value{font-size:34px}.dcl-results-stat-score .dcl-results-stat-value{font-size:52px}.dcl-results-stat-score .dcl-results-stat-value span{font-size:26px}.dcl-results-copy{font-size:16px}.dcl-results-list{max-height:none}.dcl-results-item{padding:14px}.dcl-results-item-head{flex-direction:column;gap:6px}.dcl-results-item-prompt{font-size:18px}.dcl-results-item-answer{text-align:left;font-size:16px}.dcl-results-item-user{font-size:16px}}");
 style.textContent = css.join("");
 document.head.appendChild(style);
 overlay = node("div", "dcl-overlay");
 overlay.hidden = true;
 panel = node("div", "dcl-panel");
 head = node("div", "dcl-head");
 titleWrap = node("div");
 titleWrap.appendChild(node("h2", "", "Мои списки"));
 head.appendChild(titleWrap);
 head.appendChild(makeButton("dcl-close", "Закрыть", closePanel));
 panel.appendChild(head);
 body = node("div", "dcl-body");
 panel.appendChild(body);
 overlay.appendChild(panel);

 document.body.appendChild(overlay);
 quizOverlay = node("div", "dcl-overlay dcl-quiz-overlay");
 quizOverlay.style.display = "none";
 quizOverlay.style.visibility = "hidden";
 quizOverlay.style.pointerEvents = "none";
 quizOverlay.hidden = true;
 function applyQuizOverlayLayout() {
 const mobile = window.innerWidth <= 760;
 quizOverlay.style.padding = mobile ? "0" : "12px";
 quizOverlay.style.alignItems = mobile ? "stretch" : "center";
 quizOverlay.style.justifyContent = mobile ? "stretch" : "center";
 }
 applyQuizOverlayLayout();
 window.addEventListener("resize", applyQuizOverlayLayout);
 panel = node("div", "dcl-panel");
 head = node("div", "dcl-head");
 titleWrap = node("div");
 titleWrap.appendChild(node("h2", "", "Тест списка"));
 head.appendChild(titleWrap);
 head.appendChild(makeButton("dcl-close", "Закрыть", closeQuiz));
 panel.appendChild(head);
 quizBody = node("div", "dcl-body");
 panel.appendChild(quizBody);
 quizOverlay.appendChild(panel);
 quizOverlay.addEventListener("mousedown", function (event) { if (event.target === quizOverlay) { event.preventDefault(); event.stopPropagation(); } }, true);
 quizOverlay.addEventListener("click", function (event) { if (event.target === quizOverlay) { event.preventDefault(); event.stopPropagation(); } }, true);

 document.body.appendChild(quizOverlay);
 floatingTrigger = createTrigger("dcl-trigger dcl-fab");
 inlineWrap = node("div");
 inlineWrap.id = "dcl-inline";
 inlineWrap.appendChild(createTrigger("dcl-trigger"));
 function handleHomeCardClick(event) {
 const eventElement = getEventElement(event.target);
 const editTarget = eventElement ? (eventElement.closest ? eventElement.closest("[data-dcl-home-edit]") : null) : null;
 const deleteTarget = eventElement ? (eventElement.closest ? eventElement.closest("[data-dcl-home-delete]") : null) : null;
 const startTarget = event.defaultPrevented ? null : getStartListTarget(eventElement);
 if (event.type === "mousedown") { if (event.button !== 0) { return; } }
 if (editTarget) { event.preventDefault(); event.stopPropagation(); if (event.stopImmediatePropagation) { event.stopImmediatePropagation(); } openHomeEditor(editTarget.getAttribute("data-dcl-home-edit")); return; }
 if (deleteTarget) { event.preventDefault(); event.stopPropagation(); if (event.stopImmediatePropagation) { event.stopImmediatePropagation(); } removeListById(deleteTarget.getAttribute("data-dcl-home-delete")); return; }
 if (!startTarget) { return; }
 if (startTarget.disabled) { return; }
 event.preventDefault(); event.stopPropagation(); if (event.stopImmediatePropagation) { event.stopImmediatePropagation(); } startListQuiz(startTarget.getAttribute("data-dcl-start-list"));
}
function handleDocumentClick(event) {
 const eventElement = getEventElement(event.target);
 const button = eventElement ? (eventElement.closest ? eventElement.closest("button") : null) : null;
 const label = getBuiltinActionLabel(button);
 const repeatSessionId = text(button ? button.getAttribute("data-dcl-history-repeat") : "");
 const mistakesSessionId = text(button ? button.getAttribute("data-dcl-history-mistakes") : "");
 const historySession = button ? getHistorySessionFromButton(button) : null;
 if (repeatSessionId) {
  event.preventDefault(); event.stopPropagation(); if (event.stopImmediatePropagation) { event.stopImmediatePropagation(); } startHistoryReplay(repeatSessionId, false); return;
 }
 if (mistakesSessionId) {
  event.preventDefault(); event.stopPropagation(); if (event.stopImmediatePropagation) { event.stopImmediatePropagation(); } startHistoryReplay(mistakesSessionId, true); return;
 }
 if (historySession) {
  if (label === "Повторить") { event.preventDefault(); event.stopPropagation(); if (event.stopImmediatePropagation) { event.stopImmediatePropagation(); } startHistoryReplay(historySession.id, false); return; }
  if (label === "Пройти только ошибки") { event.preventDefault(); event.stopPropagation(); if (event.stopImmediatePropagation) { event.stopImmediatePropagation(); } startHistoryReplay(historySession.id, true); return; }
 }
 handleHomeCardClick(event);
}
document.addEventListener("click", handleDocumentClick, true);
document.addEventListener("mousedown", handleHomeCardClick, true);document.addEventListener("keydown", function (event) { if (event.key === "Escape") { if (state.open) { closePanel(); } if (quizState.open) { closeQuiz(); } } });
 observer = new MutationObserver(function () {
 window.clearTimeout(observerTimer);
 observerTimer = window.setTimeout(function () {
  ensureTriggerPlacement();
  normalizeBuiltinTestUi();
 }, 40);
 });
 observer.observe(document.body, { childList: true, subtree: true });
 ensureTriggerPlacement();
 }
 function refreshCloudState() {
 loadStore();
 render();
 ensureTriggerPlacement();
 normalizeBuiltinTestUi();
 }
 function startInit() {
 loadStore();
 installUi();
 render();
 normalizeBuiltinTestUi();
 window.addEventListener("dcl-cloud-sync", refreshCloudState);
 if (typeof window.__dclForceCloudPull === "function") { window.setTimeout(function () { window.__dclForceCloudPull().then(refreshCloudState).catch(function () { return null; }); }, 0); }
 }
 function init() {
 Promise.resolve(window.__dclCloudReady).catch(function () { return null; }).then(startInit);
 }
 if (document.readyState === "loading") {
 document.addEventListener("DOMContentLoaded", init, { once: true });
 } else {
 init();
 }
})();


































