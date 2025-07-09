// main.js
// Hier kannst du später deine Spiellogik einbauen
console.log('Hello World!');
/*
    4 Gewinnt Logik und UI
    - 7x7 Feld
    - Zwei Farben: Schwarz (Player 1), Weiß (Player 2)
    - Spieler wechseln sich ab
    - Anzeige, wer am Zug ist
    - Gewinnüberprüfung
*/

const ROWS = 7;
const COLS = 7;
const board = [];
let currentPlayer = 1; // 1 = Schwarz, 2 = Weiß
let gameOver = false;
let myPlayer = null; // 1 = Schwarz, 2 = Weiß

const boardElem = document.createElement('div');
boardElem.id = 'board';
document.body.appendChild(boardElem);

// Multiplayer Code-Eingabe UI
const codeForm = document.createElement('form');
codeForm.id = 'codeForm';
codeForm.style.margin = '24px 0 8px 0';
codeForm.innerHTML = `
  <input id="gameCode" type="text" placeholder="Spielcode eingeben oder erstellen" maxlength="12" style="padding:6px;font-size:1em;width:180px;" required>
  <button type="submit" style="padding:6px 12px;font-size:1em;">Beitreten</button>
`;
document.body.insertBefore(codeForm, document.body.firstChild);

let joinedCode = null;
codeForm.onsubmit = async (e) => {
  e.preventDefault();
  const code = document.getElementById('gameCode').value.trim();
  if (!code) return;
  joinedCode = code;
  codeForm.style.display = 'none';
  const ok = await joinGame(code);
  if (!ok) return;
  setStatus(`Du bist ${myPlayer === 1 ? 'Schwarz (Startspieler)' : 'Weiß'}. Warte ggf. auf den zweiten Spieler.`);
  await listenToGameState();
  await listenToRestart();
  // Wenn noch kein Spiel existiert, initialisiere es
  if (board.flat().every(cell => cell === 0)) {
    await saveGameState();
  }
  fetchLobbies(); // Nach Join sofort Lobbys neu laden
};

/*
Sidebar für offene Lobbys mit Button
*/
const lobbySidebar = document.createElement('div');
lobbySidebar.id = 'lobbySidebar';
lobbySidebar.innerHTML = `<h3>Offene Lobbys</h3><button id="refreshLobbiesBtn" class="lobbyJoinBtn" style="margin-bottom:12px;">Suche Lobbys</button><div id="lobbyList">Suche Lobby.....</div>`;
document.body.appendChild(lobbySidebar);
document.getElementById('refreshLobbiesBtn').onclick = fetchLobbies;

async function fetchLobbies() {
  if (joinedCode) {
    updateLobbySidebar();
    return;
  }
  if (!db) return;
  const { ref, get } = await getDbFns();
  const gamesRef = ref(db, 'games');
  const snapshot = await get(gamesRef);
  const lobbyList = document.getElementById('lobbyList');
  lobbyList.innerHTML = '';
  if (!snapshot.exists()) {
    lobbyList.innerHTML = '<span style="color:#888">Keine offenen Lobbys</span>';
    return;
  }
  const games = snapshot.val();
  let found = false;
  Object.entries(games).forEach(([code, data]) => {
    if (data && data.players && (!data.players[2] || !data.gameOver)) {
      found = true;
      const btn = document.createElement('button');
      btn.className = 'lobbyJoinBtn';
      btn.textContent = code + (data.players[2] ? ' (läuft)' : ' (offen)');
      btn.onclick = () => {
        document.getElementById('gameCode').value = code;
        codeForm.requestSubmit();
      };
      lobbyList.appendChild(btn);
    }
  });
  if (!found) lobbyList.innerHTML = '<span style="color:#888">Keine offenen Lobbys</span>';
}
fetchLobbies(); // Nur einmal initial laden
window.addEventListener('DOMContentLoaded', fetchLobbies);

// Hilfsfunktion: Zeitstempel holen
function now() {
  return Date.now();
}

