'use client';
import { createContext, useCallback, useContext, useMemo, useRef, useState, type ReactNode } from 'react';
import type { Copy, ShirtDesign } from '@/lib/design/types';
import type { Reaction, ReactionValue } from '@/lib/engine/types';
import { http } from '@/lib/client/http';
import type { BackOption, BriefPatch, ProjectState, ShirtOption } from '@/lib/server/studio';

interface ProjectApi {
  state: ProjectState;
  /** Unreviewed designs, best first. */
  deck: ShirtOption[];
  myReaction: (optionId: string) => ReactionValue | undefined;
  otherLoves: (optionId: string) => boolean;
  /** Everyone in the household who loves a design, you included, in household order. */
  lovers: (optionId: string) => { id: string; name: string }[];
  /** How many people are in the household. */
  members: number;
  /** Designs you love and someone else does too, the most-loved first. */
  matches: ShirtOption[];
  /** A design that isn't archived (Browse, Compare, Approve). */
  option: (id: string) => ShirtOption | undefined;
  /** Any design, archived or not (a design's own page). */
  anyOption: (id: string) => ShirtOption | undefined;
  /** Puts a design away for everyone, or brings it back. */
  setArchived: (id: string, archived: boolean) => Promise<void>;
  react: (optionId: string, value: ReactionValue | null) => Promise<void>;
  remix: (parentId?: string | null, count?: number) => Promise<ShirtOption[]>;
  saveBrief: (patch: BriefPatch) => Promise<void>;
  addOptions: (options: ShirtOption[], toFront?: boolean) => void;
  /** Backs, best first: ones you love with others (most-loved first), your hearts, theirs, new ones, then passes. */
  backs: BackOption[];
  backOption: (id: string) => BackOption | undefined;
  anyBack: (id: string) => BackOption | undefined;
  backMatches: BackOption[];
  /** The front the backs are shown with: your top match, else your top heart, else Joel's original. */
  referenceFront: ShirtOption | undefined;
  remixBacks: (opts?: { parentId?: string | null; template?: string; count?: number }) => Promise<BackOption[]>;
  addBacks: (options: BackOption[]) => void;
  /** Whose name a jersey back shows for you. */
  wearer: string;
  refresh: () => Promise<void>;
  setState: (s: ProjectState) => void;
}

const Ctx = createContext<ProjectApi | null>(null);

