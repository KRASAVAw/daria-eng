$ErrorActionPreference = "Stop"

function WriteUtf8NoBom([string]$path, [string]$content) {
  $utf8NoBom = New-Object System.Text.UTF8Encoding($false)
  [System.IO.File]::WriteAllText($path, $content, $utf8NoBom)
}

$root = "C:\sss"

# --- data stores ---
WriteUtf8NoBom "$root\src\data\storage.ts" @"
export function safeJsonParse<T>(value: string | null): T | null {
  if (!value) return null;
  try {
    return JSON.parse(value) as T;
  } catch {
    return null;
  }
}

export function loadFromStorage<T>(key: string, fallback: T): T {
  if (typeof localStorage === 'undefined') return fallback;
  const parsed = safeJsonParse<T>(localStorage.getItem(key));
  return parsed ?? fallback;
}

export function saveToStorage<T>(key: string, value: T) {
  if (typeof localStorage === 'undefined') return;
  localStorage.setItem(key, JSON.stringify(value));
}
"@

WriteUtf8NoBom "$root\src\data\historyStore.ts" @"
import { TestItem, TestSettings } from '../types';
import { loadFromStorage, saveToStorage } from './storage';

export type StoredTestResult = {
  item: TestItem;
  userAnswer: string;
  isCorrect: boolean;
};

export type StoredTestSession = {
  id: string;
  finishedAt: number;
  settings: TestSettings;
  results: StoredTestResult[];
};

export const HISTORY_STORAGE_KEY = 'dasha_english_history_v1';

export function loadHistory(): StoredTestSession[] {
  return loadFromStorage<StoredTestSession[]>(HISTORY_STORAGE_KEY, []);
}

export function addSession(session: StoredTestSession) {
  const prev = loadHistory();
  const next = [session, ...prev].slice(0, 200);
  saveToStorage(HISTORY_STORAGE_KEY, next);
  return next;
}

export function getSessionMistakeItems(session: StoredTestSession): TestItem[] {
  return session.results.filter((r) => !r.isCorrect).map((r) => r.item);
}
"@

WriteUtf8NoBom "$root\src\data\mistakes.ts" @"
import { TestItem, TestSettings } from '../types';
import { loadFromStorage, saveToStorage } from './storage';

export type MistakeTest = {
  id: string;
  finishedAt: number;
  settings: TestSettings;
  items: TestItem[];
};

export type MistakeTestsData = { tests: MistakeTest[] };

export const MISTAKE_TESTS_STORAGE_KEY = 'dasha_english_mistake_tests_v1';

export function loadMistakeTests(): MistakeTest[] {
  const data = loadFromStorage<MistakeTestsData>(MISTAKE_TESTS_STORAGE_KEY, { tests: [] });
  return data.tests;
}

export function saveMistakeTests(tests: MistakeTest[]) {
  saveToStorage<MistakeTestsData>(MISTAKE_TESTS_STORAGE_KEY, { tests });
}

export function addMistakeTest(test: MistakeTest) {
  const prev = loadMistakeTests();
  const next = [test, ...prev].slice(0, 200);
  saveMistakeTests(next);
  return next;
}

export function buildMistakeTestFromSession(
  finishedAt: number,
  settings: TestSettings,
  results: { item: TestItem; isCorrect: boolean }[],
): MistakeTest | null {
  const items = results.filter((r) => !r.isCorrect).map((r) => r.item);
  if (items.length === 0) return null;
  return {
    id: String(finishedAt) + '-' + Math.random().toString(16).slice(2),
    finishedAt,
    settings,
    items,
  };
}
"@

# --- UI: History screen ---
WriteUtf8NoBom "$root\src\components\History.tsx" @"
import { useEffect, useMemo, useState } from 'react';
import { ArrowLeft } from 'lucide-react';
import { motion } from 'motion/react';
import { TestItem, TestSettings, Topic } from '../types';
import { getSessionMistakeItems, loadHistory, StoredTestSession } from '../data/historyStore';

