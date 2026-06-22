import pb from '@/lib/pocketbase/client'

export const requestPasswordReset = (email: string) => {
  return pb.collection('users').requestPasswordReset(email)
}

export const confirmPasswordReset = (token: string, password: string, passwordConfirm: string) => {
  return pb.collection('users').confirmPasswordReset(token, password, passwordConfirm)
}

export const updateProfile = (id: string, data: Record<string, any> | FormData) => {
  return pb.collection('users').update(id, data)
}
