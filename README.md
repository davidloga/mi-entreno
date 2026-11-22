# Mi Entreno

App web para apuntar el entreno sobre la hoja de Google del entrenador y seguir el progreso (cargas, peso, perímetros y fotos).

- **Para quien la usa:** abre la app, toca *Entrar con Google* y elige tu hoja de entreno. Nada más.
- **Privacidad:** la app solo accede a la hoja que eliges y a los archivos que ella misma crea en tu Google Drive. No hay servidores propios. Ver [privacidad.html](privacidad.html).
- **Sin cobertura:** la app se guarda en el móvil y lo que apuntes se sube a la hoja cuando vuelve la conexión.

## Formato de la hoja

Bloques `DÍA n - NOMBRE` con una fila `EJERCICIOS | SERIES | RIR (o RPE) | REPES | TÉCNICAS | DÍA 1 … DÍA 8`.
Cada columna `DÍA n` es una semana del mesociclo. Las cargas se escriben como `60 kg - 10-9`; las superseries (`A + B`) como `110 kg - 11-10 || 30 kg - 12-10`; la marca conseguida se pinta en verde.

## Configuración (una vez)

Rellena `config.js` con el ID de cliente OAuth, la clave de API y el número de proyecto de Google Cloud.
