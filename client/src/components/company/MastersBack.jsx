import { useOrg } from '../../hooks/useOrg'
import { orgPath } from '../../config/navigation'
import PageBack from '../shared/PageBack'

export default function MastersBack({ label = 'Masters' }) {
  const { org } = useOrg()
  if (!org?.slug) return null
  return <PageBack to={orgPath(org.slug, 'masters')} label={label} />
}
