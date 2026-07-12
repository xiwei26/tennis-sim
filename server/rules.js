/**
 * Tennis scoring rules engine.
 * Game: 0→15→30→40→Game (deuce/advantage)
 * Set: first to 6 games, must lead by 2
 * Match: best of 1 set (MVP)
 */

export function getPointDisplay(points) {
  if (points <= 3) {
    const display = ['0', '15', '30', '40'];
    return display[points];
  }
  return 'AD';
}

export function checkGameWinner(p1Points, p2Points) {
  // Must have at least 4 points and lead by 2
  if (p1Points >= 4 && p1Points - p2Points >= 2) return 1;
  if (p2Points >= 4 && p2Points - p1Points >= 2) return 2;
  return null;
}

export function checkSetWinner(p1Games, p2Games) {
  // First to 6 games, must lead by 2
  if (p1Games >= 6 && p1Games - p2Games >= 2) return 1;
  if (p2Games >= 6 && p2Games - p1Games >= 2) return 2;
  // Tiebreak at 6-6: simplified, first to 7 wins
  if (p1Games === 7 && p2Games <= 6) return 1;
  if (p2Games === 7 && p1Games <= 6) return 2;
  return null;
}

export function checkMatchWinner(p1Sets, p2Sets) {
  if (p1Sets === 1) return 1;
  if (p2Sets === 1) return 2;
  return null;
}

export function shouldSwitchServer(p1Games, p2Games) {
  return true;
}

export function createInitialState() {
  return {
    p1Points: 0, p2Points: 0,
    p1Games: 0, p2Games: 0,
    p1Sets: 0, p2Sets: 0,
    servingPlayer: 1,
    isDeuce: false,
    gameWinner: null, setWinner: null, matchWinner: null
  };
}

export function processPoint(scoring, winner) {
  const s = { ...scoring };
  if (winner === 1) s.p1Points++;
  else s.p2Points++;
  s.isDeuce = s.p1Points >= 3 && s.p2Points >= 3 && s.p1Points === s.p2Points;

  const gameWinner = checkGameWinner(s.p1Points, s.p2Points);
  if (gameWinner) {
    if (gameWinner === 1) s.p1Games++;
    else s.p2Games++;
    s.p1Points = 0;
    s.p2Points = 0;
    s.isDeuce = false;
    if (shouldSwitchServer(s.p1Games, s.p2Games)) {
      s.servingPlayer = s.servingPlayer === 1 ? 2 : 1;
    }
    s.gameWinner = gameWinner;
    const setWinner = checkSetWinner(s.p1Games, s.p2Games);
    if (setWinner) {
      s.setWinner = setWinner;
      if (setWinner === 1) s.p1Sets++;
      else s.p2Sets++;
      s.matchWinner = checkMatchWinner(s.p1Sets, s.p2Sets);
    }
  }
  return s;
}
