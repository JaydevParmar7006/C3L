
/**
 * Module 3: Content Management
 * Sprint 3: Learning Unit Service
 *
 * Creates and retrieves learning units using
 * the shared SQLite database connection.
 */

import {
  saveUnitToDatabase,
  getUnitsFromDatabase,
} from './content.database'

import {
  contentDatabase,
  getLearningModulesByCourse,
} from './module.service'

import type {
  CreateLearningUnitInput,
  LearningUnit,
} from './unit.model'

import { validateLearningUnitInput } from './unit.validation'

/**
 * Creates a learning unit under an existing learning module.
 *
 * Validates input and verifies the parent module belongs
 * to the requested course before saving.
 */
export function createLearningUnit(
  input: CreateLearningUnitInput,
): LearningUnit {
  const validationError = validateLearningUnitInput(input)

  if (validationError) {
    throw new Error(validationError)
  }

  const courseId = input.courseId.trim()
  const moduleId = input.moduleId.trim()

  // Verify that the parent module belongs to this course.
  const parentModule = getLearningModulesByCourse(courseId)
    .find((module) => module.id === moduleId)

  if (!parentModule) {
    throw new Error('Learning module not found')
  }

  // Create the learning unit.
  const newUnit: LearningUnit = {
    id: crypto.randomUUID(),
    courseId,
    moduleId,
    title: input.title.trim(),
    ...(input.description !== undefined && {
      description: input.description.trim(),
    }),
    createdAt: new Date().toISOString(),
    ...(parentModule.week !== undefined && {
      week: parentModule.week,
    }),
    ...(parentModule.topic !== undefined && {
      topic: parentModule.topic,
    }),
  }

  // Persist the unit using the shared SQLite connection.
  saveUnitToDatabase(contentDatabase, newUnit)

  return newUnit
}

/**
 * Retrieves learning units belonging to a specific
 * course and parent module.
 */
export function getLearningUnitsByModule(
  courseId: string,
  moduleId: string,
): LearningUnit[] {
  if (typeof courseId !== 'string' || !courseId.trim()) {
    throw new Error('Course ID is required')
  }

  if (typeof moduleId !== 'string' || !moduleId.trim()) {
    throw new Error('Module ID is required')
  }

  const normalizedCourseId = courseId.trim()
  const normalizedModuleId = moduleId.trim()

  // Verify the parent module exists in the requested course.
  const parentModule = getLearningModulesByCourse(normalizedCourseId)
    .find((module) => module.id === normalizedModuleId)

  if (!parentModule) {
    throw new Error('Learning module not found')
  }

  return getUnitsFromDatabase(
    contentDatabase,
    normalizedCourseId,
    normalizedModuleId,
  )
}
