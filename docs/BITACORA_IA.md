# Bitácora de uso de IA

Registro honesto de qué le pedimos a la IA, qué devolvió mal y cómo lo detectamos. Insumo para la exposición y `docs/TECNICO.md`.

| # | Qué pedimos | Qué devolvió mal | Cómo lo detectamos | Corrección |
|---|---|---|---|---|
| 1 | Prueba de empate con un tablero lleno sin ganador | Propuso un patrón de bloques 2×2 alternados "que nunca forma 4"; en realidad la diagonal (0,0)-(1,1)-(2,2)-(3,3) quedaba toda del mismo color | Revisión manual de la diagonal antes de confiar en la prueba | Se generó una secuencia real de 56 jugadas sin ganador y la prueba la valida con `findWinner` |
| 2 | Prueba de victoria en diagonal ↗ para la representación rápida | Añadió una aserción "el jugador 1 no gana en la columna 3", pero esa columna ya tenía 3 fichas del jugador 1 (gana en vertical) | La prueba falló; al revisar, el motor tenía razón y la prueba estaba mal | Se eliminó la aserción incorrecta. Lección: una prueba roja no siempre significa código roto |
| 3 | Prueba de que el turno de ejemplo de las bases se reconstruye igual desde `moves` | Asumió que el ejemplo del PDF era coherente; no lo es (8 jugadas en `moves` vs 6 fichas en `board`; `turn: 9` con `you: 2`) | La prueba falló y revisamos el ejemplo a mano | El bot confía en `board` y `you`; `moves` solo se usa si falta `board`. Pregunta enviada a organizadores |
| 4 | Diagnóstico de pruebas "colgadas" | — (no fue error de la IA) `node` se bloqueaba en `pread` leyendo `node_modules` dentro del Escritorio sincronizado con iCloud | `lsof` + `sample` del proceso; fuera del Escritorio cargaba en 82 ms | `node_modules` vive en `~/.cache/ai-event` con enlace simbólico. Recomendación: no correr el bot del torneo desde una carpeta sincronizada |