interface HistoryProps {
  onBack: () => void;
  onStartTest: (settings: TestSettings, items: TestItem[]) => void;
}

function topicTitle(topic: Topic) {
  if (topic === 'irregular_verbs') return 'Неправильные глаголы';
  if (topic === 'food') return 'Еда и напитки';
  return topic;
}

function formatDate(ms: number) {
  try {
    return new Date(ms).toLocaleString();
  } catch {
    return String(ms);
  }
}

export default function History({ onBack, onStartTest }: HistoryProps) {
  const [sessions, setSessions] = useState<StoredTestSession[]>([]);

  useEffect(() => {
    setSessions(loadHistory());
  }, []);

  const items = useMemo(() => {
    return sessions.map((s) => {
      const correctCount = s.results.filter((r) => r.isCorrect).length;
      const totalCount = s.results.length;
      const mistakeItems = getSessionMistakeItems(s);
      const percentage = totalCount > 0 ? Math.round((correctCount / totalCount) * 100) : 0;
      return { session: s, correctCount, totalCount, mistakeItems, percentage };
    });
  }, [sessions]);

  return (
    <motion.div
      initial={{ opacity: 0, x: 20 }}
      animate={{ opacity: 1, x: 0 }}
      exit={{ opacity: 0, x: -20 }}
      className="flex-1 min-h-0 flex flex-col"
    >
      <div className="flex items-center mb-6 mt-4 text-brand-white px-2">
        <button onClick={onBack} className="p-2 hover:bg-white/10 rounded-full transition-colors">
          <ArrowLeft size={24} />
        </button>
        <h2 className="ml-2 text-xl font-bold">История ответов</h2>
      </div>

      <div className="glass-panel rounded-3xl p-4 md:p-6 flex-1 min-h-0 flex flex-col mb-4 overflow-hidden">
        {items.length === 0 ? (
          <div className="flex-1 flex items-center justify-center text-center text-brand-grey">
            <div>
              <div className="text-brand-white font-bold mb-2">Пока нет истории</div>
              <div className="text-sm">Пройди любой тест — и тут появятся попытки.</div>
            </div>
          </div>
        ) : (
          <div className="flex-1 min-h-0 overflow-y-auto space-y-3 pr-1 md:pr-2 custom-scrollbar">
            {items.map(({ session, correctCount, totalCount, mistakeItems, percentage }) => (
              <div key={session.id} className="bg-brand-milk p-4 rounded-2xl">
                <div className="flex items-start justify-between gap-4">
                  <div className="min-w-0">
                    <div className="font-bold text-brand-white truncate">{topicTitle(session.settings.topic)}</div>
                    <div className="text-xs text-brand-grey mt-1">{formatDate(session.finishedAt)}</div>
                    <div className="text-xs text-brand-grey mt-1">
                      Верно: <span className="text-brand-white font-bold">{correctCount}</span> / {totalCount} ·{' '}
                      Ошибки: <span className="text-brand-white font-bold">{totalCount - correctCount}</span> ·{' '}
                      Балл: <span className="text-brand-white font-bold">{percentage}</span>/100
                    </div>
                  </div>

                  <div className="flex flex-col gap-2">
                    <button
                      onClick={() => onStartTest(session.settings, session.results.map((r) => r.item))}
                      className="px-4 py-2 bg-brand-white text-brand-red font-bold rounded-xl shadow hover:opacity-90 transition-opacity"
                    >
                      Повторить
                    </button>
                    <button
                      onClick={() => onStartTest(session.settings, mistakeItems)}
                      disabled={mistakeItems.length === 0}
                      className={
                        mistakeItems.length > 0
                          ? 'px-4 py-2 bg-brand-red text-brand-white font-bold rounded-xl shadow hover:opacity-90 transition-opacity'
                          : 'px-4 py-2 bg-brand-milk/60 text-brand-light-grey font-bold rounded-xl shadow cursor-not-allowed'
                      }
                    >
                      Учить ошибки
                    </button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </motion.div>
  );
}
"@

# --- UI: Results (add "Учить ошибки") ---
WriteUtf8NoBom "$root\src\components\Results.tsx" @"
import { Trophy, CheckCircle2, XCircle } from 'lucide-react';
import { TestItem } from '../types';
import { motion } from 'motion/react';

interface ResultsProps {
  results: { item: TestItem; userAnswer: string; isCorrect: boolean }[];
  onRestart: () => void;
  onPracticeMistakes: (items: TestItem[]) => void;
}

export default function Results({ results, onRestart, onPracticeMistakes }: ResultsProps) {
  const correctCount = results.filter((r) => r.isCorrect).length;
  const totalCount = results.length;
  const percentage = totalCount > 0 ? Math.round((correctCount / totalCount) * 100) : 0;
  const mistakeItems = results.filter((r) => !r.isCorrect).map((r) => r.item);
  const message =
    'Молодец, Даша! Ты завершила тест. Посмотри свои ответы ниже, радуйся и не грусти!';

  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.95 }}
      animate={{ opacity: 1, scale: 1 }}
      exit={{ opacity: 0, scale: 1.05 }}
      className="flex-1 min-h-0 flex flex-col"
    >
      <div className="flex flex-col items-center justify-center mb-4 mt-4 md:mb-6 md:mt-8 text-brand-white">
        <Trophy className="w-14 h-14 md:w-16 md:h-16 text-yellow-400 mb-3 md:mb-4 drop-shadow-lg" />
        <div className="flex items-center gap-4 w-full px-6 md:px-12">
          <div className="h-px bg-brand-white/30 flex-1"></div>
          <span className="font-bold tracking-widest uppercase text-sm">Результаты</span>
          <div className="h-px bg-brand-white/30 flex-1"></div>
        </div>
      </div>

      <div className="glass-panel rounded-3xl p-4 md:p-6 flex-1 min-h-0 flex flex-col mb-4 md:mb-6 overflow-hidden">
        <h3 className="text-center text-brand-white font-bold mb-4 md:mb-6">Оценка по тесту английского</h3>

        <div className="flex justify-between items-center mb-5 md:mb-8 px-2">
          <div className="text-center">
            <div className="text-2xl font-bold text-brand-red">{correctCount}</div>
            <div className="text-xs text-brand-grey font-bold uppercase mt-1">Верно</div>
          </div>
          <div className="text-center">
            <div className="text-5xl font-black text-brand-white">
              {percentage}
              <span className="text-2xl text-brand-grey">/100</span>
            </div>
            <div className="text-xs text-brand-grey font-bold uppercase mt-1">Балл</div>
          </div>
          <div className="text-center">
            <div className="text-2xl font-bold text-brand-white">{totalCount - correctCount}</div>
            <div className="text-xs text-brand-grey font-bold uppercase mt-1">Ошибки</div>
          </div>
        </div>

        <p className="text-sm text-brand-grey text-center mb-4 md:mb-6 px-2 leading-relaxed">{message}</p>

        <div className="flex-1 min-h-0 overflow-y-auto space-y-3 pr-1 md:pr-2 custom-scrollbar">
          {results.map((result, idx) => (
            <div key={idx} className="bg-brand-milk p-3 md:p-4 rounded-2xl flex items-start gap-3">
              <div className="mt-1">
                {result.isCorrect ? (
                  <CheckCircle2 className="text-green-600" size={20} />
                ) : (
                  <XCircle className="text-brand-red" size={20} />
                )}
              </div>
              <div className="flex-1">
                <div className="flex justify-between items-start mb-1">
                  <span className="font-bold text-brand-white">{result.item.question}</span>
                  <span className="text-sm font-bold text-brand-grey">{result.item.answer}</span>
                </div>
                {!result.isCorrect && (
                  <div className="text-sm text-brand-red bg-white px-2 py-1 rounded-lg inline-block mt-1 shadow-sm">
                    <span className="opacity-70 line-through mr-2">{result.userAnswer || 'Нет ответа'}</span>
                  </div>
                )}
              </div>
            </div>
          ))}
        </div>
      </div>

      <div className="flex gap-4 mb-4">
        {mistakeItems.length > 0 && (
          <button
            onClick={() => onPracticeMistakes(mistakeItems)}
            className="flex-1 py-4 bg-brand-red text-brand-white font-bold rounded-2xl shadow-lg shadow-brand-red/30 hover:opacity-90 transition-opacity"
          >
            Учить ошибки
          </button>
        )}
        <button
          onClick={onRestart}
          className="flex-1 py-4 bg-brand-white text-brand-red font-bold rounded-2xl shadow-lg hover:opacity-90 transition-opacity"
        >
          Еще раз
        </button>
      </div>
    </motion.div>
  );
}
"@

# --- UI: Home (add History button) ---
WriteUtf8NoBom "$root\src\components\Home.tsx" @"
import { BookOpen, Apple, History as HistoryIcon } from 'lucide-react';
import { Topic } from '../types';
import { motion } from 'motion/react';

interface HomeProps {
  onSelectTopic: (topic: Topic) => void;
  onOpenHistory: () => void;
}

export default function Home({ onSelectTopic, onOpenHistory }: HomeProps) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -20 }}
      className="flex-1 flex flex-col pt-0 min-h-0"
    >
      <div className="text-center mb-3 mt-2">
        <h1 className="text-4xl font-display text-brand-white mb-1 tracking-tight uppercase leading-tight">
          Английский<br />для Даши
        </h1>
        <p className="text-brand-milk opacity-90 text-sm">Выбери шо учить</p>

        <button
          onClick={onOpenHistory}
          className="mt-3 inline-flex items-center gap-2 px-4 py-2 bg-brand-white text-brand-red font-bold rounded-full shadow-lg hover:opacity-90 transition-opacity"
        >
          <HistoryIcon size={18} />
          История ответов
        </button>
      </div>

      <div className="flex-1 flex flex-col gap-4 mb-4 overflow-y-auto custom-scrollbar">
        <div className="glass-panel rounded-3xl p-6 flex-1 flex flex-col items-center text-center justify-center">
          <div className="w-16 h-16 rounded-full bg-brand-milk flex items-center justify-center text-brand-red mb-3">
            <BookOpen size={32} />
          </div>
          <div className="flex items-center gap-4 w-full px-4 mb-4">
            <div className="h-px bg-brand-milk flex-1"></div>
            <span className="font-bold text-brand-red tracking-widest uppercase text-sm text-center">Неправильные глаголы</span>
            <div className="h-px bg-brand-milk flex-1"></div>
          </div>
          <button
            onClick={() => onSelectTopic('irregular_verbs')}
            className="w-full max-w-[200px] py-3 bg-brand-red text-brand-white rounded-full font-bold shadow-lg shadow-brand-red/30 hover:opacity-90 transition-opacity"
          >
            Начать тест
          </button>
          <div className="mt-4 flex flex-col gap-1 text-xs text-brand-grey">
            <div>
              <span className="text-brand-red font-bold">75</span> Слов
            </div>
            <div>
              <span className="text-brand-red font-bold">Все</span> Формы
            </div>
          </div>
        </div>

        <div className="glass-panel rounded-3xl p-6 flex-1 flex flex-col items-center text-center justify-center">
          <div className="w-16 h-16 rounded-full bg-brand-milk flex items-center justify-center text-brand-red mb-3">
            <Apple size={32} />
          </div>
          <div className="flex items-center gap-4 w-full px-4 mb-4">
            <div className="h-px bg-brand-milk flex-1"></div>
            <span className="font-bold text-brand-red tracking-widest uppercase text-sm text-center">Еда и Напитки</span>
            <div className="h-px bg-brand-milk flex-1"></div>
          </div>
          <button
            onClick={() => onSelectTopic('food')}
            className="w-full max-w-[200px] py-3 bg-brand-red text-brand-white rounded-full font-bold shadow-lg shadow-brand-red/30 hover:opacity-90 transition-opacity"
          >
            Начать тест
          </button>
          <div className="mt-4 flex flex-col gap-1 text-xs text-brand-grey">
            <div>
              <span className="text-brand-red font-bold">30+</span> Слов
            </div>
            <div>
              <span className="text-brand-red font-bold">Случайный</span> Порядок
            </div>
          </div>
        </div>
      </div>
    </motion.div>
  );
}
"@

