import { randomBytes } from 'node:crypto'
import type { AuthenticatedUser } from './content.auth'
import { authorizeCourseAccess, type ContentPolicyDependencies } from './content.policy'

export const demoCourse = { id: 'DEMO-101', title: 'Introduction to Fieldwork' }
const accounts = {
  instructor: { id: 'instructor', role: 'instructor', active: true },
  student: { id: 'student', role: 'student', active: true },
  unenrolled: { id: 'unenrolled', role: 'student', active: true },
} as const satisfies Record<string, AuthenticatedUser>
const passphrase = 'C3L-Demo-101'
const cookieName = 'c3l_content_demo_session'
const sessionSeconds = 4 * 60 * 60

function tokenFrom(request: Request) {
  return request.headers
    .get('cookie')
    ?.split(';')
    .map((cookie) => cookie.trim())
    .find((cookie) => cookie.startsWith(`${cookieName}=`))
    ?.slice(cookieName.length + 1)
}

function sessionCookie(value: string, maxAge: number) {
  return `${cookieName}=${value}; Path=/03-content; HttpOnly; SameSite=Strict; Max-Age=${maxAge}`
}

export function createDemoAuth() {
  const sessions = new Map<string, { user: AuthenticatedUser; expires: number }>()
  const policy: ContentPolicyDependencies = {
    courses: { getCourse: async (courseId) => (courseId === demoCourse.id ? demoCourse : null) },
    permissions: {
      canManage: async (user, courseId) =>
        user.id === accounts.instructor.id && courseId === demoCourse.id,
      canStudy: async (user, courseId) =>
        user.id === accounts.student.id && courseId === demoCourse.id,
    },
  }

  function revoke(request: Request) {
    const token = tokenFrom(request)
    if (token) sessions.delete(token)
  }

  function currentUser(request: Request) {
    const token = tokenFrom(request)
    if (!token) return null
    const session = sessions.get(token)
    if (!session) return null
    if (session.expires <= Date.now()) {
      sessions.delete(token)
      return null
    }
    return session.user
  }

  return {
    ...policy,
    identity: { currentUser: async (request: Request) => currentUser(request) },
    async authorize(user: AuthenticatedUser, courseId: string, action: 'manage' | 'study') {
      return (await authorizeCourseAccess(user, courseId, action, policy)).allowed
    },
    login(request: Request, username: unknown, password: unknown) {
      if (
        typeof username !== 'string' ||
        !Object.hasOwn(accounts, username) ||
        password !== passphrase
      ) {
        return null
      }
      revoke(request)
      const now = Date.now()
      for (const [token, session] of sessions) {
        if (session.expires <= now) sessions.delete(token)
      }
      const token = randomBytes(32).toString('base64url')
      sessions.set(token, {
        user: accounts[username as keyof typeof accounts],
        expires: now + sessionSeconds * 1000,
      })
      return sessionCookie(token, sessionSeconds)
    },
    logout(request: Request) {
      revoke(request)
      return sessionCookie('', 0)
    },
  }
}
