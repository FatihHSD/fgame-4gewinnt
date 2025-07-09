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
  setStatus(`Mit Code "${code}" verbunden. Warte auf zweiten Spieler oder beginne das Spiel!`);
  await listenToGameState();
  // Wenn noch kein Spiel existiert, initialisiere es
  if (board.flat().every(cell => cell === 0)) {
    await saveGameState();
  }
};

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
    for (let row = ROWS - 1; row >= 0; row--) {
        if (board[row][col] === 0) {
            board[row][col] = currentPlayer;
            updateBoard();
            if (checkWin(row, col)) {
                gameOver = true;
                setStatus(`Spieler ${currentPlayer === 1 ? 'Schwarz' : 'Weiß'} gewinnt!`);
            } else {
                currentPlayer = 3 - currentPlayer;
                setStatus(`Am Zug: ${currentPlayer === 1 ? 'Schwarz' : 'Weiß'}`);
            }
            saveGameState(); // Spielstand speichern
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

// Initialisierung
createBoard();
updateBoard();
setStatus('Am Zug: Schwarz');
