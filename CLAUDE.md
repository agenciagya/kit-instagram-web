# Tu Instagram → Web Profesional

Este proyecto convierte tu perfil de Instagram en una web de marca personal profesional.

## Comportamiento al iniciar

Cuando el usuario abra esta carpeta y escriba cualquier cosa (incluido "hola", "qué hago", "empezar"), responde con este mensaje de bienvenida:

> **Bienvenido al creador de webs desde Instagram**
>
> Voy a convertir tu perfil de Instagram en una web profesional de marca personal.
>
> Solo necesito tu **@handle de Instagram** para empezar. Yo me encargo del resto: descargo tus fotos, busco tus datos en redes, y genero la web.
>
> **¿Cuál es tu @ de Instagram?**

Después de eso, usa la skill `instagram-a-web` automáticamente.

## Qué hace Claude automáticamente
1. Entra a tu perfil de Instagram y descarga tus datos y fotos automáticamente
2. Busca tu presencia en otras redes (Threads, TikTok, YouTube, LinkedIn...)
3. Suma tus seguidores de todas las plataformas
4. Busca testimonios de tus clientes si los tienes publicados
5. Te pregunta lo que no puede encontrar solo (servicios, colores, email)
6. Genera una web premium y la abre en tu navegador

## Lo que necesitas tener a mano

- Tu @handle de Instagram
- A qué te dedicas y qué servicios ofreces
- Tu email de contacto
- Tus colores de marca (si los tienes; si no, Claude te propone opciones)

## Lo que genera

- Un archivo HTML profesional que se abre en cualquier navegador
- Hero con tu perfil de Instagram integrado (foto, stats, bio, tick verificado, mini grid de fotos)
- Tus fotos reales de Instagram en la galería
- Adaptado a tu tipo de marca personal (fotógrafo, coach, influencer, etc.)
- Se ve bien en móvil, tablet y escritorio
- Solo usa tus datos reales — nunca inventa información

## Sobre las dependencias

Antes de empezar, verifica si Node.js está instalado:
```bash
node --version 2>/dev/null && echo "Node.js OK" || echo "NO_NODE"
```

Si no tiene Node.js, dile:
> "Para poder acceder a tu Instagram automáticamente necesito Node.js. Es una instalación rápida de 2 minutos: ve a https://nodejs.org y descarga la versión LTS. Cuando lo tengas instalado, dime y seguimos.
>
> Si prefieres no instalarlo, no pasa nada — te pediré los datos directamente y la web quedará igual de bien."

Si tiene Node.js, instala Playwright automáticamente y sigue con el scraping. El usuario no tiene que hacer nada más.

## Si tienes imágenes extras

Puedes meter fotos adicionales (retratos, logo, portfolio) en la carpeta `assets/`. Claude las usará en la web.

## Después de generar

Dile a Claude qué quieres cambiar: colores, textos, secciones, fotos. Itera hasta que te guste.
