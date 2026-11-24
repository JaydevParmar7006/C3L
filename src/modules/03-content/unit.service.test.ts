
import { beforeEach, describe, expect, test } from 'bun:test'
import { createLearningModule } from './module.service'
import {
  createLearningUnit,
  getLearningUnitsByModule,
} from './unit.service'
import type { LearningModule } from './module.model'

describe('Learning unit service - M03-FR-004', () => {
  let parentModule: LearningModule
  let courseId: string

  beforeEach(() => {
    courseId = crypto.randomUUID()

    parentModule = createLearningModule({
      courseId,
      title: 'Programming Fundamentals',
      description: 'Introduction to programming',
      week: 3,
      topic: 'TypeScript',
    })
  })

  test('creates a valid learning unit', () => {
    const unit = createLearningUnit({
      courseId,
      moduleId: parentModule.id,
      title: 'TypeScript Basics',
      description: 'Introduction to TypeScript',
    })

    expect(unit.id).toBeTruthy()
    expect(unit.courseId).toBe(courseId)
    expect(unit.moduleId).toBe(parentModule.id)
    expect(unit.title).toBe('TypeScript Basics')
    expect(unit.description).toBe('Introduction to TypeScript')
    expect(unit.createdAt).toBeTruthy()
  })

  test('inherits week and topic from the parent module', () => {
    const unit = createLearningUnit({
      courseId,
      moduleId: parentModule.id,
      title: 'Interfaces',
    })

    expect(unit.week).toBe(3)
    expect(unit.topic).toBe('TypeScript')
  })

  test('trims title and description', () => {
    const unit = createLearningUnit({
      courseId,
      moduleId: parentModule.id,
      title: '  TypeScript Basics  ',
      description: '  Introduction  ',
    })

    expect(unit.title).toBe('TypeScript Basics')
    expect(unit.description).toBe('Introduction')
  })

  test('allows creation without a description', () => {
    const unit = createLearningUnit({
      courseId,
      moduleId: parentModule.id,
      title: 'Functions',
    })

    expect(unit.description).toBeUndefined()
  })

  test('rejects a whitespace-only title', () => {
    expect(() =>
      createLearningUnit({
        courseId,
        moduleId: parentModule.id,
        title: '   ',
      }),
    ).toThrow('Learning unit title is required')
  })

  test('rejects an empty course ID', () => {
    expect(() =>
      createLearningUnit({
        courseId: '',
        moduleId: parentModule.id,
        title: 'Functions',
      }),
    ).toThrow('Course ID is required')
  })

  test('rejects an empty module ID', () => {
    expect(() =>
      createLearningUnit({
        courseId,
        moduleId: '',
        title: 'Functions',
      }),
    ).toThrow('Module ID is required')
  })

  test('rejects a nonexistent parent module', () => {
    expect(() =>
      createLearningUnit({
        courseId,
        moduleId: 'nonexistent-module',
        title: 'Functions',
      }),
    ).toThrow('Learning module not found')
  })

  test('rejects creation under another course', () => {
    expect(() =>
      createLearningUnit({
        courseId: crypto.randomUUID(),
        moduleId: parentModule.id,
        title: 'Functions',
      }),
    ).toThrow('Learning module not found')
  })

  test('retrieves a previously created unit', () => {
    const unit = createLearningUnit({
      courseId,
      moduleId: parentModule.id,
      title: 'Variables',
    })

    const units = getLearningUnitsByModule(
      courseId,
      parentModule.id,
    )

    expect(units).toHaveLength(1)
    expect(units[0]).toEqual(unit)
  })

  test('returns an empty list for a module without units', () => {
    expect(
      getLearningUnitsByModule(courseId, parentModule.id),
    ).toEqual([])
  })

  test('rejects retrieval from another course', () => {
    expect(() =>
      getLearningUnitsByModule(
        crypto.randomUUID(),
        parentModule.id,
      ),
    ).toThrow('Learning module not found')
  })

  test('isolates units between modules in the same course', () => {
    const secondModule = createLearningModule({
      courseId,
      title: 'Database Fundamentals',
    })

    createLearningUnit({
      courseId,
      moduleId: parentModule.id,
      title: 'TypeScript Variables',
    })

    expect(
      getLearningUnitsByModule(courseId, secondModule.id),
    ).toEqual([])
  })
})
