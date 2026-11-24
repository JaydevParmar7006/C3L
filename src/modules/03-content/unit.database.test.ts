
import { afterEach, beforeEach, describe, expect, test } from 'bun:test'
import type { Database } from 'bun:sqlite'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import {
  createContentTables,
  getUnitsFromDatabase,
  openContentDatabase,
  saveModuleToDatabase,
  saveUnitToDatabase,
} from './content.database'
import type { LearningModule } from './module.model'
import type { LearningUnit } from './unit.model'

describe('Learning unit SQLite persistence', () => {
  let database: Database

  const parentModule: LearningModule = {
    id: 'module-1',
    courseId: 'course-1',
    title: 'Introduction to Programming',
    week: 2,
    topic: 'TypeScript',
    createdAt: '2026-11-23T12:00:00.000Z',
    published: false,
    visibility: 'hidden',
  }

  const unit: LearningUnit = {
    id: 'unit-1',
    courseId: 'course-1',
    moduleId: 'module-1',
    title: 'TypeScript Basics',
    description: 'Introduction to TypeScript',
    createdAt: '2026-11-23T12:30:00.000Z',
  }

  beforeEach(() => {
    database = openContentDatabase(':memory:')
    createContentTables(database)
    saveModuleToDatabase(database, parentModule)
  })

  afterEach(() => {
    database.close()
  })

  test('saves and retrieves a learning unit', () => {
    saveUnitToDatabase(database, unit)

    const units = getUnitsFromDatabase(
      database,
      'course-1',
      'module-1',
    )

    expect(units).toHaveLength(1)
    expect(units[0]).toEqual({
      ...unit,
      week: 2,
      topic: 'TypeScript',
    })
  })

  test('inherits week and topic from the parent module', () => {
    saveUnitToDatabase(database, unit)

    const units = getUnitsFromDatabase(
      database,
      'course-1',
      'module-1',
    )

    expect(units[0]?.week).toBe(2)
    expect(units[0]?.topic).toBe('TypeScript')
  })

  test('isolates units between courses', () => {
    saveUnitToDatabase(database, unit)

    expect(
      getUnitsFromDatabase(database, 'course-2', 'module-1'),
    ).toEqual([])
  })

  test('isolates units between modules in the same course', () => {
    saveModuleToDatabase(database, {
      ...parentModule,
      id: 'module-2',
    })

    saveUnitToDatabase(database, unit)

    expect(
      getUnitsFromDatabase(database, 'course-1', 'module-2'),
    ).toEqual([])
  })

  test('rejects a unit linked to a nonexistent module', () => {
    expect(() =>
      saveUnitToDatabase(database, {
        ...unit,
        moduleId: 'missing-module',
      }),
    ).toThrow()
  })

  test('rejects a unit linked to a module in another course', () => {
    expect(() =>
      saveUnitToDatabase(database, {
        ...unit,
        courseId: 'course-2',
      }),
    ).toThrow()
  })

  test('rejects an empty unit title', () => {
    expect(() =>
      saveUnitToDatabase(database, {
        ...unit,
        title: '   ',
      }),
    ).toThrow()
  })

  test('returns an empty list when a module has no units', () => {
    expect(
      getUnitsFromDatabase(database, 'course-1', 'module-1'),
    ).toEqual([])
  })

  test('supports multiple units in one module', () => {
    saveUnitToDatabase(database, unit)

    saveUnitToDatabase(database, {
      ...unit,
      id: 'unit-2',
      title: 'TypeScript Interfaces',
    })

    expect(
      getUnitsFromDatabase(database, 'course-1', 'module-1'),
    ).toHaveLength(2)
  })

  test('preserves learning units after reopening SQLite', () => {
    const directory = mkdtempSync(join(tmpdir(), 'c3l-units-'))
    const databasePath = join(directory, 'content.sqlite')

    try {
      const firstConnection = openContentDatabase(databasePath)

      try {
        createContentTables(firstConnection)
        saveModuleToDatabase(firstConnection, parentModule)
        saveUnitToDatabase(firstConnection, unit)
      } finally {
        firstConnection.close()
      }

      const secondConnection = openContentDatabase(databasePath)

      try {
        createContentTables(secondConnection)

        expect(
          getUnitsFromDatabase(
            secondConnection,
            'course-1',
            'module-1',
          ),
        ).toEqual([
          {
            ...unit,
            week: 2,
            topic: 'TypeScript',
          },
        ])
      } finally {
        secondConnection.close()
      }
    } finally {
      rmSync(directory, { recursive: true, force: true })
    }
  })
})
