
import { describe, expect, test } from 'bun:test'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import {
  openContentDatabase,
  createContentTables,
  saveModuleToDatabase,
} from './content.database'

import { createMaterialListRoutes } from './material.list.routes'
import { createMaterialUploadRoutes } from './material.upload.routes'
import { saveLearningMaterialMetadata } from './material.service'
import type { LearningMaterial } from './material.model'

function createTestDatabase() {
  const database = openContentDatabase(':memory:')
  createContentTables(database)

  saveModuleToDatabase(database, {
    id: 'module-1',
    courseId: 'course-1',
    title: 'TypeScript Basics',
    createdAt: new Date().toISOString(),
    published: false,
    visibility: 'hidden',
  })

  return database
}

function createTestMaterial(): LearningMaterial {
  return {
    id: crypto.randomUUID(),
    courseId: 'course-1',
    moduleId: 'module-1',
    filename: 'lecture.pdf',
    storedFilename: crypto.randomUUID(),
    size: 100,
    mimeType: 'application/pdf',
    uploadedAt: new Date().toISOString(),
  }
}

function createListRequest(
  courseId = 'course-1',
  moduleId = 'module-1',
): Request {
  return new Request(
    `http://localhost/api/courses/${courseId}/modules/${moduleId}/materials`,
  )
}

describe('Instructor material listing API', () => {
  test('returns persisted material metadata', async () => {
    const database = createTestDatabase()

    try {
      const material = createTestMaterial()

      saveLearningMaterialMetadata(material, database)

      const router = createMaterialListRoutes({
        authorizeInstructor: () => true,
        database,
      })

      const response = await router.handle(
        createListRequest(),
      )

      expect(response.status).toBe(200)

      expect(await response.json()).toEqual({
        materials: [material],
      })
    } finally {
      database.close()
    }
  })

  test('returns an empty list when no materials exist', async () => {
    const database = createTestDatabase()

    try {
      const router = createMaterialListRoutes({
        authorizeInstructor: () => true,
        database,
      })

      const response = await router.handle(
        createListRequest(),
      )

      expect(response.status).toBe(200)

      expect(await response.json()).toEqual({
        materials: [],
      })
    } finally {
      database.close()
    }
  })

  test.each(['missing', 'false', 'throws'] as const)(
    'fails closed when authorization is %s',
    async (mode) => {
      const database = createTestDatabase()

      try {
        saveLearningMaterialMetadata(
          createTestMaterial(),
          database,
        )

        const router = createMaterialListRoutes({
          database,
          authorizeInstructor:
            mode === 'missing'
              ? undefined
              : () => {
                  if (mode === 'throws') {
                    throw new Error('Authorization unavailable')
                  }

                  return false
                },
        })

        const response = await router.handle(
          createListRequest(),
        )

        expect(response.status).toBe(403)

        expect(await response.json()).toEqual({
          error: 'Instructor authorization required.',
        })
      } finally {
        database.close()
      }
    },
  )

  test('rejects a forged instructor header', async () => {
    const database = createTestDatabase()

    try {
      const router = createMaterialListRoutes({
        database,
      })

      const response = await router.handle(
        new Request(
          'http://localhost/api/courses/course-1/modules/module-1/materials',
          {
            headers: {
              'x-user-role': 'instructor',
            },
          },
        ),
      )

      expect(response.status).toBe(403)
    } finally {
      database.close()
    }
  })

  test('rejects a nonexistent module', async () => {
    const database = createTestDatabase()

    try {
      const router = createMaterialListRoutes({
        authorizeInstructor: () => true,
        database,
      })

      const response = await router.handle(
        createListRequest('course-1', 'missing-module'),
      )

      expect(response.status).toBe(404)

      expect(await response.json()).toEqual({
        error: 'Learning module not found',
      })
    } finally {
      database.close()
    }
  })

  test('rejects cross-course material retrieval', async () => {
    const database = createTestDatabase()

    try {
      saveLearningMaterialMetadata(
        createTestMaterial(),
        database,
      )

      const router = createMaterialListRoutes({
        authorizeInstructor: () => true,
        database,
      })

      const response = await router.handle(
        createListRequest('course-2', 'module-1'),
      )

      expect(response.status).toBe(404)

      expect(await response.json()).toEqual({
        error: 'Learning module not found',
      })
    } finally {
      database.close()
    }
  })

  test('isolates materials between modules in the same course', async () => {
    const database = createTestDatabase()

    try {
      saveModuleToDatabase(database, {
        id: 'module-2',
        courseId: 'course-1',
        title: 'Database Basics',
        createdAt: new Date().toISOString(),
        published: false,
        visibility: 'hidden',
      })

      saveLearningMaterialMetadata(
        createTestMaterial(),
        database,
      )

      const router = createMaterialListRoutes({
        authorizeInstructor: () => true,
        database,
      })

      const response = await router.handle(
        createListRequest('course-1', 'module-2'),
      )

      expect(response.status).toBe(200)

      expect(await response.json()).toEqual({
        materials: [],
      })
    } finally {
      database.close()
    }
  })

  test('uploads and lists materials using a separate persistent database', async () => {
    const directory = await mkdtemp(
      join(tmpdir(), 'c3l-demo-materials-'),
    )

    const databasePath = join(directory, 'demo.sqlite')

    try {
      const database = openContentDatabase(databasePath)

      let uploadedMaterial: LearningMaterial

      try {
        createContentTables(database)

        saveModuleToDatabase(database, {
          id: 'demo-module',
          courseId: 'demo-course',
          title: 'Demo Learning Module',
          createdAt: new Date().toISOString(),
          published: false,
          visibility: 'hidden',
        })

        const uploadRouter = createMaterialUploadRoutes({
          authorizeInstructor: () => true,
          database,
          uploadDirectory: join(directory, 'uploads'),
        })

        const form = new FormData()

        form.append(
          'file',
          new File(
            ['%PDF-1.4\nDemo learning material'],
            'demo.pdf',
            { type: 'application/pdf' },
          ),
        )

        const response = await uploadRouter.handle(
          new Request(
            'http://localhost/api/courses/demo-course/modules/demo-module/materials',
            {
              method: 'POST',
              body: form,
            },
          ),
        )

        expect(response.status).toBe(201)

        const body = (await response.json()) as {
          material: LearningMaterial
        }

        uploadedMaterial = body.material

        expect(
          await Bun.file(
            join(
              directory,
              'uploads',
              uploadedMaterial.storedFilename,
            ),
          ).exists(),
        ).toBe(true)
      } finally {
        database.close()
      }

      // Reopen the same database to verify persistence.
      const reopenedDatabase = openContentDatabase(databasePath)

      try {
        const listRouter = createMaterialListRoutes({
          authorizeInstructor: () => true,
          database: reopenedDatabase,
        })

        const response = await listRouter.handle(
          createListRequest('demo-course', 'demo-module'),
        )

        expect(response.status).toBe(200)

        expect(await response.json()).toEqual({
          materials: [uploadedMaterial],
        })
      } finally {
        reopenedDatabase.close()
      }
    } finally {
      await rm(directory, {
        recursive: true,
        force: true,
      })
    }
  })
})
