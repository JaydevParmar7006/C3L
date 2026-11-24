
import { Elysia } from 'elysia'
import { unlink } from 'node:fs/promises'
import { getLearningModulesByCourse } from './module.service'
import { saveLearningMaterial } from './material.storage'
import { validateLearningMaterial } from './material.validation'
import { saveLearningMaterialMetadata } from './material.service'
import type { LearningMaterial } from './material.model'
import type { ModuleAccessAuthorizer } from './module.access.routes'

export interface MaterialUploadRouteOptions {
  authorizeInstructor?: ModuleAccessAuthorizer

  /** Trusted server configuration, never taken from request data. */
  uploadDirectory?: string
}

/**
 * Handles learning material uploads and SQLite metadata persistence.
 * Instructor authorization is denied by default.
 */
export function createMaterialUploadRoutes(
  options: MaterialUploadRouteOptions = {},
) {
  return new Elysia().post(
    '/api/courses/:courseId/modules/:moduleId/materials',
    async ({ params, request, set }) => {
      const { courseId, moduleId } = params

      // Verify trusted instructor authorization.
      let authorized = false

      try {
        authorized =
          (await options.authorizeInstructor?.(request, courseId)) === true
      } catch {
        authorized = false
      }

      if (!authorized) {
        set.status = 403
        return { error: 'Instructor authorization required.' }
      }

      // Verify that the module belongs to the requested course.
      const module = getLearningModulesByCourse(courseId).find(
        (item) => item.id === moduleId,
      )

      if (!module) {
        set.status = 404
        return { error: 'Learning module not found' }
      }

      // Require multipart form data.
      const contentType = request.headers.get('content-type') ?? ''

      if (!contentType.toLowerCase().startsWith('multipart/form-data;')) {
        set.status = 400
        return { error: 'Request must contain multipart form data' }
      }

      // Read the uploaded form safely.
      let form: Awaited<ReturnType<typeof request.formData>>

      try {
        form = await request.formData()
      } catch {
        set.status = 400
        return { error: 'Invalid upload form data' }
      }

      // Retrieve the uploaded file.
      const file = form.get('file')

      if (!(file instanceof File)) {
        set.status = 400
        return { error: 'A file is required' }
      }

      // Validate file size and supported file type.
      const validationError = validateLearningMaterial(file)

      if (validationError) {
        set.status = 400
        return { error: validationError }
      }

      // Track the saved file for cleanup if persistence fails.
      let savedFilePath: string | undefined

      try {
        // Save the actual file contents to disk.
        const savedFile = await saveLearningMaterial(
          file,
          options.uploadDirectory,
        )

        savedFilePath = savedFile.filePath

        // Create metadata for the uploaded learning material.
        const material: LearningMaterial = {
          id: crypto.randomUUID(),
          courseId,
          moduleId,
          filename: file.name,
          storedFilename: savedFile.storedFilename,
          size: file.size,
          mimeType: file.type,
          uploadedAt: new Date().toISOString(),
        }

        // Persist material metadata in SQLite.
        const persistedMaterial = saveLearningMaterialMetadata(material)

        // Return success only after file and metadata are saved.
        set.status = 201
        return { material: persistedMaterial }
      } catch {
        // Remove the uploaded file if metadata persistence fails.
        if (savedFilePath) {
          try {
            await unlink(savedFilePath)
          } catch (cleanupError) {
            // Record cleanup failures without exposing paths to clients.
            console.error(
              'Unable to clean up failed material upload',
              cleanupError,
            )
          }
        }

        // Preserve the existing upload error response.
        set.status = 500
        return { error: 'Unable to save uploaded file' }
      }
    },
    { parse: 'none' },
  )
}

// Retain the existing export with safe default authorization.
export const materialUploadRoutes = createMaterialUploadRoutes()
