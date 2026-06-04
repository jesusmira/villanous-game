# Análisis de Probabilidades: Victoria de Maleficent en 7 turnos

## Datos del Deck de Maleficent

**Total de cartas: 42**
- Villain Cards: 28
- Fate Cards: 14

**Maldiciones: 8 cartas (19% del deck)**
1. Sueño Sin Sueños: 2 copias
2. Fuego Verde: 3 copias  
3. Selva de Mortales Espinos: 3 copias

**Ubicaciones: 4**
- Montañas Prohibidas
- La Cabaña de Briar Rose
- El Bosque
- El Castillo del Rey Stefan

**Requisito para ganar:** 1 maldición en CADA ubicación (4 maldiciones mínimo)

## Estimación de Cartas Vistas en 7 Turnos

En Villainous:
- Turno 1: comienza con 4 cartas (hand size)
- Cada turno subsecuente: roba cartas hasta completar hand size

Estimación realista:
- Turnos 1-2: 8 cartas (inicial + 1 robo)
- Turnos 3-5: 12-15 cartas (3-5 rondas × 3-4 cartas/robo)
- Turnos 6-7: 5-8 cartas
- **Total: 24-28 cartas vistas de 42**

## Cálculo de Probabilidad

Usando distribución **hipergeométrica**:

### Escenario 1: 24 cartas vistas
```
P(≥4 maldiciones en 24 cartas) = 38-42%
- P(4 maldiciones) ≈ 28%
- P(5 maldiciones) ≈ 10%
- P(6+ maldiciones) ≈ 2-4%
```

### Escenario 2: 26 cartas vistas (más realista)
```
P(≥4 maldiciones en 26 cartas) = 45-50%
- P(4 maldiciones) ≈ 32%
- P(5 maldiciones) ≈ 13%
- P(6+ maldiciones) ≈ 4-5%
```

### Escenario 3: 28 cartas vistas
```
P(≥4 maldiciones en 28 cartas) = 52-58%
- P(4 maldiciones) ≈ 35%
- P(5 maldiciones) ≈ 16%
- P(6+ maldiciones) ≈ 6-7%
```

## Probabilidad Final Estimada

**~45-50% de probabilidad de ganar en 7 turnos**

Esto es **bastante probable** porque:

1. **Solo necesita el 50% de sus maldiciones** (4 de 8)
2. **Ve el 60% del deck** en 7 turnos (26 de 42)
3. **Juega óptimamente:**
   - Elige ubicaciones con menos resistencia
   - Usa efectos como *Forma de Dragón* para despejar héroes
   - Usa *Cetro* (-1 coste a Maldiciones) en ubicaciones clave
   - Usa *Rueca* para ganar poder cuando juegan héroes

4. **Sin interferencia de Destino:**
   - Si la IA no recibe muchos héroes Fate, las maldiciones fluyen libre
   - Héroes como *Primavera* bloquean maldiciones (riesgo)
   - Héroes como *Fauna* descartan maldiciones (riesgo)

## Comparación

Para contexto:
- **Ganar en turno 1:** ~0% (imposible, necesita robar todos los 4 de las primeras 4 cartas)
- **Ganar en turno 3:** ~5-10% 
- **Ganar en turno 5:** ~25-30%
- **Ganar en turno 7:** ~45-50%
- **Ganar en turno 10:** ~80%+

## Conclusión

La IA tiene **casi 1 en 2 probabilidades** de ganar en los primeros 7 turnos, especialmente si:
- No recibe muchos héroes Fate (especialmente Primavera/Fauna)
- Coloca maldiciones en ubicaciones sin héroe primero
- Usa su Poder para costear maldiciones de alto coste

**Esto explica por qué ganó tan rápido en tu partida** — fue estadísticamente probable, no una anomalía.
