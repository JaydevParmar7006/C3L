
/**
 * Module 3: Content Management
 * Sprint 3: Instructor Material Listing API
 */

import { Elysia } from 'elysia'
import type { Database } from 'bun:sqlite'
import { getContentDatabase } from './module.service'
import { getModulesFromDatabase } from './content.database'
import { getLearningMaterialsByModule } from './material.service'
import type { ModuleAccessAuthorizer } from './module.access.routes'

export interface MaterialListRouteOptions {
  authorizeInstructor?: ModuleAccessAuthorizer

  /** Trusted server-side database dependency. */
  database?: Database
}

/**
 * Retrieve uploaded learning-material metadata.
 * Instructor authorization is denied by default.
 */
export function createMaterialListRoutes(
  options: MaterialListRouteOptions = {},
) {
  return new Elysia().get(
    '/api/courses/:courseId/modules/:moduleId/materials',
    async ({ params, request, set }) => {
      const courseId = params.courseId.trim()
      const moduleId = params.moduleId.trim()

      // Verify trusted instructor authorization.
      let authorized = false

      try {
        authorized =
          (await options.authorizeInstructor?.(
            request,
            courseId,
          )) === true
      } catch {
        authorized = false
      }

      if (!authorized) {
        set.status = 403
        return {
          error: 'Instructor authorization required.',
        }
      }

      // Validate the requested identifiers.
      if (!courseId || !moduleId) {
        set.status = 400
        return {
          error: 'Course ID and module ID are required',
        }
      }

      try {
        const database = options.database ?? getContentDatabase()
        // Verify the module belongs to the selected course.
        const parentModule = getModulesFromDatabase(
          database,
          courseId,
        ).find((module) => module.id === moduleId)

        if (!parentModule) {
          set.status = 404
          return {
            error: 'Learning module not found',
          }
        }

        // Retrieve metadata from the selected database.
        const materials = getLearningMaterialsByModule(
          courseId,
          moduleId,
          database,
        )

        set.status = 200
        return { materials }
      } catch {
        set.status = 500
        return {
          error: 'Unable to retrieve learning materials',
        }
      }
    },
  )
}

// Safe default export: authorization is denied.
export const materialListRoutes = createMaterialListRoutes()
