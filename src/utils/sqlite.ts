import Database from 'better-sqlite3';
import path from 'path';

// Use an absolute path for the SQLite file to avoid issues in different environments
const dbPath = path.resolve(process.cwd(), 'dev.db');
const db = new Database(dbPath);

// Enable WAL mode for better performance in Next.js
db.pragma('journal_mode = WAL');

// Initialize tables if they don't exist
const initDb = () => {
  db.exec(`
    CREATE TABLE IF NOT EXISTS Player (
      id TEXT PRIMARY KEY,
      name TEXT UNIQUE NOT NULL,
      alliance TEXT DEFAULT 'Last Z Base',
      createdAt DATETIME DEFAULT CURRENT_TIMESTAMP,
      updatedAt DATETIME DEFAULT CURRENT_TIMESTAMP,
      kills INTEGER DEFAULT 0,
      totalPower INTEGER DEFAULT 0,
      latestScore REAL DEFAULT 0,
      gloryWarStatus TEXT DEFAULT 'Offline'
    );

    CREATE TABLE IF NOT EXISTS Snapshot (
      id TEXT PRIMARY KEY,
      playerId TEXT NOT NULL,
      createdAt DATETIME DEFAULT CURRENT_TIMESTAMP,
      kills INTEGER NOT NULL,
      totalPower INTEGER NOT NULL,
      structurePower INTEGER NOT NULL,
      techPower INTEGER NOT NULL,
      troopPower INTEGER NOT NULL,
      heroPower INTEGER NOT NULL,
      modVehiclePower INTEGER NOT NULL,
      score REAL DEFAULT 0,
      FOREIGN KEY (playerId) REFERENCES Player(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS Bug (
      id TEXT PRIMARY KEY,
      reporter TEXT,
      description TEXT NOT NULL,
      priority TEXT DEFAULT 'Medium',
      status TEXT DEFAULT 'Open',
      createdAt DATETIME DEFAULT CURRENT_TIMESTAMP
    );
  `);

  // Migration: Add gloryWarStatus if it doesn't exist
  try {
    const tableInfo = db.prepare("PRAGMA table_info(Player)").all() as any[];
    const hasGloryWar = tableInfo.some(col => col.name === 'gloryWarStatus');
    if (!hasGloryWar) {
      db.exec("ALTER TABLE Player ADD COLUMN gloryWarStatus TEXT DEFAULT 'Offline'");
    }
  } catch (e) {
    console.error("Migration failed:", e);
  }
};

initDb();

export default db;
