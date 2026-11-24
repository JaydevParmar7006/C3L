
import { describe, expect, test } from 'bun:test'

import type { AuthenticatedUser } from './content.auth'

import {
  openContentDatabase,
  createContentTables,
  saveModuleToDatabase,
  saveMaterialToDatabase,
} from './content.database'

import { createLearningUnit } from './unit.service'
import { createStudentResourceRoutes } from './content.student.resources.routes'

const student: AuthenticatedUser = {
  id: 'student-1',
  role: 'student',
  active: true,
}

interface TestOptions {
  user?: AuthenticatedUser | null
  enrolled?: boolean
  archived?: boolean
  courseExists?: boolean
  identityError?: boolean
  permissionError?: boolean
  courseError?: boolean
  revokePermission?: boolean
  published?: boolean
  visible?: boolean
  empty?: boolean
}

function createTestApp(options: TestOptions = {}) {
  const database = openContentDatabase(':memory:')

  createContentTables(database)

  saveModuleToDatabase(database, {
    id: 'module-1',
    courseId: 'course-1',
    title: 'TypeScript Basics',
    week: 3,
    topic: 'TypeScript',
    createdAt: new Date().toISOString(),
    published: options.published ?? true,
    visibility:
      options.visible === false ? 'hidden' : 'visible',
  })

  const unit = options.empty
    ? undefined
    : createLearningUnit(
        {
          courseId: 'course-1',
          moduleId: 'module-1',
          title: 'Introduction to Interfaces',
          description: 'Learning TypeScript interfaces',
        },
        database,
      )

  const material = {
    id: 'material-1',
    courseId: 'course-1',
    moduleId: 'module-1',
    filename: 'lecture.pdf',
    storedFilename: 'internal-storage-id',
    size: 1024,
    mimeType: 'application/pdf',
    uploadedAt: new Date().toISOString(),
  }

  if (!options.empty) {
    saveMaterialToDatabase(database, material)
  }

  let permissionChecks = 0

  const app = createStudentResourceRoutes({
    database,

    identity: {
      async currentUser() {
        if (options.identityError) {
          throw new Error('Identity service unavailable')
        }

        return options.user === undefined
          ? student
          : options.user
      },
    },

    courses: {
      async getCourse(courseId) {
        if (options.courseError) {
          throw new Error('Course service unavailable')
        }

        if (options.courseExists === false) {
          return null
        }

        return {
          id: courseId,
          title: 'Test Course',
          archived: options.archived ?? false,
        }
      },
    },

    permissions: {
      async canManage() {
        return false
      },

      async canStudy() {
        permissionChecks++

        if (options.permissionError) {
          throw new Error('Permission service unavailable')
        }

        if (
          options.revokePermission &&
          permissionChecks > 1
        ) {
          return false
        }

        return options.enrolled ?? true
      },
    },
  })

  return {
    app,
    database,
    unit,
    material,
  }
}

function resourceRequest(
  resource: 'units' | 'materials',
  courseId = 'course-1',
  moduleId = 'module-1',
 headers?: Record<string, string>,
) {
  return new Request(
    `http://localhost/api/courses/${courseId}/student/modules/${moduleId}/${resource}`,
    { headers },
  )
}

