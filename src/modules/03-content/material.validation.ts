
/**
 * Module 3: Content Management
 * Requirement: M03-FR-003
 *
 * This file checks whether an uploaded learning material
 * has an allowed file type and a valid file size.
 */

// Temporary upload limit: 20 MB.

export const MAX_MATERIAL_SIZE = 20 * 1024 * 1024

// File types allowed for learning materials.
// These cover common PDF, document, and video formats.
const allowedFileTypes = new Set([
  'application/pdf',
  'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'video/mp4',
  'video/webm',
])

// Check the uploaded file before saving it.
export function validateLearningMaterial(file: File): string | null {
  // Do not allow an empty file.
  if (file.size === 0) {
    return 'Uploaded file cannot be empty'
  }

  // Reject files that are larger than our upload limit.
  if (file.size > MAX_MATERIAL_SIZE) {
    return 'Uploaded file is too large'
  }

  // Only allow supported learning-material types.
  if (!allowedFileTypes.has(file.type.toLowerCase())) {
    return 'Unsupported file type'
  }

  // No validation errors were found.
  return null
}
