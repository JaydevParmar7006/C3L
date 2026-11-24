
/**
 * Module 3: Content Management
 * Sprint 3: Learning Material Service
 *
 * Handles persistent learning-material metadata.
 */

import {
  getMaterialsFromDatabase,
  saveMaterialToDatabase,
} from './content.database'

import {
  contentDatabase,
  getLearningModulesByCourse,
} from './module.service'

import type { LearningMaterial } from './material.model'

/**
 * Save metadata after a successful file upload.
 *
 * Verify that the parent module belongs to
 * the requested course before saving.
 */
export function saveLearningMaterialMetadata(
  material: LearningMaterial,
): LearningMaterial {
  const parentModule = getLearningModulesByCourse(
    material.courseId,
  ).find((module) => module.id === material.moduleId)

  if (!parentModule) {
    throw new Error('Learning module not found')
  }

  saveMaterialToDatabase(contentDatabase, material)

  return { ...material }
}

/**
 * Retrieve learning-material metadata for a module.
 *
 * Both course and module ownership are checked.
 * API callers must perform authorization before
 * calling this internal service.
 */
export function getLearningMaterialsByModule(
  courseId: string,
  moduleId: string,
): LearningMaterial[] {
  if (typeof courseId !== 'string' || !courseId.trim()) {
    throw new Error('Course ID is required')
  }

  if (typeof moduleId !== 'string' || !moduleId.trim()) {
    throw new Error('Module ID is required')
  }

  const normalizedCourseId = courseId.trim()
  const normalizedModuleId = moduleId.trim()

  const parentModule = getLearningModulesByCourse(
    normalizedCourseId,
  ).find((module) => module.id === normalizedModuleId)

  if (!parentModule) {
    throw new Error('Learning module not found')
  }

  return getMaterialsFromDatabase(
    contentDatabase,
    normalizedCourseId,
    normalizedModuleId,
  )
}
