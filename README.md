# Archivo Z — Portal Dragon Ball

SPA responsive para explorar personajes, transformaciones, planetas, favoritos y un quiz de Dragon Ball. Está construida con HTML5, CSS3 y JavaScript vanilla; obtiene la información de [Dragon Ball API](https://dragonball-api.com/).

## Estructura

```text
.
├── index.html
├── css/
│   └── styles.css
└── js/
    └── app.js
```

## Ejecutar

Abre la carpeta en Visual Studio Code y sirve `index.html` con la extensión **Live Server** (o cualquier servidor estático local). La API se consulta directamente desde el navegador, así que se requiere conexión a Internet. No hacen falta dependencias ni un proceso de compilación.

## Navegación

- `#/inicio`: portada y personaje del día.
- `#/personajes`: búsqueda, filtros, orden, paginación y favoritos.
- `#/personaje/:id`: ficha, planeta de origen y transformaciones.
- `#/planetas` y `#/planeta/:id`: atlas y habitantes.
- `#/favoritos`: colección y comparación de ki.
- `#/quiz`: trivia de diez preguntas y ranking local.

Las listas consumen las respuestas paginadas en `items` y `meta`; los detalles usan los objetos de personaje y planeta tal como los entrega la API. Las respuestas se guardan en caché de memoria y `sessionStorage`; tema, favoritos, progreso y ranking se conservan en `localStorage`.

## Accesibilidad

Incluye navegación por teclado, enlace para saltar al contenido, etiquetas accesibles, foco visible, alternativas de texto para imágenes, estados de carga/error/vacío y soporte para `prefers-reduced-motion`.
