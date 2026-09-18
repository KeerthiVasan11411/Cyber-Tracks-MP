import express, { Request, Response } from 'express';
import cors from 'cors';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = process.env.PORT ? parseInt(process.env.PORT, 10) : 3001;

// Middleware
app.use(cors());
app.use(express.json());

// Serve static web app assets
const rootDir = path.resolve(__dirname, '..');
app.use(express.static(rootDir));

interface ScoreEntry {
  id: number;
  player: string;
  score: number;
  date: string;
}

const DATA_DIR = path.join(rootDir, 'data');
const SCORES_FILE = path.join(DATA_DIR, 'scores.json');

let highScores: ScoreEntry[] = [];

function playerKey(player: string): string {
  return player.trim().toLocaleLowerCase();
}

function deduplicateScores(scores: ScoreEntry[]): ScoreEntry[] {
  const bestByPlayer = new Map<string, ScoreEntry>();
  scores.forEach((entry) => {
    const current = bestByPlayer.get(playerKey(entry.player));
    if (!current || entry.score > current.score) {
      bestByPlayer.set(playerKey(entry.player), entry);
    }
  });
  return Array.from(bestByPlayer.values()).sort((a, b) => b.score - a.score);
}

// Ensure data directory and load scores
function loadScores(): void {
  try {
    if (!fs.existsSync(DATA_DIR)) {
      fs.mkdirSync(DATA_DIR, { recursive: true });
    }
    if (fs.existsSync(SCORES_FILE)) {
      const data = fs.readFileSync(SCORES_FILE, 'utf-8');
      highScores = deduplicateScores(JSON.parse(data));
      saveScores();
    } else {
      highScores = [];
      saveScores();
    }
  } catch (err) {
    console.error('Error loading scores from disk:', err);
    highScores = [];
  }
}

function saveScores(): void {
  try {
    if (!fs.existsSync(DATA_DIR)) {
      fs.mkdirSync(DATA_DIR, { recursive: true });
    }
    fs.writeFileSync(SCORES_FILE, JSON.stringify(highScores, null, 2), 'utf-8');
  } catch (err) {
    console.error('Error saving scores to disk:', err);
  }
}

// Initial load
loadScores();

// GET endpoint: Fetch the persistent global score history.
app.get('/api/scores', (_req: Request, res: Response) => {
  res.json(highScores);
});

// POST endpoint: Receive score from game
app.post('/api/scores', (req: Request, res: Response) => {
  const { player, score } = req.body;

  if (!player || typeof score !== 'number' || score < 0) {
    res.status(400).json({ error: 'Invalid score payload' });
    return;
  }

  const cleanPlayer = Array.from(String(player))
    .filter((character) => {
      const code = character.charCodeAt(0);
      return code >= 32 && code !== 127;
    })
    .join('')
    .replace(/\s+/g, ' ')
    .trim()
    .substring(0, 16);

  if (cleanPlayer.length < 2) {
    res.status(400).json({ error: 'Player name must contain at least 2 characters' });
    return;
  }

  const submittedScore = Math.floor(score);
  const existingScore = highScores.find(
    (entry) => playerKey(entry.player) === playerKey(cleanPlayer)
  );

  if (existingScore) {
    if (submittedScore > existingScore.score) {
      existingScore.score = submittedScore;
      existingScore.date = new Date().toISOString();
    }
    highScores = deduplicateScores(highScores);
    saveScores();
    const rank = highScores.findIndex((entry) => entry.id === existingScore.id) + 1;
    res.status(200).json({ message: 'Best score kept successfully!', data: existingScore, rank });
    return;
  }

  const newScore: ScoreEntry = {
    id: Date.now(),
    player: cleanPlayer,
    score: submittedScore,
    date: new Date().toISOString(),
  };

  highScores.push(newScore);
  highScores = deduplicateScores(highScores);

  saveScores();

  const rank = highScores.findIndex((s) => s.id === newScore.id) + 1;

  console.log(`New score recorded: ${cleanPlayer} scored ${newScore.score} (Rank #${rank})`);
  res.status(201).json({ message: 'Score saved successfully!', data: newScore, rank });
});

export function startServer(port: number = PORT) {
  return new Promise<{ app: typeof app; server: ReturnType<typeof app.listen>; port: number }>(
    (resolve) => {
      const server = app.listen(port, () => {
        console.log(`Backend API & Cyber Racer Web App running on http://localhost:${port}`);
        resolve({ app, server, port });
      });
    }
  );
}

// Start standalone if executed directly
if (
  process.argv[1] &&
  (process.argv[1].endsWith('index.js') || process.argv[1].endsWith('index.ts'))
) {
  startServer(PORT);
}

export default app;
