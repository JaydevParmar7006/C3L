
import { describe, expect, test } from 'bun:test'
import {
  MAX_MATERIAL_SIZE,
  validateLearningMaterial,
} from './material.validation'

// These tests check if uploaded files are allowed.
describe('M03-FR-003: File validation', () => {
  test('accepts a supported PDF file', () => {
    // Create a small sample PDF.
    const file = new File(
      ['%PDF-1.4\nTest PDF content'],
      'lecture.pdf',
      { type: 'application/pdf' },
    )

    // A valid file should have no validation error.
    expect(validateLearningMaterial(file)).toBeNull()
  })

  test('rejects an empty file', () => {
    // Create a PDF with no content.
    const file = new File(
      [],
      'empty.pdf',
      { type: 'application/pdf' },
    )

    expect(validateLearningMaterial(file)).toBe(
      'Uploaded file cannot be empty',
    )
  })

  test('rejects an unsupported file type', () => {
    // Executable files should not be accepted.
    const file = new File(
      ['example'],
      'program.exe',
      { type: 'application/x-msdownload' },
    )

    expect(validateLearningMaterial(file)).toBe(
      'Unsupported file type',
    )
  })

  test('rejects a file larger than the upload limit', () => {
    // Create a file that is one byte larger than the limit.
    const file = new File(
      [new Uint8Array(MAX_MATERIAL_SIZE + 1)],
      'large.pdf',
      { type: 'application/pdf' },
    )

    expect(validateLearningMaterial(file)).toBe(
      'Uploaded file is too large',
    )
  })

  test('accepts a supported Word document', () => {
    // Check that Word documents are supported.
    const file = new File(
      ['Sample document'],
      'notes.docx',
      {
        type: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      },
    )

    expect(validateLearningMaterial(file)).toBeNull()
  })
})
