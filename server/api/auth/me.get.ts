export default defineEventHandler(async (event) => {
  const session = await getUserSession(event)
  const user = session.user as { id?: number, role?: string } | undefined
  if (!user) return null

  // Свой номер читателю ни к чему, а выдаёт он многое: только что пришедший по
  // нему видит, сколько людей пришло до него. Хозяйке сайта номер нужен —
  // рамки и прочее в панели выдаются по нему.
  if (user.role === 'admin') return user
  const { id: _id, ...rest } = user
  return rest
})
