
/**
 * Module 3: Content Management
 * Sprint 3: Learning Material Service
 *
 * Handles persistent learning-material metadata.
 * Supports an injectable SQLite database for
 * production, demonstration and testing environments.
 */

import type { Database } from 'bun:sqlite'

import {
  getMaterialsFromDatabase,
  getModulesFromDatabase,
  saveMaterialToDatabase,
} from './content.database'

import { getContentDatabase } from './module.service'

import type { LearningMaterial } from './material.model'

/**
 * Save metadata after a successful file upload.
 *
 * Verify that the parent module belongs to
 * the requested course before saving.
 */
export function saveLearningMaterialMetadata(
  material: LearningMaterial,
  database: Database = getContentDatabase(),
): LearningMaterial {
  const parentModule = getModulesFromDatabase(
    database,
    material.courseId,
  ).find((module) => module.id === material.moduleId)

  if (!parentModule) {
    throw new Error('Learning module not found')
  }

  saveMaterialToDatabase(database, material)

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
  database: Database = getContentDatabase(),
): LearningMaterial[] {
  if (typeof courseId !== 'string' || !courseId.trim()) {
    throw new Error('Course ID is required')
  }

  if (typeof moduleId !== 'string' || !moduleId.trim()) {
    throw new Error('Module ID is required')
  }

  const normalizedCourseId = courseId.trim()
  const normalizedModuleId = moduleId.trim()

  const parentModule = getModulesFromDatabase(
    database,
    normalizedCourseId,
  ).find((module) => module.id === normalizedModuleId)

  if (!parentModule) {
    throw new Error('Learning module not found')
  }

  return getMaterialsFromDatabase(
    database,
    normalizedCourseId,
    normalizedModuleId,
  )
}
