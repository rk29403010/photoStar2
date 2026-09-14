import type Database from 'better-sqlite3';
import { MIGRATIONS } from './dbSchema';

const SQL_IDENTIFIER = '((?:[a-z]|_)\\w*)';
const ADD_COLUMN_PATTERN = new RegExp(`^ALTER TABLE ${SQL_IDENTIFIER} ADD COLUMN ${SQL_IDENTIFIER}\\b`, 'i');
const CREATE_TABLE_PATTERN = new RegExp(`^CREATE TABLE IF NOT EXISTS ${SQL_IDENTIFIER}\\b`, 'i');
const JOB_STAGE_RENAME = 'ALTER TABLE jobs RENAME COLUMN type TO stage';
const RETIRED_OPTIONAL_TABLES = new Set(['manual_face_isolations']);

type TableInfoRow = { name: string };

function normalizeSql(sql: string): string {
    return sql.trim().replaceAll(/\s+/g, ' ');
}

function tableExists(db: Database.Database, tableName: string): boolean {
    return Boolean(db.prepare(`
        SELECT name
        FROM sqlite_master
        WHERE type = 'table' AND name = ?
    `).get(tableName));
}

function columnExists(db: Database.Database, tableName: string, columnName: string): boolean {
    const rows = db.prepare(`PRAGMA table_info(${tableName})`).all() as TableInfoRow[];
    return rows.some((row) => row.name === columnName);
}

function applyAddColumn(
    db: Database.Database,
    sql: string,
    tableName: string,
    columnName: string,
): void {
    if (!tableExists(db, tableName)) {
        if (RETIRED_OPTIONAL_TABLES.has(tableName)) {
            return;
        }
        throw new Error(`Legacy migration expected table '${tableName}' to exist.`);
    }
    if (columnExists(db, tableName, columnName)) {
        return;
    }

    db.exec(sql);
    if (!columnExists(db, tableName, columnName)) {
        throw new Error(`Legacy migration did not create '${tableName}.${columnName}'.`);
    }
}

function applyJobStageRename(db: Database.Database, sql: string): void {
    if (!tableExists(db, 'jobs')) {
        throw new Error("Legacy migration expected table 'jobs' to exist.");
    }
    if (columnExists(db, 'jobs', 'stage')) {
        return;
    }
    if (!columnExists(db, 'jobs', 'type')) {
        throw new Error("Legacy jobs migration requires either a 'type' or 'stage' column.");
    }

    db.exec(sql);
    if (!columnExists(db, 'jobs', 'stage') || columnExists(db, 'jobs', 'type')) {
        throw new Error("Legacy jobs migration did not rename 'type' to 'stage'.");
    }
}

function applyCreateTable(db: Database.Database, sql: string, tableName: string): void {
    db.exec(sql);
    if (!tableExists(db, tableName)) {
        throw new Error(`Legacy migration did not create table '${tableName}'.`);
    }
}

function applyLegacyMigration(db: Database.Database, sql: string): void {
    const normalizedSql = normalizeSql(sql);
    const addColumnMatch = ADD_COLUMN_PATTERN.exec(normalizedSql);
    if (addColumnMatch) {
        applyAddColumn(db, sql, addColumnMatch[1], addColumnMatch[2]);
        return;
    }
    if (normalizedSql.toLowerCase() === JOB_STAGE_RENAME.toLowerCase()) {
        applyJobStageRename(db, sql);
        return;
    }
    const createTableMatch = CREATE_TABLE_PATTERN.exec(normalizedSql);
    if (createTableMatch) {
        applyCreateTable(db, sql, createTableMatch[1]);
        return;
    }
    throw new Error(`Unsupported legacy migration statement: ${normalizedSql}`);
}

export function applyLegacyMigrations(
    db: Database.Database,
    migrations: readonly string[] = MIGRATIONS,
): void {
    for (const migration of migrations) {
        db.transaction(() => applyLegacyMigration(db, migration))();
    }
}
