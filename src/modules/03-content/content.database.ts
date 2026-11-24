
/**
 * Module 3: Content Management
 * Sprint 3: SQLite Database
 *
 * This file helps us connect to the database.
 * The database stores learning modules and learning units.
 */

// Import SQLite from Bun.
import { Database } from 'bun:sqlite'

// Import tools to create folders and work with file paths.
import { mkdirSync } from 'node:fs'
import { dirname, join } from 'node:path'
import type { LearningModule } from './module.model'
import type { LearningUnit } from './unit.model'

// Set the location where our database file will be saved.
const defaultDatabasePath = join(import.meta.dir, '.c3l-content-data', 'content.sqlite')

/**
 * Open a database connection.
 *
 * If no path is given, use our local database file.
 * For testing, we can use ':memory:' instead.
 */
export function openContentDatabase(databasePath: string = defaultDatabasePath): Database {
  // Create the database folder if it does not exist.
  // We do not need a folder for an in-memory database.
  if (databasePath !== ':memory:') {
    mkdirSync(dirname(databasePath), { recursive: true })
  }

  // Open the database.
  // If the database file does not exist, create it.
  const database = new Database(databasePath, {
    create: true,
  })

  // Turn on foreign key checks.
  // This helps keep related database records correct.
  database.exec('PRAGMA foreign_keys = ON')

  // Return the database so other files can use it.
  return database
}

/**
 * Create the tables for learning modules and learning units.
 *
 * Learning units belong to a parent learning module.
 * Units inherit their parent module's week and topic organization.
 */
export function createContentTables(database: Database): void {
  // Preserve the existing learning modules table.
  database.exec(`
    CREATE TABLE IF NOT EXISTS learning_modules (
      id TEXT PRIMARY KEY,
      course_id TEXT NOT NULL,
      title TEXT NOT NULL,
      description TEXT,
      week INTEGER,
      topic TEXT,
      created_at TEXT NOT NULL,

      -- New modules start as unpublished and hidden.
      published INTEGER NOT NULL DEFAULT 0,
      visibility TEXT NOT NULL DEFAULT 'hidden'
        CHECK (visibility IN ('visible', 'hidden'))
    )
  `)

  // Support the combined course and module foreign key.
  database.exec(`
    CREATE UNIQUE INDEX IF NOT EXISTS
      idx_learning_modules_course_module
    ON learning_modules (course_id, id)
  `)

  // Create a separate table for learning units.
  database.exec(`
    CREATE TABLE IF NOT EXISTS learning_units (
      id TEXT PRIMARY KEY,
      course_id TEXT NOT NULL,
      module_id TEXT NOT NULL,
      title TEXT NOT NULL CHECK (length(trim(title)) > 0),
      description TEXT,
      created_at TEXT NOT NULL,

      FOREIGN KEY (course_id, module_id)
        REFERENCES learning_modules (course_id, id)
    )
  `)

  // Improve unit retrieval by course and parent module.
  database.exec(`
    CREATE INDEX IF NOT EXISTS
      idx_learning_units_course_module
    ON learning_units (course_id, module_id)
  `)
}

/**
 * Save a learning module in the database.
 *
 * This function stores the module information
 * so we can use it again later.
 */
export function saveModuleToDatabase(database: Database, module: LearningModule): void {
  // Add the module information to the database.
  database
    .query(`
    INSERT INTO learning_modules (
      id,
      course_id,
      title,
      description,
      week,
      topic,
      created_at,
      published,
      visibility
    )
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
  `)
    .run(
      module.id,
      module.courseId,
      module.title,
      module.description ?? null,
      module.week ?? null,
      module.topic ?? null,
      module.createdAt,
      module.published ? 1 : 0,
      module.visibility,
    )
}

/**
 * Get all learning modules for one course.
 *
 * This function only returns modules
 * that belong to the requested course.
 */
