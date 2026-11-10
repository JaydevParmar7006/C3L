
import { describe, expect, test } from 'bun:test'
import { createModuleAccessRoutes } from './module.access.routes'
import { createLearningModule } from './module.service'

describe('M03-FR-005 and M03-FR-006 authorization', () => {
  test('publishing is denied without an authorization dependency', async () => {
    const module = createLearningModule({
      courseId: 'harsh-auth-test-1',
      title: 'Publishing authorization test',
    })

    const app = createModuleAccessRoutes()

    const response = await app.handle(
      new Request(
        `http://localhost/api/courses/${module.courseId}/modules/${module.id}/publication`,
        {
          method: 'PATCH',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ published: true }),
        },
      ),
    )

    expect(response.status).toBe(403)
    expect(module.published).toBe(false)
  })

  test('visibility changes are denied without an authorization dependency', async () => {
    const module = createLearningModule({
      courseId: 'harsh-auth-test-2',
      title: 'Visibility authorization test',
    })

    const app = createModuleAccessRoutes()

    const response = await app.handle(
      new Request(
        `http://localhost/api/courses/${module.courseId}/modules/${module.id}/visibility`,
        {
          method: 'PATCH',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ visibility: 'visible' }),
        },
      ),
    )

    expect(response.status).toBe(403)
    expect(module.visibility).toBe('hidden')
  })

  test('client-supplied instructor role header does not bypass authorization', async () => {
    const module = createLearningModule({
      courseId: 'harsh-auth-test-3',
      title: 'Forged role header test',
    })

    const app = createModuleAccessRoutes()

    const response = await app.handle(
      new Request(
        `http://localhost/api/courses/${module.courseId}/modules/${module.id}/publication`,
        {
          method: 'PATCH',
          headers: {
            'content-type': 'application/json',
            'x-user-role': 'instructor',
          },
          body: JSON.stringify({ published: true }),
        },
      ),
    )

    expect(response.status).toBe(403)
    expect(module.published).toBe(false)
  })
})

describe('M03-FR-005 publication changes', () => {
  test('authorized instructor can publish and unpublish a module', async () => {
    const module = createLearningModule({
      courseId: 'harsh-publish-test',
      title: 'Publication transition test',
    })

    const app = createModuleAccessRoutes({
      authorizeInstructor: async () => true,
    })

    const url = `http://localhost/api/courses/${module.courseId}/modules/${module.id}/publication`

    const publishResponse = await app.handle(
      new Request(url, {
        method: 'PATCH',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ published: true }),
      }),
    )

expect(publishResponse.status).toBe(200)

const publishBody: unknown = await publishResponse.json()

expect(publishBody).toMatchObject({
  module: {
    published: true,
  },
})
    expect(module.published).toBe(true)
    expect(module.visibility).toBe('hidden')

    const unpublishResponse = await app.handle(
      new Request(url, {
        method: 'PATCH',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ published: false }),
      }),
    )

    expect(unpublishResponse.status).toBe(200)
    expect(module.published).toBe(false)
  })
})

describe('M03-FR-006 visibility changes', () => {
  test('authorized instructor can show and hide a module', async () => {
    const module = createLearningModule({
      courseId: 'harsh-visibility-test',
      title: 'Visibility transition test',
    })

    const app = createModuleAccessRoutes({
      authorizeInstructor: async () => true,
    })

    const url = `http://localhost/api/courses/${module.courseId}/modules/${module.id}/visibility`

    const showResponse = await app.handle(
      new Request(url, {
        method: 'PATCH',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ visibility: 'visible' }),
      }),
    )

    expect(showResponse.status).toBe(200)
   const showBody: unknown = await showResponse.json()

expect(showBody).toMatchObject({
  module: {
    visibility: 'visible',
  },
})
    expect(module.visibility).toBe('visible')
    expect(module.published).toBe(false)

    const hideResponse = await app.handle(
      new Request(url, {
        method: 'PATCH',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ visibility: 'hidden' }),
      }),
    )

    expect(hideResponse.status).toBe(200)
    expect(module.visibility).toBe('hidden')
  })
})

describe('M03-FR-005 and M03-FR-006 input validation', () => {
  test('rejects a non-boolean publication value', async () => {
    const module = createLearningModule({
      courseId: 'harsh-invalid-publish',
      title: 'Invalid publication input',
    })

    const app = createModuleAccessRoutes({
      authorizeInstructor: async () => true,
    })

    const response = await app.handle(
      new Request(
        `http://localhost/api/courses/${module.courseId}/modules/${module.id}/publication`,
        {
          method: 'PATCH',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ published: 'yes' }),
        },
      ),
    )

    expect(response.status).toBe(400)
    expect(module.published).toBe(false)
  })

  test('rejects an unsupported visibility value', async () => {
    const module = createLearningModule({
      courseId: 'harsh-invalid-visibility',
      title: 'Invalid visibility input',
    })

    const app = createModuleAccessRoutes({
      authorizeInstructor: async () => true,
    })

    const response = await app.handle(
      new Request(
        `http://localhost/api/courses/${module.courseId}/modules/${module.id}/visibility`,
        {
          method: 'PATCH',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ visibility: 'public' }),
        },
      ),
    )

    expect(response.status).toBe(400)
    expect(module.visibility).toBe('hidden')
  })

  test('rejects publishing a module through the wrong course', async () => {
    const module = createLearningModule({
      courseId: 'harsh-original-course',
      title: 'Wrong course publication test',
    })

    const app = createModuleAccessRoutes({
      authorizeInstructor: async () => true,
    })

    const response = await app.handle(
      new Request(
        `http://localhost/api/courses/harsh-other-course/modules/${module.id}/publication`,
        {
          method: 'PATCH',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ published: true }),
        },
      ),
    )

    expect(response.status).toBe(404)
    expect(module.published).toBe(false)
  })

  test('rejects visibility changes through the wrong course', async () => {
    const module = createLearningModule({
      courseId: 'harsh-original-visibility-course',
      title: 'Wrong course visibility test',
    })

    const app = createModuleAccessRoutes({
      authorizeInstructor: async () => true,
    })

    const response = await app.handle(
      new Request(
        `http://localhost/api/courses/harsh-other-course/modules/${module.id}/visibility`,
        {
          method: 'PATCH',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ visibility: 'visible' }),
        },
      ),
    )

    expect(response.status).toBe(404)
    expect(module.visibility).toBe('hidden')
  })
})
