import { useGameStore } from './state/gameStore';
import { GameSetup } from './components/GameSetup';
import { GameBoard } from './components/GameBoard';
import './index.css';

function App() {
  const state = useGameStore(s => s.state);
  return state ? <GameBoard state={state} /> : <GameSetup />;
}

export default App;
