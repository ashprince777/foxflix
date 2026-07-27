const initSqlJs = require('sql.js');
const path = require('path');
const fs = require('fs');

const DB_PATH = path.join(process.cwd(), 'foxflix.db');
let dbInstance = null;

function saveDb() {
    if (!dbInstance) return;
    try {
        const data = dbInstance.export();
        const buffer = Buffer.from(data);
        fs.writeFileSync(DB_PATH, buffer);
    } catch (e) {
        console.error("Failed to save DB to disk:", e);
    }
}

const dbReadyPromise = (async () => {
    const SQL = await initSqlJs();
    if (fs.existsSync(DB_PATH)) {
        try {
            const fileBuffer = fs.readFileSync(DB_PATH);
            dbInstance = new SQL.Database(fileBuffer);
        } catch (e) {
            console.warn("Corrupt database file, re-initializing new DB:", e.message);
            dbInstance = new SQL.Database();
        }
    } else {
        dbInstance = new SQL.Database();
        saveDb();
    }

    dbInstance.run(`CREATE TABLE IF NOT EXISTS movies (
        id TEXT PRIMARY KEY,
        filename TEXT UNIQUE,
        title TEXT,
        clean_title TEXT,
        category TEXT,
        metadata TEXT,
        last_scanned TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        file_mtime INTEGER
    );`);

    dbInstance.run(`CREATE TABLE IF NOT EXISTS settings (
        key TEXT PRIMARY KEY,
        value TEXT
    );`);

    dbInstance.run(`INSERT OR IGNORE INTO settings (key, value) VALUES ('tmdb_api_key', '39cb798791ee4d0ea9e7fda44d9a9a5a');`);

    saveDb();
    return dbInstance;
})();

async function get(sql, params = []) {
    const db = await dbReadyPromise;
    const stmt = db.prepare(sql);
    stmt.bind(params);
    if (stmt.step()) {
        const row = stmt.getAsObject();
        stmt.free();
        return row;
    }
    stmt.free();
    return null;
}

async function query(sql, params = []) {
    const db = await dbReadyPromise;
    const stmt = db.prepare(sql);
    stmt.bind(params);
    const results = [];
    while (stmt.step()) {
        results.push(stmt.getAsObject());
    }
    stmt.free();
    return results;
}

async function run(sql, params = []) {
    const db = await dbReadyPromise;
    let formattedSql = sql;
    if (sql.includes('ON CONFLICT(filename) DO UPDATE')) {
        formattedSql = `INSERT OR REPLACE INTO movies (id, filename, title, clean_title, category, metadata, file_mtime) VALUES (?, ?, ?, ?, ?, ?, ?);`;
    } else if (sql.includes('ON CONFLICT(key) DO UPDATE')) {
        formattedSql = `INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?);`;
    }
    db.run(formattedSql, params);
    saveDb();
}

module.exports = {
    get,
    query,
    run
};
