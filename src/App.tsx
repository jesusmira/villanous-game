import { useGameStore } from './state/gameStore';
import { GameSetup } from './components/GameSetup';
import { GameBoard } from './components/GameBoard';
import { StartRevealModal } from './components/StartRevealModal';
import { DragProvider } from './hooks/DragProvider';
import './index.css';

function App() {
  const state = useGameStore(s => s.state);
  const startReveal = useGameStore(s => s.startReveal);
  const dismissStartReveal = useGameStore(s => s.dismissStartReveal);

  if (!state) return <GameSetup />;

  return (
    <DragProvider>
      <GameBoard state={state} />
      {startReveal !== null && (
        <StartRevealModal
          state={state}
          startingPlayerIndex={startReveal}
          onContinue={dismissStartReveal}
        />
      )}
    </DragProvider>
  );
}

export default App;
