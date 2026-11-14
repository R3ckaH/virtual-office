import { useQueryClient } from '@tanstack/react-query';
import { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useToast } from '@/components/ui/toast';
import { usePresence } from './presence';

/** Pop-ups for leave decisions, new tasks and reminders, and live refresh of those lists. Mounted once. */
export function NoticeLive() {
  const { on } = usePresence();
  const toast = useToast();
  const navigate = useNavigate();
  const qc = useQueryClient();
  useEffect(() => {
    const offs = [
      on('notice', (n) => toast(`${n.title}: ${n.body}`, 'info', n.link ? { label: 'Open', onClick: () => navigate(n.link!) } : undefined)),
      on('leave:changed', () => {
        void qc.invalidateQueries({ queryKey: ['leave'] });
        void qc.invalidateQueries({ queryKey: ['dashboard'] });
      }),
      on('tasks:changed', () => {
        void qc.invalidateQueries({ queryKey: ['tasks'] });
        void qc.invalidateQueries({ queryKey: ['daily-report'] });
        void qc.invalidateQueries({ queryKey: ['dashboard'] });
      }),
    ];
    return () => offs.forEach((off) => off());
  }, [on, toast, navigate, qc]);
  return null;
}
