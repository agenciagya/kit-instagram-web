---
name: instagram-a-web
description: "Convierte un perfil de Instagram en una web de marca personal profesional. Usa esta skill cuando el usuario quiera crear una web desde su Instagram, convertir su perfil en web, hacer una web de marca personal, o cualquier variación de generar un sitio web a partir de un perfil de Instagram. Triggers: 'convierte mi Instagram en web', 'web de marca personal', 'web desde mi Instagram', 'quiero una web como mi perfil', 'web para influencer', 'web para creador de contenido', 'landing de marca personal', 'web desde mi @'."
---

# Instagram → Web de Marca Personal

Conviertes un perfil de Instagram en una web profesional de marca personal. La web debe reflejar la identidad, estilo y personalidad del perfil real.

**Regla fundamental: no inventes ningún dato.** No inventes servicios, precios, testimonios, clientes ni biografía. Todo sale del perfil real o lo proporciona el usuario.

---

## Paso 1 — Obtener los datos y fotos del perfil

Pide al usuario su **@handle de Instagram**.

### 1A. Extracción automática (intentar siempre primero)

Intenta extraer datos y fotos del perfil en este orden de prioridad:

**Opción 1 — Firecrawl MCP** (si está disponible):
Úsalo para scrapear `https://www.instagram.com/[handle]/`. Extrae datos del perfil e imágenes.

**Opción 2 — Playwright** (instalar automáticamente si no está):

Verifica si está disponible e instálalo si no:
```bash
# Verificar e instalar si falta
node -e "require('playwright')" 2>/dev/null || (npm install playwright && npx playwright install chromium)
```

**Importante**: antes de ejecutar la instalación, avisa al usuario para que no se asuste:
> "Estoy preparando las herramientas para acceder a Instagram. La primera vez tarda un poco (30-60 segundos), solo pasa una vez."

Si la instalación falla (permisos, sin Node.js, etc.), no te bloquees — salta al paso 1D y pregunta al usuario. Dile de forma amigable:
> "No he podido instalar las herramientas de navegación automática. No pasa nada — te pediré los datos directamente y la web quedará igual de bien."

Con Playwright disponible, crea y ejecuta un script que:
1. Navegue a `https://www.instagram.com/[handle]/`
2. Espere a que cargue el perfil (esperar selector de bio o timeout)
3. Extraiga del DOM: nombre, bio, categoría, stats (seguidores/posts/seguidos), link en bio
4. Extraiga las URLs de las imágenes de los posts visibles en el grid
5. Descargue las imágenes a `assets/instagram/`
6. Descargue la foto de perfil a `assets/instagram/profile.jpg`

Consejos para el scraping de Instagram:
- Los meta tags (`og:description`, `og:title`, `og:image`) son lo más fiable — suelen contener nombre, stats y foto de perfil
- El formato del meta description suele ser: "X Followers, Y Following, Z Posts - bio text"
- Las imágenes de posts están en tags `<img>` dentro del grid — filtra las que no sean iconos o avatares pequeños
- Instagram cambia selectores con frecuencia — si uno falla, prueba alternativas
- Haz scroll para cargar más imágenes si el grid inicial tiene pocas

**Opción 3 — WebFetch**:
Descarga `https://www.instagram.com/[handle]/` y parsea lo que puedas del HTML.

### 1B. Extracción de otras redes sociales

Después de obtener los datos de Instagram, busca al usuario en otras plataformas para:
- **Sumar seguidores totales** entre todas las redes (Instagram + Threads + TikTok + YouTube + LinkedIn + X + Skool, etc.)
- **Obtener más contexto** sobre su actividad profesional
- **Encontrar testimonios** en páginas de formación (Skool, academias, etc.)

Usa WebSearch para buscar el nombre + handle del usuario en otras plataformas. Si tiene comunidades (Skool, Discord, etc.), busca también los testimonios publicados ahí.

Para cada red encontrada, intenta obtener el número de seguidores con Playwright o WebFetch. Si no puedes, pregunta al usuario.

### 1C. Lo que necesitas extraer

**Datos del perfil de Instagram:**
- Nombre completo
- Bio / descripción
- Categoría profesional
- Número de seguidores, seguidos y publicaciones
- Link en bio
- Foto de perfil

**Fotos de posts (el objetivo principal):**
- Las imágenes visibles del grid de posts (las primeras 6-12)
- Descárgalas a `assets/instagram/post-1.jpg`, `post-2.jpg`, etc.
- Estas fotos se usarán en la galería/portfolio y en el hero de la web

