import {
  DetailView,
  DetailSection,
  DetailGrid,
  DetailField,
} from '../shared/DetailView'
import { formatCityDisplay } from '../../lib/indiaLocations'

export function VendorDetailContent({ vendor }) {
  if (!vendor) return null

  const cityDisplay = formatCityDisplay(vendor.city, vendor.state)

  return (
    <DetailView>
      <DetailSection title="Contact">
        <DetailGrid>
          <DetailField label="Vendor ID" value={vendor.vendor_code} />
          <DetailField label="Name" value={vendor.name} />
          <DetailField label="Contact person" value={vendor.contact_person} />
          <DetailField label="Mobile" value={vendor.mobile} />
          <DetailField label="Email" value={vendor.email} fullWidth />
        </DetailGrid>
      </DetailSection>

      <DetailSection title="Address">
        <DetailGrid>
          <DetailField label="Address line 1" value={vendor.address_line1} fullWidth />
          <DetailField label="Address line 2" value={vendor.address_line2} fullWidth />
          <DetailField label="City" value={cityDisplay} />
          <DetailField label="State" value={vendor.state} />
          <DetailField label="Pincode" value={vendor.pincode} />
        </DetailGrid>
      </DetailSection>

      <DetailSection title="Taxation">
        <DetailGrid>
          <DetailField label="GSTIN" value={vendor.gstin} />
          <DetailField label="PAN" value={vendor.pan} />
        </DetailGrid>
      </DetailSection>

      <DetailSection title="Bank">
        <DetailGrid>
          <DetailField label="Bank account number" value={vendor.bank_account_number} />
          <DetailField label="Bank name" value={vendor.bank_name} />
          <DetailField label="Account name" value={vendor.account_name} />
          <DetailField label="IFSC code" value={vendor.ifsc_code} />
          <DetailField label="Branch" value={vendor.branch} fullWidth />
        </DetailGrid>
      </DetailSection>
    </DetailView>
  )
}
