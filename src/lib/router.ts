import { useEffect, useState } from 'react';

// Tiny hash router: notification links like "/#/task/12" open straight into the app.
export type Route =
  | { name: 'tasks' }
  | { name: 'task'; id: number }
  | { name: 'stats' }
  | { name: 'archive' }
  | { name: 'settings' }
  | { name: 'ios' };

export function parseHash(hash: string): Route {
  const parts = hash.replace(/^#\/?/, '').split('/').filter(Boolean);
  switch (parts[0]) {
    case 'task':
      return Number(parts[1]) ? { name: 'task', id: Number(parts[1]) } : { name: 'tasks' };
    case 'stats':
    case 'archive':
    case 'settings':
    case 'ios':
      return { name: parts[0] };
    default:
      return { name: 'tasks' };
  }
}

export function navigate(path: string) {
  window.location.hash = path;
}

export function useRoute(): Route {
  const [route, setRoute] = useState(() => parseHash(window.location.hash));
  useEffect(() => {
    const on = () => setRoute(parseHash(window.location.hash));
    window.addEventListener('hashchange', on);
    return () => window.removeEventListener('hashchange', on);
  }, []);
  return route;
}
