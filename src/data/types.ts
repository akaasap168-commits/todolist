export interface Category {
  id: string;
  name: string;
  color: string;
}

export type LaneKind = 'vision' | 'real';

export interface Block {
  id: string;
  start: number; // minutes from 0:00
  end: number;
  title: string;
  categoryId?: string;
  taskId?: string;
  note?: string;
  running?: boolean; // real only: currently being recorded
  gcalSync?: boolean; // vision only: should exist in Google Calendar
  gcalEventId?: string;
}

export interface Priority {
  text: string;
  done: boolean;
  taskId?: string;
}

export interface DayDoc {
  priorities: Priority[];
  vision: Block[];
  real: Block[];
  note?: string;
}

export interface WeekDoc {
  priorities: Priority[];
  microSuccess: Priority[];
  evaluation: Priority[];
}

export interface Task {
  id: string;
  title: string;
  notes?: string;
  categoryId?: string;
  dueDate?: string; // yyyy-MM-dd
  estimateMin?: number;
  order: number;
  done: boolean;
  doneAt?: number;
  createdAt: number;
  updatedAt: number;
}

export interface Settings {
  dayStart: number; // hour
  dayEnd: number; // hour
  weekStartsOn: 0 | 1;
  categories: Category[];
  weeklySectionRows: number;
  pomodoro: PomodoroSettings;
  gcal: {
    importCalendarIds: string[];
    exportCalendarId: string;
  };
}

/** An event read from Google Calendar (not stored). */
export interface ExternalEvent {
  id: string;
  calendarId: string;
  title: string;
  date: string;
  start: number;
  end: number;
  allDay: boolean;
  color?: string;
}

/** Pomodoro timer and its background sound. Phase progress itself stays on the device. */
export interface PomodoroSettings {
  preset: 25 | 50; // focus length; the break is 5 or 10 to match
  autoRecord: boolean; // write a finished focus phase into the Real lane
  recordCategoryId?: string;
  notify: boolean;
  chime: boolean;
  /** 'none' | a built-in ambient id | `file:<id>` for one of the user's own files */
  focusSound: string;
  focusVolume: number; // 0..1
  breakSource: 'none' | 'spotify' | 'file';
  breakFileId?: string;
  breakVolume: number;
  spotify: {
    contextUri: string; // playlist / album to play on a break
    contextName: string; // shown in settings, so the name survives a reload
    deviceId: string; // '' = this tab
    shuffle: boolean;
  };
}

/** A saved day shape that can be applied to any date. */
export interface TemplateBlock {
  start: number;
  end: number;
  title: string;
  categoryId?: string;
}

export interface Template {
  id: string;
  name: string;
  blocks: TemplateBlock[];
  priorities?: string[];
  createdAt: number;
  updatedAt: number;
}

/** The sticky note: one short, temporary memo. */
export interface Scratch {
  text: string;
  updatedAt: number;
}