# --- App wiring: store history + route to History screen ---
WriteUtf8NoBom "$root\src\App.tsx" @"
/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { useState } from 'react';
import { Topic, TestSettings, TestItem } from './types';
import Home from './components/Home';
import Setup from './components/Setup';
import Test from './components/Test';
import Results from './components/Results';
import BackgroundHearts from './components/BackgroundHearts';
import History from './components/History';
import { addSession, StoredTestSession } from './data/historyStore';
import { addMistakeTest, buildMistakeTestFromSession } from './data/mistakes';

type Screen = 'home' | 'setup' | 'test' | 'results' | 'history';

type TestResult = { item: TestItem; userAnswer: string; isCorrect: boolean };

function makeId(prefix: number) {
  return String(prefix) + '-' + Math.random().toString(16).slice(2);
}

export default function App() {
  const [screen, setScreen] = useState<Screen>('home');
  const [topic, setTopic] = useState<Topic | null>(null);
  const [settings, setSettings] = useState<TestSettings | null>(null);
  const [testItems, setTestItems] = useState<TestItem[]>([]);
  const [results, setResults] = useState<TestResult[]>([]);

  const handleSelectTopic = (selectedTopic: Topic) => {
    setTopic(selectedTopic);
    setScreen('setup');
  };

  const handleStartTest = (newSettings: TestSettings, items: TestItem[]) => {
    setSettings(newSettings);
    setTestItems(items);
    setScreen('test');
  };

  const handleFinishTest = (testResults: TestResult[]) => {
    setResults(testResults);
    setScreen('results');

    if (!settings) return;

    const finishedAt = Date.now();
    const session: StoredTestSession = {
      id: makeId(finishedAt),
      finishedAt,
      settings,
      results: testResults,
    };

    addSession(session);

    const mistakesTest = buildMistakeTestFromSession(finishedAt, settings, testResults);
    if (mistakesTest) addMistakeTest(mistakesTest);
  };

  const handlePracticeMistakes = (items: TestItem[]) => {
    if (!settings) return;
    setTestItems(items);
    setScreen('test');
  };

  const handleRestart = () => {
    setScreen('home');
    setTopic(null);
    setSettings(null);
    setTestItems([]);
    setResults([]);
  };

  return (
    <div className="min-h-[100dvh] flex flex-col items-center justify-center p-4 md:p-8 overflow-hidden relative">
      <BackgroundHearts />
      <div className="w-full max-w-md md:max-w-lg flex flex-col h-[calc(100dvh-2rem)] max-h-[calc(100dvh-2rem)] md:h-[calc(100dvh-4rem)] md:max-h-[calc(100dvh-4rem)] min-h-0 relative z-10">
        {screen === 'home' && (
          <Home onSelectTopic={handleSelectTopic} onOpenHistory={() => setScreen('history')} />
        )}
        {screen === 'setup' && topic && (
          <Setup topic={topic} onStart={handleStartTest} onBack={() => setScreen('home')} />
        )}
        {screen === 'test' && settings && (
          <Test items={testItems} settings={settings} onFinish={handleFinishTest} onQuit={() => setScreen('home')} />
        )}
        {screen === 'results' && (
          <Results results={results} onRestart={handleRestart} onPracticeMistakes={handlePracticeMistakes} />
        )}
        {screen === 'history' && (
          <History onBack={() => setScreen('home')} onStartTest={handleStartTest} />
        )}
      </div>
    </div>
  );
}
"@

Write-Host "OK: history + mistakes practice added."
