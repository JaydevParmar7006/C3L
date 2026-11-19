import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, test } from 'bun:test'
import {
  openContentDatabase,
  createContentTables,
  saveModuleToDatabase,
  getModulesFromDatabase,
  updateModulePublicationInDatabase,
  updateModuleVisibilityInDatabase,
} from './content.database'

describe('Module 3 SQLite database', () => {
  test('creates the learning modules table', () => {
    // Create a temporary database for this test.
    const database = openContentDatabase(':memory:')

    try {
      // Create the learning modules table.
      createContentTables(database)

      // Check if the table was created.
      const result = database
        .query(
          "SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'learning_modules'",
        )
        .get() as { name: string } | null

      // The table should exist.
      expect(result?.name).toBe('learning_modules')
    } finally {
      // Close the database after testing.
      database.close()
    }
  })

  test('new modules are unpublished and hidden by default', () => {
    // Create a temporary database.
    const database = openContentDatabase(':memory:')

    try {
      // Create our database table.
      createContentTables(database)

      // Add one sample learning module.
      database
        .query(`
          INSERT INTO learning_modules
            (id, course_id, title, created_at)
          VALUES (?, ?, ?, ?)
        `)
        .run(
          'module-1',
          'course-101',
          'Introduction to TypeScript',
          new Date().toISOString(),
        )

      // Get the publication and visibility values.
      const module = database
        .query(`
          SELECT published, visibility
          FROM learning_modules
          WHERE id = ?
        `)
        .get('module-1') as {
          published: number
          visibility: string
        } | null

      // New modules must be unpublished and hidden.
      expect(module?.published).toBe(0)
      expect(module?.visibility).toBe('hidden')
    } finally {
      // Close the database after the test.
      database.close()
    }
  })

  test('keeps module data after the database is reopened', () => {
    // Create a temporary folder for this test.
    const folder = mkdtempSync(join(tmpdir(), 'c3l-module3-'))
    const databasePath = join(folder, 'test.sqlite')

    try {
      // Open the database and create its table.
      const firstDatabase = openContentDatabase(databasePath)

      try {
        createContentTables(firstDatabase)

        // Save one sample module.
        firstDatabase
          .query(`
            INSERT INTO learning_modules
              (id, course_id, title, created_at)
            VALUES (?, ?, ?, ?)
          `)
          .run(
            'module-101',
            'course-101',
            'TypeScript Basics',
            new Date().toISOString(),
          )
      } finally {
        // Close the first database connection.
        firstDatabase.close()
      }

      // Open the same database file again.
      const secondDatabase = openContentDatabase(databasePath)

      try {
        // Check that our saved module still exists.
        const module = secondDatabase
          .query(`
            SELECT title
            FROM learning_modules
            WHERE id = ?
          `)
          .get('module-101') as { title: string } | null

        expect(module?.title).toBe('TypeScript Basics')
      } finally {
        // Close the second database connection.
        secondDatabase.close()
      }
    } finally {
      // Delete the temporary test folder.
      rmSync(folder, { recursive: true, force: true })
    }
  })

  test('saves a learning module in SQLite', () => {
    // Create a temporary database.
    const database = openContentDatabase(':memory:')

    try {
      // Create the learning modules table.
      createContentTables(database)

      // Create a sample learning module.
      const module = {
        id: 'module-test-1',
        courseId: 'course-test-1',
        title: 'Introduction to TypeScript',
        description: 'Basic TypeScript concepts',
        week: 1,
        topic: 'TypeScript',
        createdAt: new Date().toISOString(),
        published: false,
        visibility: 'hidden' as const,
      }

      // Save the module using our database function.
      saveModuleToDatabase(database, module)

      // Read the saved module from SQLite.
      const saved = database
        .query(
          'SELECT title, course_id FROM learning_modules WHERE id = ?',
        )
        .get(module.id) as {
          title: string
          course_id: string
        } | null

      // Check that the correct module was saved.
      expect(saved?.title).toBe('Introduction to TypeScript')
      expect(saved?.course_id).toBe('course-test-1')
    } finally {
      // Close the database after testing.
      database.close()
    }
  })

  test('retrieves modules only from the requested course', () => {
  // Create a temporary database.
  const database = openContentDatabase(':memory:')

  try {
    createContentTables(database)

    // Create two modules belonging to different courses.
    const firstModule = {
      id: 'module-course-a',
      courseId: 'course-a',
      title: 'TypeScript Basics',
      createdAt: '2026-11-19T10:00:00.000Z',
      published: false,
      visibility: 'hidden' as const,
    }

    const secondModule = {
      id: 'module-course-b',
      courseId: 'course-b',
      title: 'Database Basics',
      createdAt: '2026-11-19T11:00:00.000Z',
      published: false,
      visibility: 'hidden' as const,
    }

    // Save both modules.
    saveModuleToDatabase(database, firstModule)
    saveModuleToDatabase(database, secondModule)

    // Retrieve modules belonging to course A.
    const courseAModules = getModulesFromDatabase(
      database,
      'course-a',
    )

    // Course A should contain only its own module.
    expect(courseAModules).toHaveLength(1)
    expect(courseAModules[0]?.title).toBe('TypeScript Basics')
    expect(courseAModules[0]?.courseId).toBe('course-a')

    // A course without modules should return an empty list.
    expect(getModulesFromDatabase(database, 'unknown-course')).toEqual([])
  } finally {
    // Close the database after testing.
    database.close()
  }
 })

    test('updates publication only for the correct course', () => {
    // Create a temporary database.
    const database = openContentDatabase(':memory:')

    try {
        createContentTables(database)

        // Save a module that starts unpublished.
        saveModuleToDatabase(database, {
        id: 'publication-test-1',
        courseId: 'course-a',
        title: 'SQLite Publication Test',
        createdAt: '2026-11-19T10:00:00.000Z',
        published: false,
        visibility: 'hidden',
        })

        // A different course cannot update this module.
        const wrongCourse = updateModulePublicationInDatabase(
        database,
        'course-b',
        'publication-test-1',
        true,
        )

        expect(wrongCourse).toBe(false)

        // The correct course can publish the module.
        const updated = updateModulePublicationInDatabase(
        database,
        'course-a',
        'publication-test-1',
        true,
        )

        expect(updated).toBe(true)

        // Read the saved state from SQLite.
        const modules = getModulesFromDatabase(database, 'course-a')

        expect(modules).toHaveLength(1)
        expect(modules[0]?.published).toBe(true)
    } finally {
        // Close the database after testing.
        database.close()
    }
  })

    test('updates visibility only for the correct course', () => {
    // Create a temporary database.
    const database = openContentDatabase(':memory:')

    try {
        createContentTables(database)

        // Save a module that starts hidden.
        saveModuleToDatabase(database, {
        id: 'visibility-test-1',
        courseId: 'course-a',
        title: 'SQLite Visibility Test',
        createdAt: '2026-11-19T10:00:00.000Z',
        published: false,
        visibility: 'hidden',
        })

        // A different course cannot change this module.
        const wrongCourse = updateModuleVisibilityInDatabase(
        database,
        'course-b',
        'visibility-test-1',
        'visible',
        )

        expect(wrongCourse).toBe(false)

        // The correct course can make the module visible.
        const updated = updateModuleVisibilityInDatabase(
        database,
        'course-a',
        'visibility-test-1',
        'visible',
        )

        expect(updated).toBe(true)

        // Read the saved visibility from SQLite.
        const modules = getModulesFromDatabase(database, 'course-a')

        expect(modules).toHaveLength(1)
        expect(modules[0]?.visibility).toBe('visible')
    } finally {
        // Close the database after testing.
        database.close()
    }
  })
})