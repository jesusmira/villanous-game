import { useState, useEffect } from 'react';
import { RotateCw } from 'lucide-react';
import { useGameStore } from './state/gameStore';
import { GameSetup } from './components/GameSetup';
import { GameBoard } from './components/GameBoard';
import { StartRevealModal } from './components/StartRevealModal';
import './index.css';

function App() {
  const state = useGameStore(s => s.state);
  const startReveal = useGameStore(s => s.startReveal);
  const dismissStartReveal = useGameStore(s => s.dismissStartReveal);
  const [isLandscape, setIsLandscape] = useState(window.innerHeight < window.innerWidth);

  // Detect orientation changes globally
  useEffect(() => {
    const handleOrientationChange = () => {
      setIsLandscape(window.innerHeight < window.innerWidth);
    };

    const handleResize = () => {
      setIsLandscape(window.innerHeight < window.innerWidth);
    };

    window.addEventListener('orientationchange', handleOrientationChange);
    window.addEventListener('resize', handleResize);

    return () => {
      window.removeEventListener('orientationchange', handleOrientationChange);
      window.removeEventListener('resize', handleResize);
    };
  }, []);

  // Portrait warning screen
  if (!isLandscape) {
    return (
      <div className="h-screen flex flex-col items-center justify-center px-4 gap-6 bg-surface text-on-surface">
        <RotateCw className="w-16 h-16 text-primary animate-spin" />
        <div className="text-center space-y-3">
          <h2 className="font-serif text-2xl font-bold">Gira el dispositivo</h2>
          <p className="text-on-surface-variant text-sm max-w-xs">
            Este juego funciona mejor en orientación horizontal. Por favor gira tu dispositivo.
          </p>
        </div>
      </div>
    );
  }

  if (!state) return <GameSetup />;

  return (
    <>
      <GameBoard state={state} />
      {startReveal !== null && (
        <StartRevealModal
          state={state}
          startingPlayerIndex={startReveal}
          onContinue={dismissStartReveal}
        />
      )}
    </>
  );
}

export default App;