// joinGame: Lobby wird zurückgesetzt, wenn Spiel vorbei, zu alt oder beide Spieler lange inaktiv
async function joinGame(code) {
  if (!db) return;
  const { ref, get, set, update, remove } = await getDbFns();
  const gameRef = ref(db, 'games/' + code);
  const snapshot = await get(gameRef);
  let data = snapshot.val();
  const MAX_AGE = 1000 * 60 * 60; // 1 Stunde
  const MAX_INACTIVE = 1000 * 60 * 2; // 2 Minuten
  const tooOld = data && data.timestamp && (now() - data.timestamp > MAX_AGE);
  const finished = data && data.gameOver;
  // Prüfe Inaktivität beider Spieler
  let bothInactive = false;
  if (data && data.players) {
    const p1 = data.players[1]?.lastActive || 0;
    const p2 = data.players[2]?.lastActive || 0;
    if (p1 && p2 && now() - p1 > MAX_INACTIVE && now() - p2 > MAX_INACTIVE) {
      bothInactive = true;
    }
  }
  if (!data || tooOld || finished || bothInactive) {
    // Lobby zurücksetzen
    myPlayer = 1;
    for (let r = 0; r < ROWS; r++) for (let c = 0; c < COLS; c++) board[r][c] = 0;
    currentPlayer = 1;
    gameOver = false;
    await set(gameRef, {
      board,
      currentPlayer: 1,
      gameOver: false,
      players: { 1: { lastActive: now() } },
      timestamp: now()
    });
  } else {
    // Spiel existiert schon
    if (!data.players || !data.players[2]) {
      myPlayer = 2;
      await update(gameRef, { 'players/2': { lastActive: now() }, timestamp: now() });
    } else if (data.players[1] && !data.players[2]) {
      myPlayer = 2;
      await update(gameRef, { 'players/2': { lastActive: now() }, timestamp: now() });
    } else if (data.players[2] && !data.players[1]) {
      myPlayer = 1;
      await update(gameRef, { 'players/1': { lastActive: now() }, timestamp: now() });
    } else {
      setStatus('Lobby ist voll!');
      return false;
    }
  }
  // Aktualisiere lastActive regelmäßig
  setInterval(async () => {
    const { ref, update } = await getDbFns();
    await update(gameRef, { ['players/' + myPlayer + '/lastActive']: now() });
  }, 30000); // alle 30 Sekunden
  return true;
}

function createBoard() {
    boardElem.innerHTML = '';
    for (let r = 0; r < ROWS; r++) {
        board[r] = [];
        for (let c = 0; c < COLS; c++) {
            board[r][c] = 0;
            const cell = document.createElement('div');
            cell.className = 'cell';
            cell.dataset.row = r;
            cell.dataset.col = c;
            cell.onclick = () => handleMove(c);
            boardElem.appendChild(cell);
        }
    }
}

function handleMove(col) {
    if (gameOver || !joinedCode) return;
    if (myPlayer !== currentPlayer) return;
    for (let row = ROWS - 1; row >= 0; row--) {
        if (board[row][col] === 0) {
            board[row][col] = currentPlayer;
            updateBoard();
            if (checkWin(row, col)) {
                gameOver = true;
                setStatus(`Spieler ${currentPlayer === 1 ? 'Schwarz' : 'Weiß'} gewinnt!`);
                saveGameState();
            } else {
                currentPlayer = 3 - currentPlayer;
                setStatus(`Am Zug: ${currentPlayer === 1 ? 'Schwarz' : 'Weiß'}`);
                saveGameState();
            }
            return;
        }
    }
}

function updateBoard() {
    const cells = boardElem.children;
    for (let r = 0; r < ROWS; r++) {
        for (let c = 0; c < COLS; c++) {
            const idx = r * COLS + c;
            cells[idx].style.background = board[r][c] === 1 ? '#111' : board[r][c] === 2 ? '#fff' : '#222';
            cells[idx].style.border = '1px solid #555';
        }
    }
}

function setStatus(msg) {
    let statusElem = document.getElementById('status');
    if (!statusElem) {
        statusElem = document.createElement('div');
        statusElem.id = 'status';
        document.body.insertBefore(statusElem, boardElem);
    }
    statusElem.textContent = msg;
}

function checkWin(row, col) {
    const player = board[row][col];
    function count(dx, dy) {
        let cnt = 0, r = row + dy, c = col + dx;
        while (r >= 0 && r < ROWS && c >= 0 && c < COLS && board[r][c] === player) {
            cnt++; r += dy; c += dx;
        }
        return cnt;
    }
    // 4 in a row: horizontal, vertical, diagonal
    return (
        count(1, 0) + count(-1, 0) >= 3 ||
        count(0, 1) + count(0, -1) >= 3 ||
        count(1, 1) + count(-1, -1) >= 3 ||
        count(1, -1) + count(-1, 1) >= 3
    );
}

// Firebase Realtime Database Zugriff
// Firebase Multiplayer Logik
let db = null;
window.addEventListener('DOMContentLoaded', () => {
  db = window.firebaseDatabase;
});

// Hilfsfunktionen für Firebase
async function getDbFns() {
  return await import('https://www.gstatic.com/firebasejs/11.10.0/firebase-database.js');
}

// Spielstand in die Datenbank schreiben
async function saveGameState() {
  if (!db || !joinedCode) return;
  const { ref, set } = await getDbFns();
  await set(ref(db, 'games/' + joinedCode), {
    board,
    currentPlayer,
    gameOver
  });
}

