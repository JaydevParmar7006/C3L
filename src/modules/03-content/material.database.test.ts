
import { afterEach, beforeEach, describe, expect, test } from 'bun:test'
import type { Database } from 'bun:sqlite'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import {
  createContentTables,
  getMaterialsFromDatabase,
  openContentDatabase,
  saveMaterialToDatabase,
  saveModuleToDatabase,
} from './content.database'

import type { LearningMaterial } from './material.model'
import type { LearningModule } from './module.model'

function createTestModule(
  courseId = 'course-1',
  id = 'module-1',
): LearningModule {
  return {
    id,
    courseId,
    title: 'Test Learning Module',
    createdAt: new Date().toISOString(),
    published: false,
    visibility: 'hidden',
  }
}

function createTestMaterial(
  overrides: Partial<LearningMaterial> = {},
): LearningMaterial {
  return {
    id: crypto.randomUUID(),
    courseId: 'course-1',
    moduleId: 'module-1',
    filename: 'lecture.pdf',
    storedFilename: crypto.randomUUID(),
    size: 1024,
    mimeType: 'application/pdf',
    uploadedAt: new Date().toISOString(),
    ...overrides,
  }
}

describe('Learning material SQLite persistence', () => {
  let database: Database

  beforeEach(() => {
    database = openContentDatabase(':memory:')
    createContentTables(database)

    saveModuleToDatabase(database, createTestModule())
  })

  afterEach(() => {
    database.close()
  })

  test('saves and retrieves material metadata', () => {
    const material = createTestMaterial()

    saveMaterialToDatabase(database, material)

    expect(
      getMaterialsFromDatabase(database, 'course-1', 'module-1'),
    ).toEqual([material])
  })

  test('returns an empty list when no materials exist', () => {
    expect(
      getMaterialsFromDatabase(database, 'course-1', 'module-1'),
    ).toEqual([])
  })

  test('stores multiple materials for the same module', () => {
    const first = createTestMaterial()
    const second = createTestMaterial({
      filename: 'notes.pdf',
    })

    saveMaterialToDatabase(database, first)
    saveMaterialToDatabase(database, second)

    const materials = getMaterialsFromDatabase(
      database,
      'course-1',
      'module-1',
    )

    expect(materials).toHaveLength(2)
    expect(materials).toContainEqual(first)
    expect(materials).toContainEqual(second)
  })

  test('maintains course isolation', () => {
    saveModuleToDatabase(
      database,
      createTestModule('course-2', 'module-2'),
    )

    const first = createTestMaterial()
    const second = createTestMaterial({
      courseId: 'course-2',
      moduleId: 'module-2',
    })

    saveMaterialToDatabase(database, first)
    saveMaterialToDatabase(database, second)

    expect(
      getMaterialsFromDatabase(database, 'course-1', 'module-1'),
    ).toEqual([first])

    expect(
      getMaterialsFromDatabase(database, 'course-2', 'module-2'),
    ).toEqual([second])

    expect(
      getMaterialsFromDatabase(database, 'course-2', 'module-1'),
    ).toEqual([])
  })

  test('maintains module isolation within the same course', () => {
    saveModuleToDatabase(
      database,
      createTestModule('course-1', 'module-2'),
    )

    const first = createTestMaterial()
    const second = createTestMaterial({
      moduleId: 'module-2',
    })

    saveMaterialToDatabase(database, first)
    saveMaterialToDatabase(database, second)

    expect(
      getMaterialsFromDatabase(database, 'course-1', 'module-1'),
    ).toEqual([first])

    expect(
      getMaterialsFromDatabase(database, 'course-1', 'module-2'),
    ).toEqual([second])
  })

  test('rejects materials with a nonexistent parent module', () => {
    const material = createTestMaterial({
      moduleId: 'missing-module',
    })

    expect(() => {
      saveMaterialToDatabase(database, material)
    }).toThrow()
  })

  test('rejects materials associated with the wrong course', () => {
    const material = createTestMaterial({
      courseId: 'wrong-course',
    })

    expect(() => {
      saveMaterialToDatabase(database, material)
    }).toThrow()

    expect(
      getMaterialsFromDatabase(database, 'course-1', 'module-1'),
    ).toEqual([])
  })

  test('rejects duplicate stored filenames', () => {
    const first = createTestMaterial()
    const second = createTestMaterial({
      storedFilename: first.storedFilename,
    })

    saveMaterialToDatabase(database, first)

    expect(() => {
      saveMaterialToDatabase(database, second)
    }).toThrow()

    expect(
      getMaterialsFromDatabase(database, 'course-1', 'module-1'),
    ).toEqual([first])
  })

  test('rejects negative file sizes', () => {
    const material = createTestMaterial({
      size: -1,
    })

    expect(() => {
      saveMaterialToDatabase(database, material)
    }).toThrow()
  })

  test('preserves material metadata after reopening the database', () => {
    const directory = mkdtempSync(
      join(tmpdir(), 'c3l-material-test-'),
    )

    const databasePath = join(directory, 'content.sqlite')
    const material = createTestMaterial()

    try {
      const firstDatabase = openContentDatabase(databasePath)

      try {
        createContentTables(firstDatabase)

        saveModuleToDatabase(
          firstDatabase,
          createTestModule(),
        )

        saveMaterialToDatabase(firstDatabase, material)
      } finally {
        firstDatabase.close()
      }

      const reopenedDatabase = openContentDatabase(databasePath)

      try {
        createContentTables(reopenedDatabase)

        expect(
          getMaterialsFromDatabase(
            reopenedDatabase,
            'course-1',
            'module-1',
          ),
        ).toEqual([material])
      } finally {
        reopenedDatabase.close()
      }
    } finally {
      rmSync(directory, {
        recursive: true,
        force: true,
      })
    }
  })
})
