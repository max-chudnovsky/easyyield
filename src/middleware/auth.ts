// Middleware to check if user is in admin group
export function requireAdmin(user: any): boolean {
  return user && user.groups && user.groups.includes('admin');
}
