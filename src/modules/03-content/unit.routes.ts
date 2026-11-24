
/**
 * Module 3: Content Management
 * Sprint 3: Learning Unit API Routes
 *
 * Supports M03-FR-004 through learning units
 * organized under parent learning modules.
 */

import { Elysia } from 'elysia'
import type { ModuleAccessAuthorizer } from './module.access.routes'
import {
  createLearningUnit,
  getLearningUnitsByModule,
} from './unit.service'

export interface UnitRouteOptions {
  authorizeInstructor?: ModuleAccessAuthorizer
}

/**
 * Creates protected instructor learning-unit routes.
 *
 * Access is denied by default unless trusted
 * instructor authorization is supplied.
 */
export function createUnitRoutes(
  options: UnitRouteOptions = {},
) {
  async function isAuthorized(
    request: Request,
    courseId: string,
  ): Promise<boolean> {
    if (!options.authorizeInstructor) return false

    try {
      return (
        await options.authorizeInstructor(request, courseId)
      ) === true
    } catch {
      return false
    }
  }

  return new Elysia()
    .post(
      '/api/courses/:courseId/modules/:moduleId/units',
      async ({ request, params }) => {
        const courseId = params.courseId.trim()
        const moduleId = params.moduleId.trim()

        // Authorize before reading the request body.
        if (!(await isAuthorized(request, courseId))) {
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
          !('title' in body) ||
          typeof body.title !== 'string' ||
          !body.title.trim()
        ) {
          return Response.json(
            { error: 'Learning unit title is required' },
            { status: 400 },
          )
        }

        const description =
          'description' in body ? body.description : undefined

        if (
          description !== undefined &&
          typeof description !== 'string'
        ) {
          return Response.json(
            { error: 'Description must be a string' },
            { status: 400 },
          )
        }

        if (!courseId || !moduleId) {
          return Response.json(
            { error: 'Course ID and module ID are required' },
            { status: 400 },
          )
        }

        try {
          const unit = createLearningUnit({
            courseId,
            moduleId,
            title: body.title,
            ...(description !== undefined && { description }),
          })

          return Response.json({ unit }, { status: 201 })
        } catch (error) {
          if (
            error instanceof Error &&
            error.message === 'Learning module not found'
          ) {
            return Response.json(
              { error: 'Learning module not found' },
              { status: 404 },
            )
          }

          return Response.json(
            { error: 'Unable to create learning unit' },
            { status: 500 },
          )
        }
      },
      { parse: 'none' },
    )
    .get(
      '/api/courses/:courseId/modules/:moduleId/units',
      async ({ request, params }) => {
        const courseId = params.courseId.trim()
        const moduleId = params.moduleId.trim()

        if (!(await isAuthorized(request, courseId))) {
          return Response.json(
            { error: 'Instructor authorization required.' },
            { status: 403 },
          )
        }

        if (!courseId || !moduleId) {
          return Response.json(
            { error: 'Course ID and module ID are required' },
            { status: 400 },
          )
        }

        try {
          const units = getLearningUnitsByModule(
            courseId,
            moduleId,
          )

          return Response.json({ units }, { status: 200 })
        } catch (error) {
          if (
            error instanceof Error &&
            error.message === 'Learning module not found'
          ) {
            return Response.json(
              { error: 'Learning module not found' },
              { status: 404 },
            )
          }

          return Response.json(
            { error: 'Unable to retrieve learning units' },
            { status: 500 },
          )
        }
      },
    )
}
