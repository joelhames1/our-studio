'use client';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { http } from '@/lib/client/http';
import type { ProjectState } from '@/lib/server/studio';
import { useProject } from './ProjectProvider';
import { toast } from './Toast';

/** "Go back to choosing" for whoever has the final say: sets the print files aside and opens Favorites. */
export function useReopen() {
  const { state, setState } = useProject();
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const reopen = async () => {
    if (!confirm('Go back to choosing? The current print files will be set aside.')) return;
    setBusy(true);
    try {
      setState(await http<ProjectState>(`/api/projects/${state.project.id}/reopen`, { body: {} }));
      router.push(`/p/${state.project.id}/favorites`);
    } catch (e) {
      toast((e as Error).message, 'error');
      setBusy(false);
    }
  };
  return { reopen, busy };
}
