async function test() {
  console.log('--- Testing reorder with student token (should be 403 Forbidden) ---');
  const studentRes = await fetch('http://localhost:5000/api/content/reorder', {
    method: 'PATCH',
    headers: {
      'Content-Type': 'application/json',
      Authorization: 'Bearer test-student'
    },
    body: JSON.stringify([])
  });
  console.log('Student reorder status:', studentRes.status, await studentRes.json());

  console.log('--- Testing reorder with admin token (should be 200 OK) ---');
  const adminRes = await fetch('http://localhost:5000/api/content/reorder', {
    method: 'PATCH',
    headers: {
      'Content-Type': 'application/json',
      Authorization: 'Bearer test-admin'
    },
    body: JSON.stringify([])
  });
  console.log('Admin reorder status:', adminRes.status, await adminRes.json());
}

test().catch(console.error);
