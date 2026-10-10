import { createContext, useContext } from 'react';
import type { Data } from './useData';
import type { Profile } from './types';

export interface AppState extends Data {
  me: Profile;
  other: Profile;
  isAdmin: boolean;
  name: (id: string | null | undefined) => string;
  /** Picks the masculine or feminine form of a word for this person. */
  g: (p: Profile, masculine: string, feminine: string) => string;
}

export const AppCtx = createContext<AppState | null>(null);

export function useApp(): AppState {
  const v = useContext(AppCtx);
  if (!v) throw new Error('AppCtx missing');
  return v;
}