describe('Protected student resource retrieval', () => {
  test('returns learning units to an authorized student', async () => {
    const { app, database, unit } = createTestApp()

    try {
      const response = await app.handle(
        resourceRequest('units'),
      )

      expect(response.status).toBe(200)
      expect(await response.json()).toEqual({
        units: [unit],
      })
    } finally {
      database.close()
    }
  })

  test('returns material metadata without internal storage identifiers', async () => {
    const { app, database, material } = createTestApp()

    try {
      const response = await app.handle(
        resourceRequest('materials'),
      )

      expect(response.status).toBe(200)

      expect(await response.json()).toEqual({
        materials: [
          {
            id: material.id,
            courseId: material.courseId,
            moduleId: material.moduleId,
            filename: material.filename,
            size: material.size,
            mimeType: material.mimeType,
            uploadedAt: material.uploadedAt,
          },
        ],
      })
    } finally {
      database.close()
    }
  })

  for (const resource of ['units', 'materials'] as const) {
    describe(`${resource} endpoint`, () => {
      test('returns an empty list when no resources exist', async () => {
        const { app, database } = createTestApp({
          empty: true,
        })

        try {
          const response = await app.handle(
            resourceRequest(resource),
          )

          expect(response.status).toBe(200)
          expect(await response.json()).toEqual({
            [resource]: [],
          })
        } finally {
          database.close()
        }
      })

      const deniedCases: {
        name: string
        options: TestOptions
        status: number
      }[] = [
        {
          name: 'rejects unauthenticated requests',
          options: { user: null },
          status: 401,
        },
        {
          name: 'rejects inactive students',
          options: {
            user: { ...student, active: false },
          },
          status: 403,
        },
        {
          name: 'rejects instructors',
          options: {
            user: { ...student, role: 'instructor' },
          },
          status: 403,
        },
        {
          name: 'rejects students without enrollment',
          options: { enrolled: false },
          status: 403,
        },
        {
          name: 'rejects archived courses',
          options: { archived: true },
          status: 403,
        },
        {
          name: 'rejects unknown courses',
          options: { courseExists: false },
          status: 404,
        },
        {
          name: 'rejects revoked course permissions',
          options: { revokePermission: true },
          status: 403,
        },
        {
          name: 'rejects unpublished modules',
          options: { published: false },
          status: 404,
        },
        {
          name: 'rejects hidden modules',
          options: { visible: false },
          status: 404,
        },
        {
          name: 'rejects unpublished and hidden modules',
          options: {
            published: false,
            visible: false,
          },
          status: 404,
        },
        {
          name: 'fails closed when identity lookup throws',
          options: { identityError: true },
          status: 503,
        },
        {
          name: 'fails closed when course lookup throws',
          options: { courseError: true },
          status: 503,
        },
        {
          name: 'fails closed when permission lookup throws',
          options: { permissionError: true },
          status: 503,
        },
      ]

      for (const scenario of deniedCases) {
        test(scenario.name, async () => {
          const { app, database } = createTestApp(
            scenario.options,
          )

          try {
            const response = await app.handle(
              resourceRequest(resource),
            )

            expect(response.status).toBe(
              scenario.status,
            )

            const body = await response.json()

            expect(body).not.toHaveProperty(resource)
          } finally {
            database.close()
          }
        })
      }

      test('rejects forged student identity headers', async () => {
        const { app, database } = createTestApp({
          user: null,
        })

        try {
          const response = await app.handle(
            resourceRequest(
              resource,
              'course-1',
              'module-1',
              {
                'x-user-id': 'student-1',
                'x-role': 'student',
                'x-user-role': 'student',
              },
            ),
          )

          expect(response.status).toBe(401)
        } finally {
          database.close()
        }
      })

      test('rejects cross-course module access', async () => {
        const { app, database } = createTestApp()

        try {
          const response = await app.handle(
            resourceRequest(
              resource,
              'other-course',
              'module-1',
            ),
          )

          expect(response.status).toBe(404)
        } finally {
          database.close()
        }
      })

      test('rejects nonexistent parent modules', async () => {
        const { app, database } = createTestApp()

        try {
          const response = await app.handle(
            resourceRequest(
              resource,
              'course-1',
              'missing-module',
            ),
          )

          expect(response.status).toBe(404)
        } finally {
          database.close()
        }
      })

      test('isolates resources between separate databases', async () => {
        const first = createTestApp()
        const second = createTestApp({ empty: true })

        try {
          const firstResponse = await first.app.handle(
            resourceRequest(resource),
          )

          expect(firstResponse.status).toBe(200)

          const firstBody =
            (await firstResponse.json()) as Record<
              string,
              unknown[]
            >

          expect(firstBody[resource]).toHaveLength(1)

          const secondResponse = await second.app.handle(
            resourceRequest(resource),
          )

          expect(secondResponse.status).toBe(200)

          expect(await secondResponse.json()).toEqual({
            [resource]: [],
          })
        } finally {
          first.database.close()
          second.database.close()
        }
      })
    })
  }
})
