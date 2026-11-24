
/**
 * Module 3: Content Management
 * Sprint 3: SQLite Database
 *
 * Stores learning modules, learning units,
 * and learning-material metadata.
 */

import { Database } from 'bun:sqlite'
import { mkdirSync } from 'node:fs'
import { dirname, join } from 'node:path'
import type { LearningModule } from './module.model'
import type { LearningUnit } from './unit.model'
import type { LearningMaterial } from './material.model'

const defaultDatabasePath = join(
  import.meta.dir,
  '.c3l-content-data',
  'content.sqlite',
)

/**
 * Open a persistent or in-memory SQLite database.
 */
export function openContentDatabase(
  databasePath: string = defaultDatabasePath,
): Database {
  if (databasePath !== ':memory:') {
    mkdirSync(dirname(databasePath), { recursive: true })
  }

  const database = new Database(databasePath, {
    create: true,
  })

  database.exec('PRAGMA foreign_keys = ON')

  return database
}

/**
 * Create tables for learning modules, learning units,
 * and learning-material metadata.
 */
export function createContentTables(database: Database): void {
  // Existing learning modules table.
  database.exec(`
    CREATE TABLE IF NOT EXISTS learning_modules (
      id TEXT PRIMARY KEY,
      course_id TEXT NOT NULL,
      title TEXT NOT NULL,
      description TEXT,
      week INTEGER,
      topic TEXT,
      created_at TEXT NOT NULL,
      published INTEGER NOT NULL DEFAULT 0,
      visibility TEXT NOT NULL DEFAULT 'hidden'
        CHECK (visibility IN ('visible', 'hidden'))
    )
  `)

  // Support combined course and module foreign keys.
  database.exec(`
    CREATE UNIQUE INDEX IF NOT EXISTS
      idx_learning_modules_course_module
    ON learning_modules (course_id, id)
  `)

  // Existing learning units table.
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

  // Improve learning-unit retrieval.
  database.exec(`
    CREATE INDEX IF NOT EXISTS
      idx_learning_units_course_module
    ON learning_units (course_id, module_id)
  `)

  // Sprint 3: Persistent learning-material metadata.
  database.exec(`
    CREATE TABLE IF NOT EXISTS learning_materials (
      id TEXT PRIMARY KEY,
      course_id TEXT NOT NULL,
      module_id TEXT NOT NULL,
      filename TEXT NOT NULL,
      stored_filename TEXT NOT NULL UNIQUE,
      size INTEGER NOT NULL CHECK (size >= 0),
      mime_type TEXT NOT NULL,
      uploaded_at TEXT NOT NULL,

      FOREIGN KEY (course_id, module_id)
        REFERENCES learning_modules (course_id, id)
    )
  `)

  // Improve material retrieval by course and module.
  database.exec(`
    CREATE INDEX IF NOT EXISTS
      idx_learning_materials_course_module
    ON learning_materials (course_id, module_id)
  `)
}

/**
 * Save a learning module in the database.
 */
export function saveModuleToDatabase(
  database: Database,
  module: LearningModule,
): void {
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
 * Retrieve learning modules belonging to one course.
 */
export function getModulesFromDatabase(
  database: Database,
  courseId: string,
): LearningModule[] {
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
 * Update publication only for a module in the correct course.
 */
export function updateModulePublicationInDatabase(
  database: Database,
  courseId: string,
  moduleId: string,
  published: boolean,
): boolean {
  const result = database
    .query(`
      UPDATE learning_modules
      SET published = ?
      WHERE id = ? AND course_id = ?
    `)
    .run(published ? 1 : 0, moduleId, courseId)

  return result.changes === 1
}

/**
 * Update visibility only for a module in the correct course.
 */
export function updateModuleVisibilityInDatabase(
  database: Database,
  courseId: string,
  moduleId: string,
  visibility: 'visible' | 'hidden',
): boolean {
  const result = database
    .query(`
      UPDATE learning_modules
      SET visibility = ?
      WHERE id = ? AND course_id = ?
    `)
    .run(visibility, moduleId, courseId)

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

/**
 * Save learning-material metadata in SQLite.
 *
 * The foreign key ensures that the material belongs
 * to a valid module in the correct course.
 */
export function saveMaterialToDatabase(
  database: Database,
  material: LearningMaterial,
): void {
  database
    .query(`
      INSERT INTO learning_materials (
        id,
        course_id,
        module_id,
        filename,
        stored_filename,
        size,
        mime_type,
        uploaded_at
      )
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `)
    .run(
      material.id,
      material.courseId,
      material.moduleId,
      material.filename,
      material.storedFilename,
      material.size,
      material.mimeType,
      material.uploadedAt,
    )
}

/**
 * Retrieve learning-material metadata for a specific module.
 *
 * Both course ID and module ID are required
 * to maintain course and module isolation.
 */
export function getMaterialsFromDatabase(
  database: Database,
  courseId: string,
  moduleId: string,
): LearningMaterial[] {
  const rows = database
    .query(`
      SELECT
        id,
        course_id,
        module_id,
        filename,
        stored_filename,
        size,
        mime_type,
        uploaded_at
      FROM learning_materials
      WHERE course_id = ?
        AND module_id = ?
      ORDER BY uploaded_at, rowid
    `)
    .all(courseId, moduleId) as Array<{
    id: string
    course_id: string
    module_id: string
    filename: string
    stored_filename: string
    size: number
    mime_type: string
    uploaded_at: string
  }>

  return rows.map((row) => ({
    id: row.id,
    courseId: row.course_id,
    moduleId: row.module_id,
    filename: row.filename,
    storedFilename: row.stored_filename,
    size: row.size,
    mimeType: row.mime_type,
    uploadedAt: row.uploaded_at,
  }))
}
