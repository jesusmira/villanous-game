// ─── Intenciones específicas del Príncipe Juan ───────────────────────────────────
// Sustituye a ai.ts (heurística implícita por pesos) por 3 intenciones con nombre propio.
import { CardType } from '../../types';
import type { CardInstId, GameState, PlayerState } from '../../types';
import type { AIContext, IntentionDef } from '../../ai/intent/types';
import { CardDefId, EffectId } from '../effectIds';
import { lerpCurve } from '../../ai/intent/curve';

function hasHeroInKingdom(ctx: AIContext, defId: string): boolean {
  return ctx.locations.some(l => l.heroCardInstIds.some(id => ctx.state.allCards[id]?.defId === defId));
}

/** Generar poder: su condición de victoria son 20 Monedas SIN tope — a diferencia de la
 *  intención universal (que asume rendimientos decrecientes), aquí la urgencia crece cuanto
 *  más cerca está de 20, con curva continua (evita el "acantilado" ya documentado en memoria:
 *  bajar de Poder por una jugada legítima no debe desplomar la puntuación de golpe). Robin
 *  Hood/Rey Ricardo restan un penalización FIJA propia mientras vivan en el reino (drenan Poder
 *  futuro / bloquean Efectos) — al encerrarlos o vencerlos, este término SUBE de golpe, lo que
 *  da a Encarcelamiento/Vencer una razón estructural para jugarse aunque cueste Poder ahora. */
const generatePowerIntention: IntentionDef = {
  id: 'JHON_GENERATE_POWER',
  name: 'Generar poder (sin techo)',
  polarity: 1, // LOGRO: sube con el Poder, que es directamente su condición de victoria
  evaluate: (ctx: AIContext) => {
    let v = lerpCurve(ctx.player.power, [[0, 5], [10, 25], [14, 60], [18, 120], [20, 160]]);
    if (hasHeroInKingdom(ctx, CardDefId.JHON_ROBIN_HOOD)) v -= 35;
    if (hasHeroInKingdom(ctx, CardDefId.JHON_REY_RICARDO)) v -= 40;
    // Bono directo por cada héroe ya encerrado en La Prisión: fuera de ahí sigue bloqueando
    // ranuras (ya lo recoge el término estructural OWN_HERO_BLOCKAGE en actionScoring.ts), pero
    // encerrarlo es un logro propio que merece su propio crédito — sin esto, Encarcelamiento
    // (coste 2) podía no compensar su propio coste de Poder en el momento de jugarlo.
    const imprisoned = ctx.locations.reduce((n, l) => {
      const locDef = ctx.plugin.locations.find(ld => ld.id === l.id);
      return locDef?.heroesNeverCoverSlots ? n + l.heroCardInstIds.length : n;
    }, 0);
    v += imprisoned * 28;
    // Bono DIRECTO por tener la Corona del Rey Ricardo ya en juego: su valor real (descuento de
    // coste futuro) es invisible para un evaluador de un solo estado — sin esto, jugarla nunca
    // se veía "recompensada" una vez en juego y quedaba sin jugar partidas enteras pese a
    // tenerla constantemente disponible (bug real documentado). Vive aquí (logro, polarity +1)
    // y no en JHON_PLAY_INCOME_CARDS (de urgencia) para no mezclar polaridades.
    const coronaInPlay = ctx.locations.some(l => l.villainCardInstIds.some(id => ctx.state.allCards[id]?.defId === CardDefId.JHON_CORONA));
    if (coronaInPlay) v += 12;
    // Colchón defensivo: Aliados desarrollados en ubicaciones SIN héroe (con tope, para no
    // premiar acaparar sin límite — mismo espíritu que STANDING_ARMY_CAP del motor anterior).
    // Sin esto, jugar un Aliado cuando no hay ningún héroe presente era PURO coste (resta Poder,
    // resta progreso, sin ningún crédito que lo compense) y Juan se quedaba con Aliados muertos
    // en mano la partida entera en vez de desarrollar el reino por adelantado.
    const standingArmyStr = ctx.locations
      .filter(l => l.heroStrength === 0)
      .reduce((sum, l) => sum + l.allyStrength, 0);
    v += Math.min(standingArmyStr, 8) * 3;
    return v;
  },
};

/** Robar poder de vuelta: héroes como Little John retienen Monedas propias — recuperarlas es
 *  doble beneficio (quita al bloqueante Y devuelve Poder real de inmediato). URGENCIA formulada
 *  como hueco restante (baja con cada Aliado invertido) para que la inversión parcial también
 *  sume alineación, no solo el remate final. */
const stealPowerBackIntention: IntentionDef = {
  id: 'JHON_STEAL_POWER_BACK',
  name: 'Robar poder de vuelta',
  polarity: -1,
  evaluate: (ctx: AIContext) => {
    let v = 0;
    for (const loc of ctx.locations) {
      const stored = loc.heroCardInstIds.reduce((sum, id) => sum + (ctx.state.allCards[id]?.storedPower ?? 0), 0);
      if (stored === 0) continue;
      const heroStr = loc.heroStrength;
      const remainingGap = heroStr > 0 ? Math.max(0, 1 - loc.allyStrength / heroStr) : 1;
      v += stored * (4 + remainingGap * 6);
    }
    return v;
  },
};

/** Jugar cartas de ingresos: Órdenes de Búsqueda (generan Poder cada turno) y la Corona del Rey
 *  Ricardo (descuento de coste) son inversión que compone — más valiosas cuanto antes se jueguen. */