**Datos de otras redes:**
- Seguidores en cada plataforma encontrada
- Total de comunidad sumando todas las redes
- Testimonios de clientes/alumnos si existen en plataformas públicas

### 1D. Si el scraping falla o es parcial

Dile al usuario de forma clara y amigable:

> "No he podido acceder a tu perfil automáticamente (Instagram lo bloquea bastante). Necesito que me ayudes con dos cosas:
>
> 1. **Tus datos**: cópiame tu bio, a qué te dedicas, servicios con precios, email y redes
> 2. **Tus fotos**: descarga 6-12 fotos de tus posts favoritos y ponlas en la carpeta `assets/instagram/` que he creado aquí"

Crea la carpeta `assets/instagram/` automáticamente:

```bash
mkdir -p assets/instagram
```

**Alternativa**: dile que puede exportar sus datos desde Instagram: Configuración → Tu actividad → Descargar tu información.

### 1E. Preguntas complementarias (después de tener los datos base)

- **Bio completa** (si no se pudo extraer)
- **A qué te dedicas** (fotógrafo, coach, diseñador, nutricionista, etc.)
- **Servicios reales** con precios si los tiene — si dice que no quiere poner precios o que es "bajo presupuesto", respétalo y no pongas precios
- **Email o forma de contacto**
- **Link que tienes en la bio**

### Bloque 2 — Identidad visual (preguntar después)

- **Colores de marca** — si tiene web o materiales, extrae los colores de ahí con WebFetch. Si no tiene, proponle 2-3 paletas que encajen con su perfil y que elija
- **Eslogan o frase principal** — si su bio tiene uno bueno, proponlo. Si no, ofrece 2-3 opciones
- **Fotos adicionales** — además de las de Instagram, pregunta si tiene fotos profesionales o logo

### Bloque 3 — Contenido opcional

- **Testimonios de clientes reales** — si los encontraste en Skool/web/Google, muéstraselos y pregunta si quiere usarlos. Si no tiene, **omite la sección**
- **Portfolio / trabajos reales** — si tiene ejemplos de su trabajo, inclúyelos
- **Redes sociales** — URLs reales de todas sus redes

---

## Paso 2 — Adaptar al tipo de marca personal

La web de un fotógrafo debe sentirse completamente diferente a la de un coach de negocios. Adapta todo al perfil.

### Guía de adaptación

**Fotógrafo / Videógrafo / Creativo visual**
- Tono: visual, artístico, inmersivo
- Sección estrella: Portfolio/Galería con grid grande y vistoso
- La web debe ser casi toda visual — las fotos son el protagonista
- CTA: "Reserva tu sesión" / "Ver portfolio"

**Coach / Consultor / Mentor**
- Tono: inspirador, profesional, cercano
- Sección estrella: Servicios/Programas con descripción clara de qué ofrece
- Social proof importante: número de alumnos, testimonios, comunidad
- CTA: "Agenda una llamada" / "Empieza tu transformación"

**Influencer / Creador de contenido**
- Tono: fresco, personal, auténtico
- Sección estrella: Contenido destacado / Colaboraciones
- Stats de todas las redes como social proof
- CTA: "Colabora conmigo" / "Contacto para marcas"

**Freelancer / Diseñador / Desarrollador**
- Tono: profesional, moderno, limpio
- Sección estrella: Portfolio con proyectos reales
- Skills técnicos en badges o barras
- CTA: "Hablemos de tu proyecto" / "Ver trabajos"

**Nutricionista / Fitness / Salud**
- Tono: energético, saludable, motivador
- Sección estrella: Planes/Programas con precios (si los dio)
- Resultados de clientes si tiene
- CTA: "Empieza tu plan" / "Consulta gratis"

**Artista / Músico / Performer**
- Tono: expresivo, inmersivo, emotivo
- Sección estrella: Galería/Shows/Obra
- Audio/video embeds si tiene links
- CTA: "Escúchame" / "Próximos eventos"

---

## Paso 3 — Generar la web

Crea **un único archivo HTML** autocontenido con CSS y JS inline. Sin dependencias externas excepto Google Fonts.

### Principio creativo

Tienes libertad total para diseñar. La web debe sentirse como una extensión natural del perfil de Instagram — misma energía, mismo estilo, pero en formato web profesional. Haz que sea única, no un template genérico.

Requisitos técnicos:
- **Responsive** (móvil, tablet, escritorio)
- **Rendimiento** (sin librerías externas pesadas)
- **Accesibilidad básica** (contraste, tamaños legibles)

