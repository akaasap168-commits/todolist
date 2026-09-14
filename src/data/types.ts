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
