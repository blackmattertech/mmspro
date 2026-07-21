import { useMemo } from 'react'
import WorkOrderFieldInput from '../workorders/WorkOrderFieldInput'
import {
  applyBreakdownFieldChange,
  getBreakdownFieldsToRender,
} from '../../lib/workRequestBreakdownFields'

export default function WorkRequestBreakdownFields({
  schema,
  isBreakdown,
  values,
  onChange,
  disabled,
}) {
  const fields = useMemo(
    () => getBreakdownFieldsToRender(schema, isBreakdown, values),
    [schema, isBreakdown, values],
  )

  if (!isBreakdown || !fields.length) return null

  return (
    <div className="wr-breakdown-fields company-form__field--full">
      {fields.map((field) => (
        <WorkOrderFieldInput
          key={field.id}
          field={field}
          value={values[field.id]}
          onChange={(val) => onChange(applyBreakdownFieldChange(field.id, val, schema, values))}
          disabled={disabled}
        />
      ))}
    </div>
  )
}
