import React from 'react'; 
import { createRoot } from 'react-dom/client'; 
import { IRREGULAR_VERBS, FOOD_WORDS } from './data.js'; 
import './styles.css'; 
 
const h = React.createElement; 
const HISTORY_KEY = 'dasha_english_history_v2'; 
const CUSTOM_LISTS_KEY = 'dasha_custom_lists_v1'; 
const FOOD_LEVELS = ['a1', 'a2', 'b1']; 
 
function makeId() { 
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 9); 
} 
 
function readStorage(key, fallback) { 
  try { 
    const raw = window.localStorage.getItem(key); 
    if (!raw) { 
      return fallback; 
    } 
    return JSON.parse(raw); 
  } catch (error) { 
    return fallback; 
  } 
} 
 
function writeStorage(key, value) { 
  window.localStorage.setItem(key, JSON.stringify(value)); 
  return value; 
} 
 
function getHistorySessions() { 
  return readStorage(HISTORY_KEY, []); 
} 
 
function saveHistorySessions(value) { 
  return writeStorage(HISTORY_KEY, value); 
} 
 
function addHistorySession(session) { 
  const current = getHistorySessions(); 
  return saveHistorySessions([session].concat(current).slice(0, 200)); 
} 
 
function deleteHistorySession(sessionId) { 
  const next = getHistorySessions().filter(function (session) { 
    return session.id !== sessionId; 
  }); 
  return saveHistorySessions(next); 
} 
 
function clearHistorySessions() { 
  return saveHistorySessions([]); 
} 
 
function getCustomLists() { 
  return readStorage(CUSTOM_LISTS_KEY, []); 
} 
 
function saveCustomLists(value) { 
  return writeStorage(CUSTOM_LISTS_KEY, value); 
} 
 
function normalizeValue(value) { 
  return String(value ? value : '').trim().toLowerCase(); 
} 
 
function normalizeListName(value) { 
  return String(value ? value : '').trim(); 
} 
 
function uniqueValues(values) { 
  const seen = {}; 
  const output = []; 
  values.forEach(function (item) { 
    const clean = String(item ? item : '').trim(); 
    const key = normalizeValue(clean); 
    if (!clean) { 
      return; 
    } 
    if (seen[key]) { 
      return; 
    } 
    seen[key] = true; 
    output.push(clean); 
  }); 
  return output; 
} 
 
function splitTranslations(value) { 
  return uniqueValues(String(value ? value : '').split(/[;,/]/).map(function (part) { 
    return part.trim(); 
  })); 
} 
 
function shuffleArray(items) { 
  const copy = items.slice(); 
  let index = copy.length - 1; 
  while (index !== 0) { 
    const swapIndex = Math.floor(Math.random() * (index + 1)); 
    const temp = copy[index]; 
    copy[index] = copy[swapIndex]; 
    copy[swapIndex] = temp; 
    index -= 1; 
  } 
  return copy; 
} 
 
function parseBulkEntries(text) { 
  const lines = String(text ? text : '').split(/\r?\n/); 
  const entries = []; 
  const skipped = []; 
  lines.forEach(function (line, index) { 
    const clean = line.trim(); 
    let match; 
    let translations; 
    if (!clean) { 
      return; 
    } 
    match = clean.match(/(.+?)\s*[---]\s*(.+)$/); 
    if (!match) { 
      skipped.push(index + 1); 
      return; 
    } 
    translations = splitTranslations(match[2]); 
    if (!match[1].trim()) { 
      skipped.push(index + 1); 
      return; 
    } 
    if (!translations.length) { 
      skipped.push(index + 1); 
      return; 
    } 
    entries.push({ 
      id: makeId(), 
      term: match[1].trim(), 
      translations: translations 
    }); 
  }); 
  return { entries: entries, skipped: skipped }; 
}
 
function parseBulkEntries(text) { 
  const lines = String(text ? text : '').split(/\r?\n/); 
  const entries = []; 
  const skipped = []; 
  lines.forEach(function (line, index) { 
    const clean = line.trim().replace('-', '-').replace('-', '-'); 
    const separator = clean.indexOf(' - '); 
    const compactSeparator = clean.indexOf('-'); 
    let splitIndex = separator !== -1 ? separator : compactSeparator; 
    let term; 
    let translations; 
    if (!clean) { 
      return; 
    } 
    if (splitIndex === -1) { 
      skipped.push(index + 1); 
      return; 
    } 
    term = clean.slice(0, splitIndex).trim(); 
    translations = splitTranslations(clean.slice(splitIndex + 1)); 
    if (!term 
      skipped.push(index + 1); 
      return; 
    } 
    entries.push({ id: makeId(), term: term, translations: translations }); 
  }); 
  return { entries: entries, skipped: skipped }; 
} 
 