const playIncomeCardsIntention: IntentionDef = {
  id: 'JHON_PLAY_INCOME_CARDS',
  name: 'Jugar cartas de ingresos',
  polarity: -1,
  evaluate: (ctx: AIContext) => {
    const ordenInHandCount = ctx.player.handInstIds.filter(id => {
      const defId = ctx.state.allCards[id]?.defId;
      return defId === 'jhon_v_orden_1' || defId === 'jhon_v_orden_2' || defId === 'jhon_v_orden_3';
    }).length;
    const coronaInHand = ctx.player.handInstIds.some(id => ctx.state.allCards[id]?.defId === CardDefId.JHON_CORONA);
    let ordenInPlay = 0;
    let coronaInPlay = false;
    for (const loc of ctx.locations) {
      for (const id of loc.villainCardInstIds) {
        const defId = ctx.state.allCards[id]?.defId;
        if (defId === 'jhon_v_orden_1' || defId === 'jhon_v_orden_2' || defId === 'jhon_v_orden_3') ordenInPlay++;
        if (defId === CardDefId.JHON_CORONA) coronaInPlay = true;
      }
    }
    let v = ordenInHandCount * (25 - Math.min(ordenInPlay, 2) * 8); // menos urgente cuantas más ya en juego
    // OJO polarity: esta intención es de URGENCIA (sube cuando algo falta por jugar) — el
    // crédito por tener la Corona YA en juego (logro, no urgencia) vive en generatePowerIntention
    // en su lugar, para no mezclar polaridades dentro de la misma intención (ver más abajo).
    if (coronaInHand && !coronaInPlay) v += 18;
    return Math.max(0, v);
  },
};

export const intentions: IntentionDef[] = [generatePowerIntention, stealPowerBackIntention, playIncomeCardsIntention];

/**
 * Cartas de mano que ya no aportan nada: Condiciones duplicadas, Avaricia sin objetivo (rival
 * lejos de 6 Monedas), cualquier Efecto mientras Rey Ricardo viva (blocksEffectPlay lo deja
 * injugable por completo), o TODA la mano si Robin Hood/Rey Ricardo ahogan la economía y nada es
 * asequible ahora mismo.
 */
export function deadCards(state: GameState, p: PlayerState): CardInstId[] {
  const out: CardInstId[] = [];
  const opp = state.players.find(pl => pl.id !== p.id);
  const hasHeroInKingdom = (defId: string) =>
    Object.values(p.locationStates).some(ls => ls.heroCardInstIds.some(id => state.allCards[id]?.defId === defId));
  const reyPresent = hasHeroInKingdom(CardDefId.JHON_REY_RICARDO);
  const robinPresent = hasHeroInKingdom(CardDefId.JHON_ROBIN_HOOD);

  const noneAffordable = (reyPresent || robinPresent) && p.handInstIds.length > 0
    && p.handInstIds.every(id => {
      const c = state.allCards[id];
      if (!c) return true;
      const cost = Math.max(0, c.baseCost + c.costModifier);
      return cost > p.power;
    });

  // Objetos que se adjuntan a un Aliado (Flecha Dorada, Arco con Flechas): sin NINGÚN Aliado en
  // el reino no tienen nada a lo que unirse — sin este chequeo, se quedaban en mano jugando
  // siempre en negativo (adjuntarlos a nada no aporta nada) SIN marcarse como muertos, así que
  // nunca se ciclaban — la mano se congelaba para siempre (nunca se descartan, nunca se roban
  // cartas nuevas, ver drawCards: solo rellena hasta el tope) y Juan nunca volvía a ver un
  // Aliado. Confirmado con el simulador: partidas de 150+ rondas sin que la mano cambiara nunca.
  const hasAllyInKingdom = Object.values(p.locationStates)
    .some(ls => ls.villainCardInstIds.some(id => state.allCards[id]?.cardType === CardType.ALLY));
  const attachesToAlly = (eid: string) => eid === EffectId.JHON_FLECHA_ATTACH || eid === EffectId.JHON_ARCO_ATTACH;

  const seenCondNames = new Set<string>();
  for (const id of p.handInstIds) {
    const c = state.allCards[id];
    if (!c) continue;
    if (noneAffordable) { out.push(id); continue; }
    if (reyPresent && c.cardType === CardType.EFFECT) { out.push(id); continue; }
    if (!hasAllyInKingdom && c.effectIds.some(attachesToAlly)) { out.push(id); continue; }
    if (c.cardType === CardType.CONDITION) {
      if (seenCondNames.has(c.name)) { out.push(id); continue; }
      seenCondNames.add(c.name);
    }
    if (opp && opp.power < 3 && c.effectIds.includes(EffectId.JHON_AVARICIA)) {
      // FASE previa: Avaricia sin disparador cercano — se cicla mejor que quedarse en mano.
      out.push(id);
      continue;
    }
    if (c.cardType === CardType.ALLY) {
      const cost = Math.max(0, c.baseCost + c.costModifier);
      const strength = c.baseStrength ?? 0;
      const isDominated = p.handInstIds.some(otherId => {
        if (otherId === id) return false;
        const other = state.allCards[otherId];
        if (other?.cardType !== CardType.ALLY) return false;
        const otherCost = Math.max(0, other.baseCost + other.costModifier);
        const otherStrength = other.baseStrength ?? 0;
        return otherCost <= cost && otherStrength >= strength && (otherCost < cost || otherStrength > strength);
      });
      if (isDominated) out.push(id);
    }
  }
  return out;
}
