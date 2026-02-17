import sqlite3 from "sqlite3";
import fs from "fs";
import path from "path";

const DB_FILE = path.join("./data", "database.db");
let db;

export async function init() {
    if (!fs.existsSync("./data")) fs.mkdirSync("./data");
    db = new sqlite3.Database(DB_FILE, (err) => {
        if (err) console.error("Error initializing database:", err);
    });
}

export function checkIfTableExists(tableName, callback) {
    db.get(
        `SELECT name FROM sqlite_master WHERE type='table' AND name=?`,
        [tableName],
        (err, row) => {
            if (err) {
                console.error("Error checking if table exists:", err);
                return callback(err);
            }
            callback(null, !!row);
        }
    );
}

export function addTable(tableName, columns) {
    const query = `CREATE TABLE IF NOT EXISTS ${tableName} (${columns.join(", ")})`;
    db.run(query, (err) => {
        if (err) console.error("Error adding table:", err);
    });
}

export function removeTable(tableName) {
    db.run(`DROP TABLE IF EXISTS ${tableName}`, (err) => {
        if (err) console.error("Error removing table:", err);
    });
}

export function addRow(tableName, data) {
    const cols = Object.keys(data).join(", ");
    const placeholders = Object.keys(data).map(() => "?").join(", ");
    const values = Object.values(data);
    db.run(`INSERT INTO ${tableName} (${cols}) VALUES (${placeholders})`, values, (err) => {
        if (err) console.error("Error adding row:", err);
    });
}

export function removeRow(tableName, whereObj) {
    const whereClause = Object.keys(whereObj).map((k) => `${k}=?`).join(" AND ");
    const values = Object.values(whereObj);
    db.run(`DELETE FROM ${tableName} WHERE ${whereClause}`, values, (err) => {
        if (err) console.error("Error removing row:", err);
    });
}


export function getRowAsJson(tableName, whereObj, callback) {
    const whereClause = Object.keys(whereObj).map((k) => `${k}=?`).join(" AND ");
    const values = Object.values(whereObj);
    db.get(`SELECT * FROM ${tableName} WHERE ${whereClause}`, values, (err, row) => {
        if (err) {
            console.error("Error fetching row:", err);
            return callback(err);
        }
        callback(null, row || null);
    });
}


export function getRowsFilteredAsJson(tableName, whereClause = "", params = [], callback) {
    const query = `SELECT * FROM ${tableName} ${whereClause ? `WHERE ${whereClause}` : ""}`;
    db.all(query, params, (err, rows) => {
        if (err) {
            console.error("Error fetching rows:", err);
            return callback(err);
        }
        callback(null, rows || []);
    });
}

export function getAllTableNamesAsJson(callback) {
    db.all(`SELECT name FROM sqlite_master WHERE type='table'`, [], (err, rows) => {
        if (err) {
            console.error("Error fetching table names:", err);
            return callback(err);
        }
        callback(null, rows.map((r) => r.name) || []);
    });
}

export function backupDbAsDb(filePath) {
    try {
        fs.copyFileSync(DB_FILE, filePath);
        console.log(`Database backup successful to ${filePath}`);
    } catch (err) {
        console.error("Error backing up database:", err);
    }
}

export function getTableData(tableName, callback) {
    db.all(`SELECT * FROM ${tableName}`, [], (err, rows) => {
        if (err) {
            console.error("Error fetching table data:", err);
            return callback(err);
        }
        callback(null, rows || []);
    });
}

export function updateRow(tableName, data, whereObj) {
    const setClause = Object.keys(data).map((key) => `${key}=?`).join(", ");
    const whereClause = Object.keys(whereObj).map((key) => `${key}=?`).join(" AND ");
    const values = [...Object.values(data), ...Object.values(whereObj)];
    db.run(`UPDATE ${tableName} SET ${setClause} WHERE ${whereClause}`, values, (err) => {
        if (err) console.error("Error updating row:", err);
    });
}

export function getRowsFiltered(tableName, whereClause = "", params = [], callback) {
    const query = `SELECT * FROM ${tableName} ${whereClause ? `WHERE ${whereClause}` : ""}`;
    db.all(query, params, (err, rows) => {
        if (err) {
            console.error("Error fetching rows:", err);
            return callback(err);
        }
        callback(null, Array.isArray(rows) ? rows : []);
    });
}