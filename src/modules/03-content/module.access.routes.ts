
import { Elysia } from 'elysia'
import { setModulePublication } from './module.publication.service'
import { setModuleVisibility } from './module.visibility.service'

/**
 * Authorization must be supplied by a trusted integration.
 * Never derive authorization from client-supplied role headers.
 */
export type ModuleAccessAuthorizer = (
  request: Request,
  courseId: string,
) => boolean | Promise<boolean>

export interface ModuleAccessRouteOptions {
  authorizeInstructor?: ModuleAccessAuthorizer
}

/**
 * M03-FR-005 and M03-FR-006 API routes.
 *
 * Default behavior is deny-all until real Module 1
 * authentication and course authorization are integrated.
 */
export function createModuleAccessRoutes(
  options: ModuleAccessRouteOptions = {},
) {
  async function isAuthorized(
    request: Request,
    courseId: string,
  ): Promise<boolean> {
    if (!options.authorizeInstructor) return false

    try {
      return (await options.authorizeInstructor(request, courseId)) === true
    } catch {
      return false
    }
  }

  return new Elysia()
    .patch(
      '/api/courses/:courseId/modules/:moduleId/publication',
      async ({ request, params }) => {
        if (!(await isAuthorized(request, params.courseId))) {
          return Response.json(
            { error: 'Instructor authorization required.' },
            { status: 403 },
          )
        }

        let body: unknown

        try {
          body = await request.json()
        } catch {
          return Response.json(
            { error: 'Valid JSON body required.' },
            { status: 400 },
          )
        }

        if (
          typeof body !== 'object' ||
          body === null ||
          Array.isArray(body) ||
          !('published' in body) ||
          typeof body.published !== 'boolean'
        ) {
          return Response.json(
            { error: '"published" must be a boolean.' },
            { status: 400 },
          )
        }

        try {
          const module = setModulePublication(
            params.courseId,
            params.moduleId,
            body.published,
          )

          if (!module) {
            return Response.json(
              { error: 'Module not found in this course.' },
              { status: 404 },
            )
          }

          return Response.json({ module }, { status: 200 })
        } catch {
          return Response.json(
            { error: 'Invalid publication input.' },
            { status: 400 },
          )
        }
      },
    )
    .patch(
      '/api/courses/:courseId/modules/:moduleId/visibility',
      async ({ request, params }) => {
        if (!(await isAuthorized(request, params.courseId))) {
          return Response.json(
            { error: 'Instructor authorization required.' },
            { status: 403 },
          )
        }

        let body: unknown

        try {
          body = await request.json()
        } catch {
          return Response.json(
            { error: 'Valid JSON body required.' },
            { status: 400 },
          )
        }

        if (
          typeof body !== 'object' ||
          body === null ||
          Array.isArray(body) ||
          !('visibility' in body) ||
          (body.visibility !== 'visible' &&
            body.visibility !== 'hidden')
        ) {
          return Response.json(
            { error: '"visibility" must be "visible" or "hidden".' },
            { status: 400 },
          )
        }

        try {
          const module = setModuleVisibility(
            params.courseId,
            params.moduleId,
            body.visibility,
          )

          if (!module) {
            return Response.json(
              { error: 'Module not found in this course.' },
              { status: 404 },
            )
          }

          return Response.json({ module }, { status: 200 })
        } catch {
          return Response.json(
            { error: 'Invalid visibility input.' },
            { status: 400 },
          )
        }
      },
    )
}
