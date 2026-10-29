export default function TableEmptyRow({ colSpan = 1, className = 'company-empty', children }) {
  return (
    <tr>
      <td colSpan={Math.max(Number(colSpan) || 1, 1)} className={className}>
        {children}
      </td>
    </tr>
  )
}
