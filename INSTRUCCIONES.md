# Cómo usar este kit

## Requisitos

1. **Visual Studio Code** instalado (descarga en https://code.visualstudio.com)
2. **Extensión de Claude Code** instalada desde el marketplace de VS Code (busca "Claude Code" en extensiones)
3. **Node.js** instalado (descarga en https://nodejs.org — versión LTS). Necesario para que Claude acceda a Instagram automáticamente. Si no lo tienes, la skill sigue funcionando pero te pedirá los datos a mano.

## Paso 1 — Abrir este proyecto

1. Abre VS Code
2. Archivo → Abrir carpeta → selecciona esta carpeta (`kit-instagram-web`)
3. Abre Claude Code desde el panel lateral de VS Code

## Paso 2 — Pedir tu web

Escribe:

> Convierte mi Instagram en una web

Claude te pedirá tu @handle y empezará a trabajar. El proceso:

1. Claude entra a tu Instagram y descarga tus fotos y datos
2. Te busca en otras redes para sumar seguidores
3. Te pregunta servicios, email y colores
4. Genera la web y la abre en tu navegador

## Paso 3 — Ajustar

Si quieres cambiar algo, díselo:

> "Cambia los colores a azul y blanco"
> "Quita la sección de testimonios"
> "Añade mi número de teléfono"

## Paso 4 — Publicar (opcional)

Tu web es un único archivo HTML. Para ponerla online:
- Arrástrala a **Netlify** (netlify.com) — gratis, en 30 segundos
- Súbela a tu hosting actual
- Comparte el archivo directamente

Recuerda subir también la carpeta `assets/` con las fotos.

## Estructura

```
kit-instagram-web/
├── CLAUDE.md                        <- Claude lo lee automáticamente
├── INSTRUCCIONES.md                 <- Este archivo
├── .claude/
│   └── skills/
│       └── 02-instagram-a-web.md    <- La skill
└── assets/
    └── instagram/                   <- Aquí se descargan las fotos de tu perfil
```