export function ProjectProvider({ initial, children }: { initial: ProjectState; children: ReactNode }) {
  const [state, setState] = useState(initial);
  // Designs Erin just asked for jump the queue.
  const [front, setFront] = useState<string[]>([]);
  const stateRef = useRef(state);
  stateRef.current = state;
  const id = state.project.id;
  const me = state.me.id;

  const mine = useMemo(() => {
    const m = new Map<string, ReactionValue>();
    for (const r of state.reactions) if (r.userId === me) m.set(r.optionId, r.value);
    return m;
  }, [state.reactions, me]);

  /** How many people besides you love each design (passes and maybes aren't sent, so they can't count). */
  const othersLoved = useMemo(() => {
    const m = new Map<string, number>();
    for (const r of state.reactions) if (r.userId !== me && r.value === 'love') m.set(r.optionId, (m.get(r.optionId) ?? 0) + 1);
    return m;
  }, [state.reactions, me]);
  const loveCount = useCallback((oid: string) => (othersLoved.get(oid) ?? 0) + (mine.get(oid) === 'love' ? 1 : 0), [othersLoved, mine]);

  const deck = useMemo(() => {
    const unseen = state.options.filter((o) => !mine.has(o.id));
    const frontIdx = new Map(front.map((fid, i) => [fid, i]));
    const rank = (o: ShirtOption) => {
      if (frontIdx.has(o.id)) return frontIdx.get(o.id)!;
      if (o.source === 'seed') return 1000;
      // The more people love it, the sooner you see it.
      if (othersLoved.has(o.id)) return 2000 - othersLoved.get(o.id)!;
      if (o.createdBy === me) return 3000;
      return 4000;
    };
    return unseen.sort((a, b) => rank(a) - rank(b) || (rank(a) === 3000 ? b.createdAt.localeCompare(a.createdAt) : a.createdAt.localeCompare(b.createdAt)));
  }, [state.options, mine, othersLoved, front, me]);

  const matches = useMemo(
    () => state.options.filter((o) => mine.get(o.id) === 'love' && othersLoved.has(o.id)).sort((a, b) => loveCount(b.id) - loveCount(a.id)),
    [state.options, mine, othersLoved, loveCount],
  );

  const backMatches = useMemo(
    () => state.backs.filter((o) => mine.get(o.id) === 'love' && othersLoved.has(o.id)).sort((a, b) => loveCount(b.id) - loveCount(a.id)),
    [state.backs, mine, othersLoved, loveCount],
  );

  const backs = useMemo(() => {
    const rank = (o: BackOption) => {
      const m = mine.get(o.id);
      // Loved with others: the more people, the higher.
      if (m === 'love' && othersLoved.has(o.id)) return -othersLoved.get(o.id)!;
      if (m === 'love') return 1;
      if (othersLoved.has(o.id)) return 2;
      if (m === 'maybe') return 3;
      if (m === 'pass') return 9;
      return 4;
    };
    return [...state.backs].sort((a, b) => rank(a) - rank(b) || a.createdAt.localeCompare(b.createdAt));
  }, [state.backs, mine, othersLoved]);

  const referenceFront = useMemo(
    () =>
      matches[0] ??
      state.options.find((o) => mine.get(o.id) === 'love') ??
      state.options.find((o) => othersLoved.has(o.id)) ??
      state.options.find((o) => o.source === 'seed') ??
      state.options[0],
    [matches, state.options, mine, othersLoved],
  );

  // The last request sent for each design, so the next one waits its turn.
  const sending = useRef(new Map<string, Promise<unknown>>());

  const react = useCallback(
    async (optionId: string, value: ReactionValue | null) => {
      const isMine = (r: Reaction) => r.optionId === optionId && r.userId === me;
      const set = (r: Reaction | undefined) =>
        // From the latest state, so several reactions at once (Pass on the rest) all stick.
        setState((s) => ({ ...s, reactions: [...s.reactions.filter((x) => !isMine(x)), ...(r ? [r] : [])] }));
      const before = stateRef.current.reactions.find(isMine);
      set(value ? { projectId: id, optionId, userId: me, value, updatedAt: new Date().toISOString() } : undefined);
      setFront((f) => f.filter((x) => x !== optionId));
      // One design's reactions reach the server in the order they were made, so a
      // quick Undo can't arrive before the heart it undoes.
      const sent = (sending.current.get(optionId) ?? Promise.resolve())
        .catch(() => undefined)
        .then(() => http(`/api/projects/${id}/react`, { body: { optionId, value } }));
      sending.current.set(optionId, sent);
      try {
        await sent;
      } catch (e) {
        set(before);
        throw e;
      } finally {
        if (sending.current.get(optionId) === sent) sending.current.delete(optionId);
      }
    },
    [id, me],
  );

  const addOptions = useCallback((options: ShirtOption[], toFront = true) => {
    setState((s) => ({ ...s, options: [...s.options.filter((o) => !options.some((n) => n.id === o.id)), ...options] }));
    if (toFront) setFront((f) => [...options.map((o) => o.id), ...f]);
  }, []);

  const remix = useCallback(
    async (parentId?: string | null, count = 6) => {
      const res = await http<{ options: ShirtOption[] }>(`/api/projects/${id}/remix`, { body: { parentId: parentId ?? null, count } });
      addOptions(res.options);
      return res.options;
    },
    [id, addOptions],
  );

  const addBacks = useCallback((options: BackOption[]) => {
    setState((s) => ({ ...s, backs: [...s.backs.filter((o) => !options.some((n) => n.id === o.id)), ...options] }));
  }, []);

  const remixBacks = useCallback(
    async (opts: { parentId?: string | null; template?: string; count?: number } = {}) => {
      const res = await http<{ options: BackOption[] }>(`/api/projects/${id}/backs`, { body: opts });
      addBacks(res.options);
      return res.options;
    },
    [id, addBacks],
  );

  const saveBrief = useCallback(
    async (patch: BriefPatch) => {
      const next = await http<ProjectState>(`/api/projects/${id}`, { method: 'PATCH', body: patch });
      setState(next);
    },
    [id],
  );

  const setArchived = useCallback(
    async (oid: string, archived: boolean) => {
      const { option } = await http<{ option: ShirtOption | BackOption }>(`/api/projects/${id}/design-archive`, { body: { optionId: oid, archived } });
      // Moves between the live and archived lists, newest archived first.
      const move = <T extends { id: string; archived?: unknown }>(live: T[], away: T[]) => {
        const rest = (l: T[]) => l.filter((o) => o.id !== oid);
        return archived ? { live: rest(live), away: [option as unknown as T, ...rest(away)] } : { live: [...rest(live), option as unknown as T], away: rest(away) };
      };
      setState((s) => {
        if (option.kind === 'back') {
          const m = move(s.backs, s.archivedBacks);
          return { ...s, backs: m.live, archivedBacks: m.away };
        }
        const m = move(s.options, s.archived);
        return { ...s, options: [...m.live].sort((a, b) => a.createdAt.localeCompare(b.createdAt)), archived: m.away };
      });
    },
    [id],
  );

  const refresh = useCallback(async () => {
    setState(await http<ProjectState>(`/api/projects/${id}`));
  }, [id]);

  const value: ProjectApi = {
    state,
    deck,
    myReaction: (oid) => mine.get(oid),
    otherLoves: (oid) => othersLoved.has(oid),
    lovers: (oid) =>
      state.members.filter((m) => (m.id === me ? mine.get(oid) === 'love' : state.reactions.some((r) => r.optionId === oid && r.userId === m.id && r.value === 'love'))),
    members: Math.max(state.members.length, 2),
    matches,
    option: (oid) => state.options.find((o) => o.id === oid),
    anyOption: (oid) => state.options.find((o) => o.id === oid) ?? state.archived.find((o) => o.id === oid),
    setArchived,
    react,
    remix,
    saveBrief,
    addOptions,
    refresh,
    setState,
    backs,
    backOption: (oid) => state.backs.find((o) => o.id === oid),
    anyBack: (oid) => state.backs.find((o) => o.id === oid) ?? state.archivedBacks.find((o) => o.id === oid),
    backMatches,
    referenceFront,
    remixBacks,
    addBacks,
    wearer: state.facts.people.find((p) => p.trim().toLowerCase() === state.me.name.toLowerCase()) ?? state.facts.people[0] ?? state.me.name,
  };
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useProject(): ProjectApi {
  const v = useContext(Ctx);
  if (!v) throw new Error('useProject outside ProjectProvider');
  return v;
}

/** The words a given design prints. */
export function useCopyFor(design: ShirtDesign): Copy {
  const { state } = useProject();
  return design.copyOverride ?? state.project.brief.copy;
}

type Household = { me: { id: string }; members: { id: string; name: string }[] };

/** Everyone else in the household, by name: "Erin", "Erin and Sam", "Erin, Sam and Alex". */
export function otherName(state: Household): string {
  const others = state.members.filter((m) => m.id !== state.me.id).map((m) => m.name);
  if (!others.length) return 'Nobody else';
  return others.length === 1 ? others[0] : `${others.slice(0, -1).join(', ')} and ${others[others.length - 1]}`;
}

/** Someone in the household, by id. */
export function nameIn(state: Household, id: string | undefined): string {
  return state.members.find((m) => m.id === id)?.name ?? 'Someone';
}