function firstValue(value) { 
  if (Array.isArray(value)) { 
    return value[0]; 
  } 
  return value; 
} 
 
function mergeEntries(existingEntries, nextEntries) { 
  const merged = existingEntries.map(function (entry) { 
    return { 
      id: entry.id, 
      term: entry.term, 
      translations: entry.translations.slice() 
    }; 
  }); 
  nextEntries.forEach(function (candidate) { 
    const key = normalizeValue(candidate.term); 
    const existing = merged.find(function (entry) { 
      return normalizeValue(entry.term) === key; 
    }); 
    if (existing) { 
      existing.translations = uniqueValues(existing.translations.concat(candidate.translations)); 
      return; 
    } 
    merged.push({ 
      id: candidate.id ? candidate.id : makeId(), 
      term: candidate.term.trim(), 
      translations: uniqueValues(candidate.translations) 
    }); 
  }); 
  return merged.filter(function (entry) { 
    return normalizeListName(entry.term) 
  }); 
} 
 
function buildIrregularItems(settings) { 
  let source = IRREGULAR_VERBS.slice(settings.startWordIndex, settings.endWordIndex + 1); 
  if (settings.shuffle) { 
    source = shuffleArray(source); 
  } 
  return source.map(function (verb) { 
    const acceptedAnswers = settings.direction === 'en_ru' ? uniqueValues(verb.ru) : [verb.base]; 
    return { 
      question: settings.direction === 'en_ru' ? verb.base : firstValue(verb.ru), 
      answer: acceptedAnswers.join(', '), 
      primaryAnswer: acceptedAnswers[0], 
      acceptedAnswers: acceptedAnswers, 
      past: verb.past, 
      participle: verb.participle 
    }; 
  }); 
} 
 
function buildFoodItems(settings) { 
  const levelWords = FOOD_WORDS[settings.foodLevel]; 
  let source = settings.shuffle ? shuffleArray(levelWords) : levelWords.slice(); 
  source = source.slice(0, settings.wordCount); 
  return source.map(function (item) { 
    const acceptedAnswers = settings.direction === 'en_ru' ? uniqueValues(item.ru) : [item.en]; 
    return { 
      question: settings.direction === 'en_ru' ? item.en : firstValue(item.ru), 
      answer: acceptedAnswers.join(', '), 
      primaryAnswer: acceptedAnswers[0], 
      acceptedAnswers: acceptedAnswers 
    }; 
  }); 
} 
 
function buildCustomItems(list, settings) { 
  let source = settings.shuffle ? shuffleArray(list.entries) : list.entries.slice(); 
  source = source.slice(0, settings.wordCount); 
  return source.map(function (entry) { 
    const acceptedAnswers = settings.direction === 'en_ru' ? uniqueValues(entry.translations) : [entry.term]; 
    return { 
      question: settings.direction === 'en_ru' ? entry.term : entry.translations[0], 
      answer: acceptedAnswers.join(', '), 
      primaryAnswer: acceptedAnswers[0], 
      acceptedAnswers: acceptedAnswers, 
      entryId: entry.id 
    }; 
  }); 
} 
 
function buildHistoryLabel(settings) { 
  if (settings.topic === 'irregular_verbs') { 
    return '???????????? ???????'; 
  } 
  if (settings.topic === 'food') { 
    return '??? ? ???????'; 
  } 
  if (settings.topic === 'custom_list') { 
    return settings.listName ? '??? ??????: ' + settings.listName : '??? ??????'; 
  } 
  return '??????????'; 
} 
 
function formatDate(value) { 
  try { 
    return new Date(value).toLocaleString(); 
  } catch (error) { 
    return String(value); 
  } 
} 
 
function node(tag, className, children, props) { 
  const nextProps = props ? Object.assign({}, props) : {}; 
  if (className) { 
    nextProps.className = className; 
  } 
  return h(tag, nextProps, children); 
} 
 
function statPill(label, value) { 
  return node('div', 'stat-pill', [node('span', 'stat-pill-value', value), node('span', 'stat-pill-label', label)]); 
}
