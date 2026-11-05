# Bitácora de uso de IA

Registro honesto de qué le pedimos a la IA, qué devolvió mal y cómo lo detectamos. Insumo para la exposición y `docs/TECNICO.md`.

| # | Qué pedimos | Qué devolvió mal | Cómo lo detectamos | Corrección |
|---|---|---|---|---|
| 1 | Prueba de empate con un tablero lleno sin ganador | Propuso un patrón de bloques 2×2 alternados "que nunca forma 4"; en realidad la diagonal (0,0)-(1,1)-(2,2)-(3,3) quedaba toda del mismo color | Revisión manual de la diagonal antes de confiar en la prueba | Se generó una secuencia real de 56 jugadas sin ganador y la prueba la valida con `findWinner` |
| 2 | Prueba de victoria en diagonal ↗ para la representación rápida | Añadió una aserción "el jugador 1 no gana en la columna 3", pero esa columna ya tenía 3 fichas del jugador 1 (gana en vertical) | La prueba falló; al revisar, el motor tenía razón y la prueba estaba mal | Se eliminó la aserción incorrecta. Lección: una prueba roja no siempre significa código roto |