### Idioma

El mismo que usa el usuario en la conversación.

### Secciones

Incluye en este orden. Omite las que no apliquen:

1. **Navegación fija** — Con el nombre/marca del usuario. Blur + semi-transparente al scroll. Links a secciones.

2. **Hero con tarjeta de perfil de Instagram** — El hero debe incluir una tarjeta premium que simule la parte superior de un perfil de Instagram, pero con diseño elevado. La tarjeta debe contener:
   - **Foto de perfil** con anillo decorativo animado (estilo stories de IG, con gradiente que rota)
   - **Stats reales**: publicaciones, seguidores y seguidos — visibles directamente, no animados (el usuario quiere ver los números al instante)
   - **Nombre con tick de verificación azul** — un badge circular azul con gradiente y check blanco al lado del nombre. Estilo premium con sombra sutil
   - **Handle de Instagram** como link clicable
   - **Categoría profesional** y ubicación si la tiene
   - **Bio real** tal cual
   - **Botones de acción** estilo IG: Contactar, Servicios, Seguir (o los que encajen)
   - **Mini grid de 6 fotos** de sus posts más recientes al final de la tarjeta

   Debajo de la tarjeta, un título grande con el propósito/misión del usuario y el **total de comunidad sumando todas las redes**.

3. **Sobre mí** — Bio real expandida (basada en lo que proporcionó, no inventada). Áreas de expertise en badges/pills. Fotos reales de Instagram en grid visual. Solo info que el usuario haya dado.

4. **Servicios** — Solo con servicios REALES. Si el usuario dijo que no quiere poner precios, no los pongas — pon "Bajo presupuesto" o similar. Si no dio servicios, omite la sección. Si tiene una comunidad/formación destacada (como Skool), dale una sección propia con sus stats.

5. **Galería / Contenido** — Usa las fotos reales descargadas de Instagram con rutas relativas a `assets/instagram/`. Grid visual atractivo con hover effects. Las fotos son el mayor activo visual — hazlas protagonistas.

6. **Métricas** — Barra de stats con los datos reales más impactantes (casos de éxito, países, comunidad total, años de experiencia). Solo datos reales proporcionados o extraídos. Números con counter animation al entrar en viewport.

7. **Testimonios** — **Solo testimonios reales** encontrados en Skool, web, o proporcionados por el usuario. Elige los más potentes — los que mencionan resultados concretos (clientes cerrados, facturación, transformación). Respeta la cantidad exacta que tienes.

8. **Contacto + Footer** — Formulario, email real, links a TODAS sus redes reales con iconos. CTA directo a Instagram. Copyright con nombre y año.

### Efectos de scroll obligatorios

Implementa con **Intersection Observer nativo**:

- **Reveal animations** — Elementos aparecen al entrar en viewport
- **Stagger** — Grids/listas entran escalonados
- **Counter** — Números de métricas cuentan desde 0
- **Parallax** — Al menos 1 sección con movimiento diferencial
- **Hover effects** — Cards responden al hover

Elige las animaciones que mejor encajen con la personalidad del perfil.

### Diseño visual

- **Tema**: elige según la marca personal — oscuro para tech/creativos, claro para coaches/salud
- **Tipografía**: 2-3 fuentes de Google Fonts que reflejen la personalidad del perfil
- **Paleta**: los colores elegidos por el usuario, o extraídos de su web/marca
- **Detalles creativos**: scrollbar personalizada, elementos decorativos, gradientes, la línea dorada de acento en la tarjeta IG — lo que haga falta para que se sienta premium y personal
- **Instagram como hilo conductor**: la web nace del perfil de Instagram — que se note visualmente en la tarjeta del hero, las fotos, los stats y los links prominentes al perfil

---

## Paso 4 — Guardar y abrir

- Guarda como `web-[handle].html` (sin el @, kebab-case)
- Abre automáticamente en el navegador

---

## Paso 5 — Presentar el resultado

Muestra:

1. Nombre del archivo generado
2. Secciones incluidas
3. De dónde salió cada dato (extraído de Instagram / extraído de otra red / proporcionado por el usuario)
4. **Seguidores totales** — desglose por red y suma total
5. **Fotos utilizadas** — cuántas se descargaron de Instagram y dónde están (`assets/instagram/`)
6. **Datos que faltan** — placeholders que el usuario debe completar
7. Pregunta si quiere ajustar algo

No muestres precios sugeridos ni consejos de venta.
