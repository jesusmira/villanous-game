# Príncipe Juan — Guía de Villano

## Objetivo del Príncipe Juan

Empezar tu turno con al menos **20 Monedas de Poder**. El Príncipe Juan es toda avaricia, así que necesita acumular Monedas de Poder. Sin embargo, por muy tentador que sea ahorrar todo el Poder que puedas, necesitarás gastar algunas Monedas para hacer cartas. Varios Héroes pueden obstaculizar tu habilidad para ganar Monedas de Poder. Si juegas bien tus Aliados, estarás preparado para Vencer a un Héroe que esté entorpeciendo tu progreso.

---

## La Prisión

El Reino del Príncipe Juan tiene una ubicación que puede utilizar a su favor. **La Prisión** no tiene ningún símbolo que pueda ser tapado por los Héroes, haciendo que los Héroes jugados en esa ubicación no resulten tan perturbadores. El Príncipe Juan tiene que mover Héroes a La Prisión para poder realizar las acciones disponibles en otras ubicaciones.

> **Nota:** Mientras están en La Prisión, las Habilidades de los Héroes siguen ejerciendo su efecto.

---

## ¡Qué Bueno es Ser el Rey!

Aunque los Héroes pueden perturbar sus planes, el Príncipe Juan tiene unos trucos bajo la manga. Algunas cartas como **Orden de Búsqueda**, **Sheriff de Nottingham** y **Apreciados Impuestos** le permiten beneficiarse de los Héroes en su Reino. ¡A veces vale la pena mantener a tus enemigos cerca!

---

## Cartas de Destino Especiales

Cuando se juega la carta **Robar a los Ricos**, al Príncipe Juan se le pueden quitar hasta **4 Monedas de Poder**, que se colocan sobre el Héroe jugado en su Reino. Cuando un Héroe con Monedas sobre él es derrotado, el Príncipe Juan recupera esas Monedas.

El mismo Héroe puede ser derrotado varias veces con la carta Robar a los Ricos, lo que hace que el Príncipe Juan recupere Monedas cada vez que haya derrotado a ese Héroe.

---

## Robin Hood y Little John

Mientras **Robin Hood** esté en el Reino del Príncipe Juan, cada vez que el Príncipe Juan gane Monedas de Poder gracias a una acción o carta, ganará **1 Moneda menos** de lo que debería ganar. Por lo tanto, el Príncipe Juan debe derrotar a Robin Hood tan pronto como sea posible.

Cuando se juega el Héroe **Little John**, al Príncipe Juan le pueden quitar hasta **4 Monedas de Poder**, que se colocan sobre la carta de Little John, igual que con Robar a los Ricos. El Príncipe Juan debe derrotar a Little John para recuperar esas Monedas y evitar que arruine la victoria de forma inesperada.

---
## Bug no bug. solo mala suerte


Por qué entonces salió Robin Hood tantas veces
El mecanismo es correcto pero la intuición de "15 cartas = poca probabilidad" no aplica bien aquí, por dos motivos que vi en tu log:

El mazo de Destino del Príncipe Juan se vacía rápido. Cada Destino revela 2 cartas y descarta la que no se elige (aunque sea jugable) — eso son 2 cartas menos del mazo por cada uso, no 1. Con 9 héroes + 3 Buen Disfraz + 3 Robar a los Ricos = 15 cartas, y Garfio/Maléfica usando Destino casi todos los turnos, el mazo se agota cada 7-8 turnos, no cada 15.

Cuando se vacía, la pila de descarte que se baraja puede ser chica. Si en ese momento varios héroes siguen en tu reino (sin derrotar) y no están en el descarte, la pila a barajar puede ser de 4-6 cartas en vez de 15. Mirá la tabla: con 5-6 cartas, la chance de que la MISMA carta caiga entre las 2 primeras posiciones dos barajados seguidos ya es 11-16% — no es insólito, es "mala suerte normal" con un mazo chico.

Revisé también el código del trigger de barajado (fate.ts): solo se dispara cuando el mazo está realmente vacío (fateDeckInstIds.length === 0), nunca antes — sin bug ahí tampoco.

Conclusión: todo correcto, sin sesgo de código. Fue varianza real, amplificada por lo chico que es el mazo de Destino de Príncipe Juan una vez que arranca a vaciarse.