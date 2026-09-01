export function getPortalRole(email) {
  const normalized = String(email || '').trim().toLowerCase();
  if (normalized.endsWith('@connect.ust.hk')) return 'student';
  if (normalized.endsWith('@ust.hk')) return 'staff';
  return 'external';
}

export function getPortalRoleLabel(email) {
  const role = getPortalRole(email);
  if (role === 'staff') return 'Staff';
  if (role === 'student') return 'Student';
  return 'Portal user';
}
