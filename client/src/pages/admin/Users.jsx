import { useState, useEffect } from 'react'
import { supabase } from '../../lib/supabase'

export default function Users() {
  const [users, setUsers] = useState([])

  useEffect(() => {
    supabase.from('profiles').select('*').then(({ data }) => setUsers(data || []))
  }, [])

  return (
    <div>
      <h1>Users</h1>
      <table>
        <thead><tr><th>Email</th><th>Role</th><th>Created</th></tr></thead>
        <tbody>
          {users.map(u => (
            <tr key={u.id}>
              <td>{u.email}</td>
              <td>{u.role}</td>
              <td>{new Date(u.created_at).toLocaleDateString()}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