export function getModulesFromDatabase(database: Database, courseId: string): LearningModule[] {
  // Read the modules that belong to this course.
  const rows = database
    .query(`
    SELECT
      id,
      course_id,
      title,
      description,
      week,
      topic,
      created_at,
      published,
      visibility
    FROM learning_modules
    WHERE course_id = ?
    ORDER BY created_at, rowid
  `)
    .all(courseId) as Array<{
    id: string
    course_id: string
    title: string
    description: string | null
    week: number | null
    topic: string | null
    created_at: string
    published: number
    visibility: 'visible' | 'hidden'
  }>

  // Convert database column names to our module format.
  return rows.map((row) => ({
    id: row.id,
    courseId: row.course_id,
    title: row.title,
    ...(row.description !== null && {
      description: row.description,
    }),
    ...(row.week !== null && {
      week: row.week,
    }),
    ...(row.topic !== null && {
      topic: row.topic,
    }),
    createdAt: row.created_at,
    published: row.published === 1,
    visibility: row.visibility,
  }))
}

/**
 * Update the publication state of a learning module.
 *
 * This function saves the new state in SQLite.
 * It only updates a module in the correct course.
 */
export function updateModulePublicationInDatabase(
  database: Database,
  courseId: string,
  moduleId: string,
  published: boolean,
): boolean {
  // Update the module only when both IDs match.
  const result = database
    .query(`
    UPDATE learning_modules
    SET published = ?
    WHERE id = ? AND course_id = ?
  `)
    .run(published ? 1 : 0, moduleId, courseId)

  // Return true if a module was updated.
  return result.changes === 1
}

/**
 * Update the visibility state of a learning module.
 *
 * This function saves the new state in SQLite.
 * It only updates a module in the correct course.
 */
export function updateModuleVisibilityInDatabase(
  database: Database,
  courseId: string,
  moduleId: string,
  visibility: 'visible' | 'hidden',
): boolean {
  // Update the module only when both IDs match.
  const result = database
    .query(`
    UPDATE learning_modules
    SET visibility = ?
    WHERE id = ? AND course_id = ?
  `)
    .run(visibility, moduleId, courseId)

  // Return true if a module was updated.
  return result.changes === 1
}


/**
 * Save a learning unit in the database.
 *
 * The foreign key ensures that the parent module
 * belongs to the correct course.
 */
export function saveUnitToDatabase(
  database: Database,
  unit: LearningUnit,
): void {
  database
    .query(`
      INSERT INTO learning_units (
        id,
        course_id,
        module_id,
        title,
        description,
        created_at
      )
      VALUES (?, ?, ?, ?, ?, ?)
    `)
    .run(
      unit.id,
      unit.courseId,
      unit.moduleId,
      unit.title,
      unit.description ?? null,
      unit.createdAt,
    )
}

/**
 * Retrieve learning units belonging to a specific module.
 *
 * Units inherit week and topic from their parent module.
 * Both course ID and module ID are checked for isolation.
 */
export function getUnitsFromDatabase(
  database: Database,
  courseId: string,
  moduleId: string,
): LearningUnit[] {
  const rows = database
    .query(`
      SELECT
        u.id,
        u.course_id,
        u.module_id,
        u.title,
        u.description,
        u.created_at,
        m.week,
        m.topic
      FROM learning_units AS u
      INNER JOIN learning_modules AS m
        ON u.module_id = m.id
        AND u.course_id = m.course_id
      WHERE u.course_id = ?
        AND u.module_id = ?
      ORDER BY u.created_at, u.rowid
    `)
    .all(courseId, moduleId) as Array<{
    id: string
    course_id: string
    module_id: string
    title: string
    description: string | null
    created_at: string
    week: number | null
    topic: string | null
  }>

  return rows.map((row) => ({
    id: row.id,
    courseId: row.course_id,
    moduleId: row.module_id,
    title: row.title,
    ...(row.description !== null && {
      description: row.description,
    }),
    createdAt: row.created_at,
    ...(row.week !== null && {
      week: row.week,
    }),
    ...(row.topic !== null && {
      topic: row.topic,
    }),
  }))
}
