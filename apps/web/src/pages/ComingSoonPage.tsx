import { PageHeader } from '@/components/ui';

export interface Module {
  title: string;
  phase: number;
  summary: string;
  points: string[];
}

export const MODULES: Record<string, Module> = {
  floor: {
    title: 'Office Floor',
    phase: 3,
    summary: "See who's in, where they are, and walk into a room.",
    points: ['Rooms for each department, meetings, the pantry and managers', 'Live status: available, in a meeting, busy, on break, away', 'Knock to join a private room'],
  },
  meetings: {
    title: 'Meetings',
    phase: 4,
    summary: 'Video calls in the browser, from a quick drop-in to the weekly standup.',
    points: ['Screen sharing, chat, raise hand', 'Scheduled and recurring meetings with reminders', 'Google Calendar / Outlook sync and attendance per meeting'],
  },
  chat: {
    title: 'Chat',
    phase: 5,
    summary: 'Direct messages, department channels and company announcements.',
    points: ['@mentions, reactions, file sharing, search', 'Pinned announcements on everyone’s home screen'],
  },
  tasks: {
    title: 'Tasks',
    phase: 6,
    summary: 'A simple To do / In progress / Done list, plus the end-of-day report.',
    points: ['Personal and team tasks', 'End-of-day report that managers can see'],
  },
  attendance: {
    title: 'Attendance',
    phase: 2,
    summary: 'Clock in and out, breaks, schedules and your attendance history.',
    points: ['Late, early-out, missed clock-out and overtime flags', 'Timesheet corrections approved by your manager'],
  },
  leave: {
    title: 'Leave',
    phase: 6,
    summary: 'File vacation, sick and emergency leave and track your balance.',
    points: ['Manager approval with email and in-app notifications', 'Approved leave shows on the team calendar'],
  },
  reports: {
    title: 'Reports',
    phase: 7,
    summary: 'Attendance, tardiness, overtime, meeting attendance and login history.',
    points: ['Filter by date, department or person', 'Export to CSV, Excel or PDF'],
  },
};

export function ComingSoonPage({ module }: { module: keyof typeof MODULES }) {
  const m = MODULES[module];
  return (
    <div>
      <PageHeader title={m.title} description={m.summary} />
      <div className="rounded-card border border-dashed border-line bg-surface/60 p-6">
        <p className="font-medium">Arrives in phase {m.phase} of the rollout.</p>
        <ul className="mt-3 list-disc space-y-1 pl-5 text-muted">
          {m.points.map((p) => (
            <li key={p}>{p}</li>
          ))}
        </ul>
      </div>
    </div>
  );
}
