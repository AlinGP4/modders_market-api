Quiero que construyas una interfaz web para este backend existente (NO inventes backend nuevo). Usa esta especificación exacta.

Producto: marketplace freelance de modders (clientes publican trabajos, devs envían propuestas, cliente acepta una propuesta).

Stack backend:
- NestJS + TypeScript
- Base URL local: http://localhost:3000
- Swagger: http://localhost:3000/api
- CORS permitido para http://localhost:3000 y http://localhost:4200
- Validación global activa (whitelist + forbidNonWhitelisted + transform)

Autenticación:
- Se usa Supabase Auth.
- El frontend debe hacer login/registro con Supabase directamente y guardar el access token.
- Para endpoints protegidos enviar header: Authorization: Bearer <token>.
- El backend valida el token con supabase.auth.getUser(token).
- Si falta token o es inválido, tratar como no autorizado.

Modelo de datos (inferido por consultas del backend):

Tabla users:
- id: string/uuid (PK interna app)
- supabase_user_id: string/uuid (id del usuario en Supabase Auth)
- role: 'client' | 'dev' | 'admin'
- name: string
- bio: string nullable
- specialties: string[] (especialidades)
- games: string[] (juegos)
- discord: string nullable
- portfolio_links: objeto clave/valor nullable
- avatar_url: string nullable
- rating_avg: number nullable
- jobs_completed: number nullable

Tabla jobs:
- id: string/uuid
- client_id: uuid -> users.id
- title: string
- description: string nullable
- game_type: string (valores usados: fivem, minecraft, gta)
- task_type: string (valores usados: script, plugin, mlo, car, ui)
- job_images: string[] (urls publicas optimizadas en Cloudflare R2)
- cover_image_url: string nullable
- budget_min: number nullable
- budget_max: number nullable
- duration_days: number nullable
- status: string (se usa 'open' para listados)
- created_at: datetime

Tabla proposals:
- id: string/uuid
- job_id: uuid -> jobs.id
- dev_id: uuid -> users.id
- message: string
- proposed_price: number
- proposed_days: number
- status: string
- created_at: datetime

Tabla messages (solo lectura en backend actual):
- id, proposal_id, sender_id, content, created_at
- En consultas se expande sender:users(name)

RPC en Supabase:
- accept_proposal_rpc(prop_id, client_supabase_id)
- El frontend debe asumir que esta operación acepta propuesta y cambia estado de job/proposal en backend.

Endpoints disponibles:

1) GET /jobs
- Público
- Query opcionales: game_type, task_type
- Devuelve trabajos abiertos (status='open') ordenados por created_at desc
- Respuesta: Job[]

2) GET /jobs/:id
- Público
- Devuelve detalle del job + client + proposals del job
- Respuesta incluye:
  - campos del job
  - client: { name, avatar_url }
  - proposals: [{ ..., dev: { name, avatar_url, specialties, rating_avg } }]

3) POST /jobs
- Protegido (Bearer token)
- `multipart/form-data`:
  - title (string, requerido)
  - description (string, opcional)
  - game_type (string, requerido)
  - task_type (string, requerido)
  - budget_min (number >=10, opcional)
  - budget_max (number >=10, opcional)
  - duration_days (number >=1, opcional)
  - cover_image_index (number >=0, opcional)
  - images[] (archivos opcionales: JPG/PNG/WEBP/AVIF, max 6, optimizadas a WEBP y publicadas en Cloudflare R2)
- Crea job con client_id derivado del usuario autenticado (users.supabase_user_id -> users.id)

4) GET /users
- Publico
- Lista perfiles publicos de usuarios
- Campos: id, role, name, bio, specialties, games, discord, avatar_url, rating_avg, jobs_completed

5) GET /users/devs
- Público
- Lista perfiles dev ordenados por rating_avg desc
- Campos: id, name, bio, specialties, games, discord, rating_avg, jobs_completed

6) GET /users/me
- Protegido
- Devuelve perfil completo del usuario autenticado (lookup por supabase_user_id)

7) PATCH /users/me
- Protegido
- Actualiza perfil del usuario autenticado
- Body esperado (DTO actual):
  - name (string, requerido)
  - bio (string, opcional)
  - specialties (array string, requerido, mínimo 1)
  - games (array string, requerido)
  - discord (string, opcional)
  - portfolio_links (objeto opcional)
- Importante: aunque sea PATCH, el backend exige name/specialties/games por validación DTO.

7) POST /proposals/:jobId
- Protegido
- Solo devs pueden proponer (backend valida role='dev')
- Job debe estar open
- Body:
  - message (string, requerido)
  - proposed_price (number >=10, requerido)
  - proposed_days (number >=1, requerido)
- Respuesta incluye propuesta + dev expandido

8) GET /proposals/job/:jobId
- Público
- Devuelve propuestas del job ordenadas por created_at desc
- Incluye dev y messages con sender.name

9) PATCH /proposals/:proposalId/accept
- Protegido
- Acción de cliente para aceptar propuesta (validación real dentro de RPC)
- Respuesta: resultado de accept_proposal_rpc

Pantallas que debes construir:
- Home/Marketplace de jobs con filtros game_type y task_type.
- Detalle de job con lista de propuestas.
- Formulario crear job (solo usuario autenticado).
- Listado de devs (directorio).
- Perfil “Mi cuenta” (ver + editar).
- Formulario enviar propuesta dentro de job (solo dev autenticado).
- Vista de propuestas por job + mensajes (solo lectura de mensajes).
- Acción “Aceptar propuesta” para cliente en cada propuesta.

Requisitos de frontend:
- Cliente API centralizado con manejo de Authorization Bearer.
- Manejo de estados loading/empty/error por pantalla.
- Manejo de errores 401/403/400 con mensajes de UI.
- Validación de formularios alineada con DTOs del backend.
- Tipado fuerte de respuestas (TypeScript interfaces).
- No inventar endpoints no listados.
- Si falta una capacidad (ej: crear mensajes/chat en vivo), mostrar UI de solo lectura o placeholder explícito.

Supuestos importantes:
- Login/signup y gestión de sesión ocurren en Supabase cliente.
- El backend no expone endpoints de auth propios.
- Existe una tabla users sincronizada con supabase_user_id para cada usuario autenticado.
