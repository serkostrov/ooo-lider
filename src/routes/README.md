# Routes

Маршруты — **file-based routing** TanStack Router (Vite SPA). Каждый `.tsx` в этой папке задаёт маршрут. Не создавайте `src/pages/` или `app/` — корневой layout только в `__root.tsx`.

## Conventions

| File | URL |
| --- | --- |
| `index.tsx` | `/` |
| `about.tsx` | `/about` |
| `users/index.tsx` | `/users` |
| `users/$id.tsx` | `/users/:id` |
| `_layout.tsx` | layout (дети через `<Outlet />`) |
| `__root.tsx` | оболочка приложения |

`routeTree.gen.ts` генерируется плагином — не править вручную.
