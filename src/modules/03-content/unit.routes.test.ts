
import { beforeEach, describe, expect, test } from 'bun:test'
import { createLearningModule } from './module.service'
import { createUnitRoutes } from './unit.routes'
import type { LearningModule } from './module.model'
import type { LearningUnit } from './unit.model'

describe('M03-FR-004 instructor learning unit APIs', () => {
  let courseId: string
  let parentModule: LearningModule
  let url: string

  beforeEach(() => {
    courseId = crypto.randomUUID()

    parentModule = createLearningModule({
      courseId,
      title: 'Programming Fundamentals',
      week: 3,
      topic: 'TypeScript',
    })

    url = `http://localhost/api/courses/${courseId}/modules/${parentModule.id}/units`
  })

  function authorizedApp() {
    return createUnitRoutes({
      authorizeInstructor: (_request, requestedCourseId) =>
        requestedCourseId === courseId,
    })
  }

  function postRequest(
    body: unknown,
    requestUrl = url,
  ): Request {
    return new Request(requestUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(body),
    })
  }

  test('creates a learning unit with trusted authorization', async () => {
    const app = authorizedApp()

    const response = await app.handle(
      postRequest({
        title: 'TypeScript Basics',
        description: 'Introduction to TypeScript',
      }),
    )

    expect(response.status).toBe(201)

    const body = (await response.json()) as {
      unit: LearningUnit
    }

    expect(body.unit.id).toBeTruthy()
    expect(body.unit.courseId).toBe(courseId)
    expect(body.unit.moduleId).toBe(parentModule.id)
    expect(body.unit.title).toBe('TypeScript Basics')
    expect(body.unit.week).toBe(3)
    expect(body.unit.topic).toBe('TypeScript')
  })

  test('retrieves previously created learning units', async () => {
    const app = authorizedApp()

    const created = await app.handle(
      postRequest({ title: 'Variables' }),
    )

    expect(created.status).toBe(201)

    const response = await app.handle(new Request(url))

    expect(response.status).toBe(200)

    const body = (await response.json()) as {
      units: LearningUnit[]
    }

    expect(body.units).toHaveLength(1)
    expect(body.units[0]?.title).toBe('Variables')
  })

  test('returns an empty list for a module without units', async () => {
    const response = await authorizedApp().handle(
      new Request(url),
    )

    expect(response.status).toBe(200)
    expect(await response.json()).toEqual({ units: [] })
  })

  test('rejects a missing title', async () => {
    const response = await authorizedApp().handle(
      postRequest({ description: 'Missing title' }),
    )

    expect(response.status).toBe(400)
  })

  test('rejects a whitespace-only title', async () => {
    const response = await authorizedApp().handle(
      postRequest({ title: '   ' }),
    )

    expect(response.status).toBe(400)
  })

  test('rejects a numeric title', async () => {
    const response = await authorizedApp().handle(
      postRequest({ title: 123 }),
    )

    expect(response.status).toBe(400)
  })

  test('rejects a non-string description', async () => {
    const response = await authorizedApp().handle(
      postRequest({
        title: 'Valid title',
        description: 123,
      }),
    )

    expect(response.status).toBe(400)
  })

  test('rejects malformed JSON', async () => {
    const response = await authorizedApp().handle(
      new Request(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: '{invalid-json',
      }),
    )

    expect(response.status).toBe(400)
  })

  test('denies creation without trusted authorization', async () => {
    const response = await createUnitRoutes().handle(
      postRequest({ title: 'Unauthorized unit' }),
    )

    expect(response.status).toBe(403)
  })

  test('denies retrieval without trusted authorization', async () => {
    const response = await createUnitRoutes().handle(
      new Request(url),
    )

    expect(response.status).toBe(403)
  })

  test('rejects fake instructor role headers', async () => {
    const response = await createUnitRoutes().handle(
      new Request(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-role': 'instructor',
          'x-user-role': 'instructor',
        },
        body: JSON.stringify({
          title: 'Unauthorized unit',
        }),
      }),
    )

    expect(response.status).toBe(403)
  })

  test('authorizes before parsing malformed JSON', async () => {
    const response = await createUnitRoutes().handle(
      new Request(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: '{invalid-json',
      }),
    )

    expect(response.status).toBe(403)
  })

  test('denies access when authorization returns false', async () => {
    const app = createUnitRoutes({
      authorizeInstructor: () => false,
    })

    const response = await app.handle(new Request(url))

    expect(response.status).toBe(403)
  })

  test('denies access when authorization throws an error', async () => {
    const app = createUnitRoutes({
      authorizeInstructor: () => {
        throw new Error('Authorization unavailable')
      },
    })

    const response = await app.handle(
      postRequest({ title: 'Unauthorized unit' }),
    )

    expect(response.status).toBe(403)
  })

  test('rejects creation under a nonexistent module', async () => {
    const missingUrl =
      `http://localhost/api/courses/${courseId}/modules/missing-module/units`

    const response = await authorizedApp().handle(
      postRequest({ title: 'Variables' }, missingUrl),
    )

    expect(response.status).toBe(404)
  })

  test('rejects creation under a module in another course', async () => {
    const otherModule = createLearningModule({
      courseId: crypto.randomUUID(),
      title: 'Other course module',
    })

    const wrongUrl =
      `http://localhost/api/courses/${courseId}/modules/${otherModule.id}/units`

    const response = await authorizedApp().handle(
      postRequest({ title: 'Variables' }, wrongUrl),
    )

    expect(response.status).toBe(404)
  })

  test('rejects retrieval of a module in another course', async () => {
    const otherModule = createLearningModule({
      courseId: crypto.randomUUID(),
      title: 'Other course module',
    })

    const wrongUrl =
      `http://localhost/api/courses/${courseId}/modules/${otherModule.id}/units`

    const response = await authorizedApp().handle(
      new Request(wrongUrl),
    )

    expect(response.status).toBe(404)
  })

  test('uses URL ownership instead of request body ownership', async () => {
    const response = await authorizedApp().handle(
      postRequest({
        title: 'Variables',
        courseId: 'fake-course',
        moduleId: 'fake-module',
      }),
    )

    expect(response.status).toBe(201)

    const body = (await response.json()) as {
      unit: LearningUnit
    }

    expect(body.unit.courseId).toBe(courseId)
    expect(body.unit.moduleId).toBe(parentModule.id)
  })

  test('denied creation does not persist a learning unit', async () => {
    const denied = await createUnitRoutes().handle(
      postRequest({ title: 'Unauthorized unit' }),
    )

    expect(denied.status).toBe(403)

    const response = await authorizedApp().handle(
      new Request(url),
    )

    expect(response.status).toBe(200)
    expect(await response.json()).toEqual({ units: [] })
  })
})
