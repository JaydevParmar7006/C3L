/**
 * Module 3: Content Management
 * File: module.service.ts
 *
 * Purpose:
 * Create learning modules after validating their input.
 *
 * Storage:
 * Uses SQLite for persistent learning-module storage.
 * Modules remain available after server restarts.
 */

import {
  openContentDatabase,
  createContentTables,
  saveModuleToDatabase,
  getModulesFromDatabase,
} from './content.database'

import type { CreateLearningModuleInput, LearningModule } from './module.model'

import { validateCreateLearningModule } from './module.validation'

// Sprint 3: Use in-memory SQLite during tests.
// Use persistent SQLite during normal application runs.
const databasePath = Bun.env.NODE_ENV === 'test' ? ':memory:' : undefined

export const contentDatabase = openContentDatabase(databasePath)

// Ensure the learning_modules table exists.
createContentTables(contentDatabase)

/**
 * Creates a new learning module.
 *
 * @param input - Data provided for the new module.
 * @returns The newly created learning module.
 * @throws Error if validation fails.
 */
export function createLearningModule(input: CreateLearningModuleInput): LearningModule {
  // Validate input before creating anything.
  const validation = validateCreateLearningModule(input)

  // Reject invalid input with useful error messages.
  if (!validation.valid) {
    throw new Error(validation.errors.join(', '))
  }

  // Build the new learning-module object.
  const newModule: LearningModule = {
    id: crypto.randomUUID(),
    courseId: input.courseId.trim(),
    title: input.title.trim(),
    description: input.description?.trim(),
    week: input.week,
    topic: input.topic?.trim(),
    createdAt: new Date().toISOString(),

    // Sprint 2: Safe initial access state.
    published: false,
    visibility: 'hidden',
  }

  // Sprint 3: Save the new module permanently in SQLite.
  saveModuleToDatabase(contentDatabase, newModule)

  // Return the created module to the caller.
  return newModule
}

/**
 * Returns learning modules belonging to a course.
 *
 * This helper is provided for integration with
 * Jaydev's module-listing endpoint.
 *
 * @param courseId - Course identifier to filter by.
 * @returns Matching learning modules.
 */
export function getLearningModulesByCourse(courseId: string): LearningModule[] {
  return getModulesFromDatabase(contentDatabase, courseId)
}
