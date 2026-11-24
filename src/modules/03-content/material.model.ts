
/**
 * Module 3: Content Management
 * Sprint 3: Learning Material Model
 *
 * Represents uploaded learning-material metadata
 * stored persistently in SQLite.
 */

/**
 * A learning material belonging to a parent module.
 */
export interface LearningMaterial {
  id: string
  courseId: string
  moduleId: string
  filename: string
  storedFilename: string
  size: number
  mimeType: string
  uploadedAt: string
}