// Spielstand aus der Datenbank laden und auf Änderungen hören
async function listenToGameState() {
  if (!db || !joinedCode) return;
  const { ref, onValue } = await getDbFns();
  const gameRef = ref(db, 'games/' + joinedCode);
  onValue(gameRef, (snapshot) => {
    const data = snapshot.val();
    if (data) {
      for (let r = 0; r < ROWS; r++) {
        for (let c = 0; c < COLS; c++) {
          board[r][c] = data.board[r][c];
        }
      }
      currentPlayer = data.currentPlayer;
      gameOver = data.gameOver;
      updateBoard();
      setStatus(gameOver
        ? `Spieler ${currentPlayer === 1 ? 'Schwarz' : 'Weiß'} gewinnt!`
        : `Am Zug: ${currentPlayer === 1 ? 'Schwarz' : 'Weiß'}`
      );
    }
  });
}

// Game-Over-Overlay für beide Spieler anzeigen und Neustart synchronisieren
let gameOverOverlay = null;
let restartRequested = false;
let restartBy = null;

function showGameOver(winner) {
  if (!gameOverOverlay) {
    gameOverOverlay = document.createElement('div');
    gameOverOverlay.id = 'gameOverOverlay';
    gameOverOverlay.innerHTML = `
      <div class="gameover-box">
        <h2 id="gameover-text"></h2>
        <button id="restartBtn">Play Again</button>
      </div>
    `;
    document.body.appendChild(gameOverOverlay);
    document.getElementById('restartBtn').onclick = requestRestart;
  }
  document.getElementById('gameover-text').textContent = `${winner} hat gewonnen!`;
  gameOverOverlay.style.display = 'flex';
}
function hideGameOver() {
  if (gameOverOverlay) gameOverOverlay.style.display = 'none';
}

// Zeige Overlay, wenn das Spiel vorbei ist (auch wenn man nicht der Gewinner ist)
function checkAndShowGameOver() {
  if (gameOver) {
    showGameOver(currentPlayer === 1 ? 'Schwarz' : 'Weiß');
  }
}

// Neustartwunsch in die DB schreiben
async function requestRestart() {
  if (!db || !joinedCode) return;
  const { ref, update } = await getDbFns();
  await update(ref(db, 'games/' + joinedCode), { restartRequest: myPlayer });
}

// Neustart, wenn einer gedrückt hat
async function listenToRestart() {
  if (!db || !joinedCode) return;
  const { ref, onValue } = await getDbFns();
  const gameRef = ref(db, 'games/' + joinedCode);
  onValue(gameRef, (snapshot) => {
    const data = snapshot.val();
    if (data) {
      // Overlay für beide anzeigen, wenn gameOver true
      if (data.gameOver) {
        gameOver = true;
        showGameOver(data.currentPlayer === 1 ? 'Schwarz' : 'Weiß');
      } else {
        hideGameOver();
      }
      // Neustart
      if (data.restartRequest && !restartRequested) {
        restartRequested = true;
        restartBy = data.restartRequest;
        restartGame(restartBy);
      }
    }
  });
}

// Restart-Logik: Wer zuerst klickt, beginnt
async function restartGame(starter) {
  for (let r = 0; r < ROWS; r++) for (let c = 0; c < COLS; c++) board[r][c] = 0;
  currentPlayer = starter;
  gameOver = false;
  updateBoard();
  setStatus('Am Zug: ' + (currentPlayer === 1 ? 'Schwarz' : 'Weiß'));
  hideGameOver();
  restartRequested = false;
  const { ref, update } = await getDbFns();
  await update(ref(db, 'games/' + joinedCode), {
    board,
    currentPlayer,
    gameOver,
    restartRequest: null
  });
}

// Initialisierung
createBoard();
updateBoard();
setStatus('Am Zug: Schwarz');

function updateLobbySidebar() {
  const sidebar = document.getElementById('lobbySidebar');
  const lobbyList = document.getElementById('lobbyList');
  if (joinedCode) {
    sidebar.innerHTML = `<h3>Lobby: <span style='color:#fff'>${joinedCode}</span></h3><button id='leaveLobbyBtn' class='lobbyJoinBtn' style='margin-top:18px;'>Lobby fliehen</button>`;
    document.getElementById('leaveLobbyBtn').onclick = leaveLobby;
  }
}

async function leaveLobby() {
  if (!db || !joinedCode) return;
  const { ref, update } = await getDbFns();
  await update(ref(db, 'games/' + joinedCode), { ['players/' + myPlayer]: null });
  joinedCode = null;
  myPlayer = null;
  fetchLobbies(); // Nach dem Verlassen sofort Lobbys neu laden
  location.reload();
}
