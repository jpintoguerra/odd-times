# Bitácora de uso de IA

Registro honesto de qué le pedimos a la IA, qué devolvió mal y cómo lo detectamos. Insumo para la exposición y `docs/TECNICO.md`.

| # | Qué pedimos | Qué devolvió mal | Cómo lo detectamos | Corrección |
|---|---|---|---|---|
| 1 | Prueba de empate con un tablero lleno sin ganador | Propuso un patrón de bloques 2×2 alternados "que nunca forma 4"; en realidad la diagonal (0,0)-(1,1)-(2,2)-(3,3) quedaba toda del mismo color | Revisión manual de la diagonal antes de confiar en la prueba | Se generó una secuencia real de 56 jugadas sin ganador y la prueba la valida con `findWinner` |
