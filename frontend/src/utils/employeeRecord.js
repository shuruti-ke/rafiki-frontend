export function normalizeEmployeeRecord(row) {
  const user = row?.user || row || {};
  const profile = row?.profile || {};
  const merged = {
    ...user,
    ...profile,
    user,
    profile,
  };

  return {
    ...merged,
    user_id: user.user_id || row?.user_id || "",
    name: user.name || profile.name || row?.name || "",
    email: user.email || row?.email || "",
    department: profile.department || user.department || row?.department || "",
    job_title: profile.job_title || user.job_title || row?.job_title || "",
    employment_number: profile.employment_number || row?.employment_number || "",
    displayName: user.name || user.email || profile.employment_number || "Unnamed employee",
  };
}

export function employeeDisplayName(employee) {
  return (
    employee?.displayName ||
    employee?.name ||
    employee?.email ||
    employee?.employment_number ||
    "Unnamed employee"
  );
}
