import { createInitialState } from '../src/core/engine/GameEngine';
import { runAIStep } from '../src/core/ai/runAIStep';
import { CardDefId } from '../src/core/villains/effectIds';

const MAX_AI_STEPS = 300;
const N = 25;

let totalRounds = 0, wins = 0, losses = 0, stalls = 0;
let sheriffOwned = 0, sheriffActivatedLines = 0;
let cobardiaTriggerable = 0, cobardiaPlayedLines = 0;
let robinTurnsAlive: number[] = [];
let reyRicardoTurnsAlive: number[] = [];
let discardActions = 0, playActions = 0, fateActions = 0, vanquishActions = 0, gainPowerActions = 0;
let finalPowers: number[] = [];

for (let i = 0; i < N; i++) {
  let s = createInitialState({
    player1: { villainId: 'jhon', isAI: true, name: 'IA-jhon' },
    player2: { villainId: i % 2 === 0 ? 'hook' : 'maleficent', isAI: true, name: 'IA-opp' },
    startingPlayerIndex: (i % 2) as 0 | 1,
  });

  let robinFirstSeen = -1, robinLastSeen = -1;
  let reyFirstSeen = -1, reyLastSeen = -1;
  let round = 0;

  for (let step = 0; step < MAX_AI_STEPS && !s.winner; step++) {
    const { final } = runAIStep(s);
    if (final === s && !final.winner) { stalls++; break; }
    s = final;
    round = s.roundNumber;

    const jhon = s.players.find(p => p.villainId === 'jhon')!;
    const hasRobin = Object.values(jhon.locationStates).some(ls =>
      ls.heroCardInstIds.some(id => s.allCards[id]?.defId === CardDefId.JHON_ROBIN_HOOD));
    const hasRey = Object.values(jhon.locationStates).some(ls =>
      ls.heroCardInstIds.some(id => s.allCards[id]?.defId === 'jhon_f_rey'));
    if (hasRobin) { if (robinFirstSeen < 0) robinFirstSeen = round; robinLastSeen = round; }
    if (hasRey)   { if (reyFirstSeen < 0) reyFirstSeen = round; reyLastSeen = round; }

    const hasSheriff = Object.values(jhon.locationStates).some(ls =>
      ls.villainCardInstIds.some(id => s.allCards[id]?.defId === 'jhon_v_sherif'));
    if (hasSheriff) sheriffOwned++;
  }

  if (robinFirstSeen >= 0) robinTurnsAlive.push(robinLastSeen - robinFirstSeen + 1);
  if (reyFirstSeen >= 0) reyRicardoTurnsAlive.push(reyLastSeen - reyFirstSeen + 1);

  const jhonLogLines = s.log.filter(l => l.includes('IA-jhon'));
  for (const l of jhonLogLines) {
    if (l.includes('se mueve a')) continue;
    if (l.includes('descarta')) discardActions++;
    if (l.includes('juega ') && !l.includes('Destino')) playActions++;
    if (l.includes('usa Destino')) fateActions++;
    if (l.includes('derrota a') || l.includes('vence')) vanquishActions++;
    if (l.includes('gana') && l.includes('Poder')) gainPowerActions++;
    if (l.includes('El Sheriff se mueve')) sheriffActivatedLines++;
    if (l.includes('Cobardía:')) cobardiaPlayedLines++;
  }

  const jhonFinal = s.players.find(p => p.villainId === 'jhon')!;
  finalPowers.push(jhonFinal.power);
  totalRounds += round;
  if (s.winner === jhonFinal.id) wins++; else if (s.winner) losses++;
}

console.log(`Partidas: ${N} | wins=${wins} losses=${losses} stalls=${stalls}`);
console.log(`Rondas medias: ${(totalRounds / N).toFixed(1)}`);
console.log(`Poder final medio de Jhon: ${(finalPowers.reduce((a, b) => a + b, 0) / N).toFixed(1)}`);
console.log(`Acciones observadas (total en ${N} partidas): descartes=${discardActions} juega-carta=${playActions} destino=${fateActions} vence=${vanquishActions} gana-poder-lineas=${gainPowerActions}`);
console.log(`Sheriff en juego (nº de "steps" con Sheriff presente, agregando partidas): ${sheriffOwned} | líneas de log mencionando Sheriff/activación: ${sheriffActivatedLines}`);
console.log(`Cobardía mencionada en log (jugada): ${cobardiaPlayedLines}`);
console.log(`Robin Hood — partidas donde apareció: ${robinTurnsAlive.length}/${N}, rondas vivo (por partida): ${robinTurnsAlive.join(',')}`);
console.log(`Rey Ricardo — partidas donde apareció: ${reyRicardoTurnsAlive.length}/${N}, rondas vivo (por partida): ${reyRicardoTurnsAlive.join(',')}`);
