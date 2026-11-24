
import { describe, expect, test } from 'bun:test'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import {
  openContentDatabase,
  createContentTables,
  saveModuleToDatabase,
} from './content.database'

import { createUnitRoutes } from './unit.routes'
import type { LearningUnit } from './unit.model'

const endpoint =
  'http://localhost/api/courses/demo-course/modules/demo-module/units'

function createTestDatabase(path = ':memory:') {
  const database = openContentDatabase(path)

  createContentTables(database)

  saveModuleToDatabase(database, {
    id: 'demo-module',
    courseId: 'demo-course',
    title: 'TypeScript Basics',
    week: 3,
    topic: 'TypeScript',
    createdAt: new Date().toISOString(),
    published: false,
    visibility: 'hidden',
  })

  return database
}

function createUnitRequest(): Request {
  return new Request(endpoint, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
    },
    body: JSON.stringify({
      title: 'Introduction to Interfaces',
      description: 'Learning TypeScript interfaces',
    }),
  })
}

describe('Learning unit demo database integration', () => {
  test('creates and retrieves units after reopening a separate database', async () => {
    const directory = await mkdtemp(
      join(tmpdir(), 'c3l-demo-units-'),
    )

    const databasePath = join(directory, 'demo.sqlite')

    try {
      const database = createTestDatabase(databasePath)

      let createdUnit: LearningUnit

      try {
        const router = createUnitRoutes({
          authorizeInstructor: () => true,
          database,
        })

        const response = await router.handle(
          createUnitRequest(),
        )

        expect(response.status).toBe(201)

        const body = (await response.json()) as {
          unit: LearningUnit
        }

        createdUnit = body.unit

        expect(createdUnit.courseId).toBe('demo-course')
        expect(createdUnit.moduleId).toBe('demo-module')
        expect(createdUnit.title).toBe(
          'Introduction to Interfaces',
        )
        expect(createdUnit.week).toBe(3)
        expect(createdUnit.topic).toBe('TypeScript')
      } finally {
        database.close()
      }

      // Reopen the same persistent database.
      const reopenedDatabase =
        openContentDatabase(databasePath)

      try {
        const router = createUnitRoutes({
          authorizeInstructor: () => true,
          database: reopenedDatabase,
        })

        const response = await router.handle(
          new Request(endpoint),
        )

        expect(response.status).toBe(200)

        expect(await response.json()).toEqual({
          units: [createdUnit],
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

  test('keeps learning units isolated between database instances', async () => {
    const firstDatabase = createTestDatabase()
    const secondDatabase = createTestDatabase()

    try {
      const firstRouter = createUnitRoutes({
        authorizeInstructor: () => true,
        database: firstDatabase,
      })

      const secondRouter = createUnitRoutes({
        authorizeInstructor: () => true,
        database: secondDatabase,
      })

      const createResponse = await firstRouter.handle(
        createUnitRequest(),
      )

      expect(createResponse.status).toBe(201)

      const listResponse = await secondRouter.handle(
        new Request(endpoint),
      )

      expect(listResponse.status).toBe(200)

      expect(await listResponse.json()).toEqual({
        units: [],
      })
    } finally {
      firstDatabase.close()
      secondDatabase.close()
    }
  })

  test('denies unauthorized access to the injected database', async () => {
    const database = createTestDatabase()

    try {
      const unauthorizedRouter = createUnitRoutes({
        database,
      })

      const createResponse =
        await unauthorizedRouter.handle(
          createUnitRequest(),
        )

      expect(createResponse.status).toBe(403)

      const listResponse =
        await unauthorizedRouter.handle(
          new Request(endpoint),
        )

      expect(listResponse.status).toBe(403)

      // Verify that the unauthorized request saved nothing.
      const authorizedRouter = createUnitRoutes({
        authorizeInstructor: () => true,
        database,
      })

      const verificationResponse =
        await authorizedRouter.handle(
          new Request(endpoint),
        )

      expect(verificationResponse.status).toBe(200)

      expect(await verificationResponse.json()).toEqual({
        units: [],
      })
    } finally {
      database.close()
    }
  })

  test('rejects cross-course access using an injected database', async () => {
    const database = createTestDatabase()

    try {
      const router = createUnitRoutes({
        authorizeInstructor: () => true,
        database,
      })

      const wrongEndpoint =
        'http://localhost/api/courses/wrong-course/modules/demo-module/units'

      const createResponse = await router.handle(
        new Request(wrongEndpoint, {
          method: 'POST',
          headers: {
            'content-type': 'application/json',
          },
          body: JSON.stringify({
            title: 'Incorrect Course Unit',
          }),
        }),
      )

      expect(createResponse.status).toBe(404)

      const listResponse = await router.handle(
        new Request(wrongEndpoint),
      )

      expect(listResponse.status).toBe(404)

      const verificationResponse = await router.handle(
        new Request(endpoint),
      )

      expect(await verificationResponse.json()).toEqual({
        units: [],
      })
    } finally {
      database.close()
    }
  })
})
