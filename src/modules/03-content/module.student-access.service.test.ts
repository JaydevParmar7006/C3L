
import { describe, expect, test } from 'bun:test'
import { createLearningModule } from './module.service'
import { setModulePublication } from './module.publication.service'
import { setModuleVisibility } from './module.visibility.service'
import { getStudentAccessibleModules } from './module.student-access.service'

describe('M03-FR-005 and M03-FR-006 student access', () => {
  test('only published and visible modules are accessible', async () => {
    const courseId = `harsh-student-access-${crypto.randomUUID()}`

    const draftHidden = createLearningModule({
      courseId,
      title: 'Draft hidden',
    })

    const draftVisible = createLearningModule({
      courseId,
      title: 'Draft visible',
    })

    const publishedHidden = createLearningModule({
      courseId,
      title: 'Published hidden',
    })

    const publishedVisible = createLearningModule({
      courseId,
      title: 'Published visible',
    })

    setModuleVisibility(courseId, draftVisible.id, 'visible')

    setModulePublication(courseId, publishedHidden.id, true)

    setModulePublication(courseId, publishedVisible.id, true)
    setModuleVisibility(courseId, publishedVisible.id, 'visible')

    const result = await getStudentAccessibleModules(
      new Request('http://localhost/'),
      courseId,
      async () => true,
    )

    expect(result.map((module) => module.id)).toEqual([
      publishedVisible.id,
    ])

    expect(result.some((module) => module.id === draftHidden.id)).toBe(false)
    expect(result.some((module) => module.id === draftVisible.id)).toBe(false)
    expect(result.some((module) => module.id === publishedHidden.id)).toBe(false)
  })

  test('denies access when no student authorizer is supplied', async () => {
    const courseId = `harsh-no-authorizer-${crypto.randomUUID()}`

    const module = createLearningModule({
      courseId,
      title: 'Protected module',
    })

    setModulePublication(courseId, module.id, true)
    setModuleVisibility(courseId, module.id, 'visible')

    const result = await getStudentAccessibleModules(
      new Request('http://localhost/'),
      courseId,
    )

    expect(result).toEqual([])
  })

  test('denies access when course authorization returns false', async () => {
    const courseId = `harsh-denied-student-${crypto.randomUUID()}`

    const module = createLearningModule({
      courseId,
      title: 'Restricted module',
    })

    setModulePublication(courseId, module.id, true)
    setModuleVisibility(courseId, module.id, 'visible')

    const result = await getStudentAccessibleModules(
      new Request('http://localhost/'),
      courseId,
      async () => false,
    )

    expect(result).toEqual([])
  })

  test('denies access when course authorization throws an error', async () => {
    const courseId = `harsh-error-student-${crypto.randomUUID()}`

    const module = createLearningModule({
      courseId,
      title: 'Protected module',
    })

    setModulePublication(courseId, module.id, true)
    setModuleVisibility(courseId, module.id, 'visible')

    const result = await getStudentAccessibleModules(
      new Request('http://localhost/'),
      courseId,
      async () => {
        throw new Error('Course authorization unavailable')
      },
    )

    expect(result).toEqual([])
  })

  test('returns independent copies of accessible modules', async () => {
    const courseId = `harsh-copy-test-${crypto.randomUUID()}`

    const module = createLearningModule({
      courseId,
      title: 'Copy protection test',
    })

    setModulePublication(courseId, module.id, true)
    setModuleVisibility(courseId, module.id, 'visible')

    const request = new Request('http://localhost/')
    const authorize = async () => true

    const first = await getStudentAccessibleModules(
      request,
      courseId,
      authorize,
    )

    expect(first).toHaveLength(1)

const firstModule = first[0]
if (!firstModule) {
  throw new Error('Expected an accessible module')
}

firstModule.title = 'Changed by caller'

    const second = await getStudentAccessibleModules(
      request,
      courseId,
      authorize,
    )

expect(second[0]?.title).toBe('Copy protection test')
  })
})
